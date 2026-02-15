// ============================================================
// BreathEasy SG — Scoring Engine (v3: exhaust-volume model)
// ============================================================
//
// Key insight: what matters for runners is EXHAUST VOLUME, not speed.
// Exhaust volume = traffic_volume × emissions_per_vehicle
//
// Traffic volume is proxied by road class (FRC):
//   Expressway (FRC0-1) → always high volume
//   Arterial (FRC2-3) → medium volume
//   Local (FRC4-7) → low volume
//
// Congestion multiplies per-vehicle emissions (idling ≈ 2-3× flowing):
//   congestionRatio < 0.4 → 2.5× emissions/car
//   congestionRatio 0.7-0.9 → 1.2× emissions/car
//   congestionRatio > 0.9 → 1.0× emissions/car
//
// Final exhaust penalty = road_volume × congestion_multiplier × distance_decay

import type {
  ScoreBand, CurrentConditions, TrafficSpeedBand,
  GridCell, StaticGrid, ScoredPoint, RouteRating,
} from "@/types";

const BANDS: { max: number; band: ScoreBand; label: string; color: string }[] = [
  { max: 2, band: "excellent", label: "Excellent", color: "#4ecdc4" },
  { max: 3.5, band: "good", label: "Good", color: "#a8e6a3" },
  { max: 5, band: "moderate", label: "Fair", color: "#f7d794" },
  { max: 7, band: "poor", label: "Poor", color: "#f8a978" },
  { max: 10, band: "hazardous", label: "Avoid", color: "#fc5c65" },
];

export function getBand(score: number) {
  return BANDS.find((b) => score <= b.max) ?? BANDS[BANDS.length - 1];
}

// ── Weather & time modifiers ──

function pm25Modifier(pm25: number): number {
  if (pm25 <= 12) return 0;
  if (pm25 <= 25) return 0.5;
  if (pm25 <= 37) return 1.0;
  if (pm25 <= 55) return 2.0;
  if (pm25 <= 75) return 3.0;
  return 4.0;
}

function windModifier(speedKmh: number): number {
  if (speedKmh >= 20) return -1.0;
  if (speedKmh >= 12) return -0.5;
  if (speedKmh >= 6) return 0;
  if (speedKmh >= 2) return 0.3;
  return 0.5;
}

function timeModifier(hour: number): number {
  if (hour >= 7 && hour <= 9) return 1.5;
  if (hour >= 17 && hour <= 19) return 1.5;
  if (hour >= 6 && hour <= 10) return 0.8;
  if (hour >= 16 && hour <= 20) return 0.8;
  if (hour >= 0 && hour <= 5) return -0.5;
  return 0.3;
}

function rainModifier(isRaining: boolean, intensity: string): number {
  if (!isRaining) return 0;
  if (intensity === "Heavy") return -2.0;
  if (intensity === "Moderate") return -1.5;
  if (intensity === "Light") return -1.0;
  return -0.5;
}

// ── Traffic / Exhaust Model ──

const DEG_TO_M = 111320;
const TRAFFIC_RADIUS = 400;

const EXPRESSWAYS = ["AYE", "PIE", "CTE", "ECP", "KPE", "SLE", "TPE", "BKE", "MCE", "KJE"];

function inferFrcFromRoadName(name: string): number {
  if (!name) return 3;
  const upper = name.toUpperCase();
  if (EXPRESSWAYS.some(e => upper.includes(e))) return 0;
  if (upper.includes("EXPRESSWAY") || upper.includes("HIGHWAY")) return 0;
  return 2; // LTA bands are typically major roads
}

function roadVolumeBaseline(frc: number): number {
  if (frc <= 1) return 1.0;
  if (frc <= 2) return 0.7;
  if (frc <= 3) return 0.5;
  if (frc <= 4) return 0.25;
  if (frc <= 5) return 0.12;
  return 0.05;
}

function congestionEmissionMultiplier(congestionRatio: number): number {
  if (congestionRatio < 0.25) return 3.0;
  if (congestionRatio < 0.4) return 2.5;
  if (congestionRatio < 0.6) return 1.8;
  if (congestionRatio < 0.8) return 1.3;
  if (congestionRatio < 0.95) return 1.1;
  return 1.0;
}

