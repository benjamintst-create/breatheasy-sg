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

  // Accumulate exhaust from ALL nearby roads (not just closest)
  let totalExhaust = 0;

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
      // LTA speedBand is absolute speed, not relative
      if (frc <= 1) {
        congestion = Math.min(1, band.speedBand / 8);
      } else {
        congestion = band.speedBand <= 2 ? 0.4 : band.speedBand <= 4 ? 0.7 : 0.95;
      }
    }

    const volume = roadVolumeBaseline(frc);
    const emission = congestionEmissionMultiplier(congestion);
    totalExhaust += volume * emission * distanceFactor;
  }

  // Scale: max ~4.5 points penalty
  const penalty = Math.min(4.5, totalExhaust * 1.5);
  return Math.round(penalty * 10) / 10;
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
  const trafficMod = speedBands ? trafficModifier(lat, lng, speedBands) : 0;

  const raw = staticBase + pm25Mod + windMod + timeMod + rainMod + trafficMod;
  const score = Math.max(1, Math.min(10, Math.round(raw * 10) / 10));
  const band = getBand(score);

  return {
    score, band: band.band, label: band.label, color: band.color,
    trafficMod: Math.round(trafficMod * 10) / 10,
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
    100 - (avgTrafficMod * 0.6 + maxTrafficMod * 0.4) * 22
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

  const overall = Math.round(trafficPct * 0.4 + airPct * 0.3 + greenPct * 0.2 + consistencyPct * 0.1);

  const factors: RouteRating["factors"] = [
    { label: "Traffic Exposure", pct: trafficPct,
      detail: trafficPct >= 80 ? "Minimal road exhaust exposure" : trafficPct >= 60 ? "Some road-adjacent stretches" : trafficPct >= 40 ? "Significant traffic exposure" : "Heavy traffic along much of the route" },
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
