// ============================================================
// BreathEasy SG — Scoring Engine (v2: route-first)
// ============================================================

import type {
  ScoreBand, CurrentConditions, TrafficSpeedBand,
  GridCell, StaticGrid, LatLng, ScoreResult,
  ScoredPoint, RouteRating,
} from "@/types";

// ── Score bands ──

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

// ── Modifiers ──

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

const DEG_TO_M = 111320;

function trafficModifier(lat: number, lng: number, speedBands: TrafficSpeedBand[]): number {
  if (!speedBands || speedBands.length === 0) return 0;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  let bestDist = Infinity;
  let bestBand = 8;

  for (const band of speedBands) {
    if (!band.startLat || !band.startLng) continue;
    const midLat = (band.startLat + band.endLat) / 2;
    const midLng = (band.startLng + band.endLng) / 2;
    const dLat = (lat - midLat) * DEG_TO_M;
    const dLng = (lng - midLng) * DEG_TO_M * cosLat;
    const dist = Math.sqrt(dLat * dLat + dLng * dLng);
    if (dist < 200 && dist < bestDist) {
      bestDist = dist;
      bestBand = band.speedBand;
    }
  }

  if (bestDist === Infinity) return 0;
  const distanceFactor = 1 - bestDist / 200;
  let congestionPenalty: number;
  if (bestBand <= 2) congestionPenalty = 3.0;
  else if (bestBand <= 4) congestionPenalty = 2.0;
  else if (bestBand <= 6) congestionPenalty = 1.0;
  else congestionPenalty = 0;

  return Math.round(congestionPenalty * distanceFactor * 10) / 10;
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
): ScoreResult {
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

// ── Score an entire route at 50m intervals ──

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
    };
  });
}

// ── Route Rating ──
// Weights: Traffic 40%, Air 30%, Green 20%, Consistency 10%

export function rateRoute(
  scoredPoints: ScoredPoint[],
  grid: StaticGrid | null
): RouteRating {
  if (scoredPoints.length === 0) {
    return { overall: 50, trafficExposure: 50, airQuality: 50, greenCorridor: 50, consistency: 50, summary: "No data", factors: [] };
  }

  // Get base scores for green corridor
  const basescores = scoredPoints.map(p => {
    if (!grid) return 3;
    const cell = findNearestCell(p.lat, p.lng, grid);
    return cell ? cell.base : 3;
  });

  // 1. Traffic Exposure (40%) — infer from score variance vs base
  // Points near congested roads have higher scores
  const scores = scoredPoints.map(s => s.score);
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

  // Estimate traffic contribution: difference between score and what it would be without traffic
  // We approximate by looking at how many points have scores significantly above their base
  const trafficContributions = scoredPoints.map((p, i) => {
    const base = basescores[i];
    const excess = Math.max(0, p.score - base - 1.5); // 1.5 accounts for pm25+time+wind
    return Math.min(excess / 3, 1); // normalize 0-1
  });
  const avgTrafficExposure = trafficContributions.reduce((a, b) => a + b, 0) / trafficContributions.length;
  const maxTrafficExposure = Math.max(...trafficContributions);
  const trafficPct = Math.round(Math.max(0, Math.min(100,
    100 - (avgTrafficExposure * 0.7 + maxTrafficExposure * 0.3) * 100
  )));

  // 2. Air Quality (30%) — score 1=100%, 10=0%
  const airPct = Math.round(Math.max(0, Math.min(100, ((10 - avgScore) / 9) * 100)));

  // 3. Green Corridor (20%)
  const greenCount = basescores.filter(b => b <= 1.5).length;
  const parkCount = basescores.filter(b => b <= 2.5).length;
  const greenPct = Math.round(Math.min(100,
    (greenCount / basescores.length) * 100 * 0.7 +
    (parkCount / basescores.length) * 100 * 0.3
  ));

  // 4. Consistency (10%)
  const mean = avgScore;
  const variance = scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / scores.length;
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