function pointToSegmentDist(
  px: number, py: number,
  ax: number, ay: number, bx: number, by: number,
  cosLat: number
): number {
  const dx = (bx - ax) * DEG_TO_M * cosLat;
  const dy = (by - ay) * DEG_TO_M;
  const lenSq = dx * dx + dy * dy;
  const ex = (px - ax) * DEG_TO_M * cosLat;
  const ey = (py - ay) * DEG_TO_M;
  if (lenSq === 0) return Math.sqrt(ex * ex + ey * ey);
  const t = Math.max(0, Math.min(1, (ex * dx + ey * dy) / lenSq));
  const projX = ex - t * dx;
  const projY = ey - t * dy;
  return Math.sqrt(projX * projX + projY * projY);
}

function trafficModifier(lat: number, lng: number, speedBands: TrafficSpeedBand[]): number {
  if (!speedBands || speedBands.length === 0) return 0;
  const cosLat = Math.cos((lat * Math.PI) / 180);

  // Find the WORST nearby road (highest exhaust), not accumulate
  // Group by road identity (same frc + same congestion = same road)
  let worstExhaust = 0;

  for (const band of speedBands) {
    if (!band.startLat || !band.startLng) continue;
    const dist = pointToSegmentDist(
      lat, lng,
      band.startLat, band.startLng, band.endLat, band.endLng,
      cosLat
    );
    if (dist >= TRAFFIC_RADIUS) continue;

    const distanceFactor = 1 - dist / TRAFFIC_RADIUS;
    const frc = band.frc ?? inferFrcFromRoadName(band.roadName);

    let congestion: number;
    if (band.congestionRatio !== undefined) {
      congestion = band.congestionRatio;
    } else {
      if (frc <= 1) {
        congestion = Math.min(1, band.speedBand / 8);
      } else {
        congestion = band.speedBand <= 2 ? 0.4 : band.speedBand <= 4 ? 0.7 : 0.95;
      }
    }

    const volume = roadVolumeBaseline(frc);
    const emission = congestionEmissionMultiplier(congestion);
    const exhaust = volume * emission * distanceFactor;
    if (exhaust > worstExhaust) worstExhaust = exhaust;
  }

  // Scale: worstExhaust of 1.0 = expressway at point blank free flow
  // Max penalty ~4.0 for jammed expressway right next to you
  const penalty = Math.min(4.0, worstExhaust * 3.5);
  return Math.round(penalty * 10) / 10;
}

// ── Industrial Zone Model ──
// Industrial estates have heavy vehicles (trucks/lorries), diesel fumes,
// and factory emissions beyond what road class alone captures.

const INDUSTRIAL_ZONES: { name: string; ring: [number, number][] }[] = [
  { name: "Jurong Industrial Estate", ring: [[103.690,1.310],[103.720,1.308],[103.725,1.320],[103.720,1.335],[103.705,1.338],[103.690,1.330]] },
  { name: "Tuas Industrial", ring: [[103.620,1.310],[103.650,1.308],[103.655,1.320],[103.650,1.335],[103.630,1.338],[103.618,1.325]] },
  { name: "Woodlands Industrial", ring: [[103.770,1.432],[103.785,1.430],[103.790,1.438],[103.785,1.445],[103.772,1.442]] },
  { name: "Changi Business Park", ring: [[103.960,1.330],[103.975,1.328],[103.980,1.338],[103.972,1.342],[103.960,1.340]] },
  { name: "Paya Lebar Industrial", ring: [[103.885,1.340],[103.895,1.338],[103.900,1.345],[103.895,1.350],[103.885,1.348]] },
  { name: "Kallang/Kolam Ayer Industrial", ring: [[103.868,1.318],[103.878,1.316],[103.882,1.324],[103.876,1.328],[103.868,1.326]] },
  { name: "Senoko Industrial", ring: [[103.795,1.445],[103.810,1.443],[103.815,1.450],[103.808,1.455],[103.795,1.452]] },
  { name: "Tanjong Kling Industrial", ring: [[103.728,1.278],[103.740,1.276],[103.745,1.282],[103.738,1.286],[103.728,1.284]] },
];

const INDUSTRIAL_BUFFER_M = 300; // fumes drift beyond estate boundaries

function pointInPolygon(lat: number, lng: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function distToPolygonEdge(lat: number, lng: number, ring: [number, number][], cosLat: number): number {
  let minDist = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const d = pointToSegmentDist(lat, lng, ring[i][1], ring[i][0], ring[j][1], ring[j][0], cosLat);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

/** Returns industrial modifier: penalty addition + traffic multiplier */
function industrialModifier(lat: number, lng: number, cosLat: number): { addition: number; multiplier: number } {
  for (const zone of INDUSTRIAL_ZONES) {
    if (pointInPolygon(lat, lng, zone.ring)) {
      // Inside industrial zone: baseline pollution + amplify any traffic penalty
      return { addition: 1.2, multiplier: 1.8 };
    }
    const dist = distToPolygonEdge(lat, lng, zone.ring, cosLat);
    if (dist < INDUSTRIAL_BUFFER_M) {
      const factor = 1 - dist / INDUSTRIAL_BUFFER_M;
      return { addition: 0.8 * factor, multiplier: 1 + 0.6 * factor };
    }
  }
  return { addition: 0, multiplier: 1 };
}

// ── Grid lookup ──

export function findNearestCell(lat: number, lng: number, grid: StaticGrid): GridCell | null {
  if (!grid || !grid.cells.length) return null;
  let closest: GridCell | null = null;
  let minDist = Infinity;
  for (const cell of grid.cells) {
    const d = Math.abs(cell.lat - lat) + Math.abs(cell.lng - lng);
    if (d < minDist) { minDist = d; closest = cell; }
    if (d < 0.00001) break;
  }
  return closest;
}

// ── Score a single point ──

export function computeScore(
  lat: number, lng: number,
  conditions: CurrentConditions | null,
  grid: StaticGrid | null,
  hour?: number,
  speedBands?: TrafficSpeedBand[]
) {
  const currentHour = hour ?? new Date().getHours();
  let staticBase = 3.0;
  if (grid) {
    const cell = findNearestCell(lat, lng, grid);
    if (cell) staticBase = cell.base;
  }

  const pm25Mod = conditions ? pm25Modifier(conditions.pm25.value) : 0;
  const windMod = conditions ? windModifier(conditions.wind.speed) : 0;
  const timeMod = timeModifier(currentHour);
  const rainMod = conditions ? rainModifier(conditions.rainfall.isRaining, conditions.rainfall.intensity) : 0;
  const baseTrafMod = speedBands ? trafficModifier(lat, lng, speedBands) : 0;

  // Industrial zones: add baseline industrial pollution + amplify traffic penalty
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const indust = industrialModifier(lat, lng, cosLat);
  const trafficMod = Math.min(4.5, baseTrafMod * indust.multiplier + indust.addition);

  const raw = staticBase + pm25Mod + windMod + timeMod + rainMod + trafficMod;
  const score = Math.max(1, Math.min(10, Math.round(raw * 10) / 10));
  const band = getBand(score);

  return {
    score, band: band.band, label: band.label, color: band.color,
    trafficMod: Math.round(trafficMod * 10) / 10,
    isIndustrial: indust.addition > 0,
    breakdown: {
      staticBase: Math.round(staticBase * 10) / 10,
      pm25Modifier: Math.round(pm25Mod * 10) / 10,
      windModifier: Math.round(windMod * 10) / 10,
      timeModifier: Math.round(timeMod * 10) / 10,
      rainModifier: Math.round(rainMod * 10) / 10,
      trafficModifier: Math.round(trafficMod * 10) / 10,
    },
    recommendation: "",
  };
}

// ── Score route at 50m intervals ──

export function scoreRoutePoints(
  interpolated: { lat: number; lng: number; distanceM: number }[],
  conditions: CurrentConditions | null,
  grid: StaticGrid | null,
  speedBands: TrafficSpeedBand[]
): ScoredPoint[] {
  return interpolated.map(p => {
    const r = computeScore(p.lat, p.lng, conditions, grid, undefined, speedBands);
    return {
      lat: p.lat, lng: p.lng, distanceM: p.distanceM,
      score: r.score, color: r.color, band: r.band,
      trafficMod: r.trafficMod,
      industrialZone: r.isIndustrial,
    };
  });
}

// ── Route Rating ──

export function rateRoute(
  scoredPoints: ScoredPoint[],
  grid: StaticGrid | null
): RouteRating {
  if (scoredPoints.length === 0) {
    return { overall: 50, trafficExposure: 50, airQuality: 50, greenCorridor: 50, consistency: 50, summary: "No data", factors: [] };
  }

  const scores = scoredPoints.map(s => s.score);
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

  const basescores = scoredPoints.map(p => {
    if (!grid) return 3;
    const cell = findNearestCell(p.lat, p.lng, grid);
    return cell ? cell.base : 3;
  });

  // Traffic Exposure (40%)
  const trafficMods = scoredPoints.map(p => p.trafficMod ?? 0);
  const avgTrafficMod = trafficMods.reduce((a, b) => a + b, 0) / trafficMods.length;
  const maxTrafficMod = Math.max(...trafficMods);
  const trafficPct = Math.round(Math.max(0, Math.min(100,
    100 - (avgTrafficMod * 0.6 + maxTrafficMod * 0.4) * 25
  )));

  // Air Quality (30%)
  const airPct = Math.round(Math.max(0, Math.min(100, ((10 - avgScore) / 9) * 100)));

  // Green Corridor (20%)
  const greenCount = basescores.filter(b => b <= 1.5).length;
  const parkCount = basescores.filter(b => b <= 2.5).length;
  const greenPct = Math.round(Math.min(100,
    (greenCount / basescores.length) * 100 * 0.7 +
    (parkCount / basescores.length) * 100 * 0.3
  ));

  // Consistency (10%)
  const variance = scores.reduce((sum, s) => sum + (s - avgScore) ** 2, 0) / scores.length;
  const stdDev = Math.sqrt(variance);
  const consistencyPct = Math.round(Math.max(0, Math.min(100, (1 - stdDev / 3) * 100)));

  // Industrial zone exposure
  const industrialCount = scoredPoints.filter(p => p.industrialZone).length;
  const industrialPct = Math.round((industrialCount / scoredPoints.length) * 100);

  const overall = Math.round(trafficPct * 0.4 + airPct * 0.3 + greenPct * 0.2 + consistencyPct * 0.1);

  const trafficDetail = trafficPct >= 80 ? "Minimal road exhaust exposure" : trafficPct >= 60 ? "Some road-adjacent stretches" : trafficPct >= 40 ? "Significant traffic exposure" : "Heavy traffic along much of the route";
  const industrialNote = industrialPct > 0 ? ` (${industrialPct}% near industrial zones)` : "";

  const factors: RouteRating["factors"] = [
    { label: "Traffic Exposure", pct: trafficPct,
      detail: trafficDetail + industrialNote },
    { label: "Air Quality", pct: airPct,
      detail: airPct >= 80 ? "Clean air throughout" : airPct >= 60 ? "Generally good air" : airPct >= 40 ? "Moderate pollution levels" : "Poor air quality conditions" },
    { label: "Green Corridor", pct: greenPct,
      detail: greenPct >= 80 ? "Mostly through parks and green space" : greenPct >= 60 ? "Good mix of greenery" : greenPct >= 40 ? "Some green sections" : "Mostly urban, limited greenery" },
    { label: "Consistency", pct: consistencyPct,
      detail: consistencyPct >= 80 ? "Even conditions throughout" : consistencyPct >= 60 ? "Mostly consistent" : consistencyPct >= 40 ? "Some bad patches along the way" : "Quality varies a lot — expect bad stretches" },
  ];

  let summary: string;
  if (overall >= 85) summary = "Excellent route — clean air, low traffic, great for hard efforts.";
  else if (overall >= 70) summary = "Good route for running with minor compromises.";
  else if (overall >= 55) summary = "Decent but has some traffic or pollution exposure.";
  else if (overall >= 40) summary = "Below average — consider alternatives if available.";
  else summary = "Poor conditions — heavy traffic and pollution exposure.";

  const worst = [...factors].sort((a, b) => a.pct - b.pct)[0];
  if (worst.pct < 60) summary += ` Main concern: ${worst.detail.toLowerCase()}.`;

  return { overall, trafficExposure: trafficPct, airQuality: airPct, greenCorridor: greenPct, consistency: consistencyPct, summary, factors };
}
