// ============================================================
// BreathEasy SG — Types (v2: route-first)
// ============================================================

export interface LatLng {
  lat: number;
  lng: number;
}

export type ScoreBand = "excellent" | "good" | "moderate" | "poor" | "hazardous";

// ── Grid (static base scores from road/park proximity) ──

export interface GridCell {
  lat: number;
  lng: number;
  base: number;
}

export interface StaticGrid {
  resolution_m: number;
  bounds: { lat_min: number; lat_max: number; lng_min: number; lng_max: number };
  cells: GridCell[];
}

// ── Real-time conditions ──

export interface CurrentConditions {
  pm25: { value: number; band: ScoreBand; regions: Record<string, number> };
  wind: { speed: number; direction: string };
  temperature: number;
  rainfall: { isRaining: boolean; intensity: string };
  humidity: number;
  timestamp: string;
}

export interface TrafficSpeedBand {
  linkId: string;
  roadName: string;
  speedBand: number;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  frc?: number;              // TomTom FRC: 0=motorway, 1=first class... 7=local
  congestionRatio?: number;  // currentSpeed/freeFlowSpeed: 1.0=free, 0=stopped
}

// ── Scoring ──

export interface ScoreResult {
  score: number;
  band: ScoreBand;
  label: string;
  color: string;
  breakdown: {
    staticBase: number;
    pm25Modifier: number;
    windModifier: number;
    timeModifier: number;
    rainModifier: number;
    trafficModifier: number;
  };
  recommendation: string;
}

// ── Route (scored at 50m intervals) ──

export interface ScoredPoint {
  lat: number;
  lng: number;
  distanceM: number;  // cumulative metres from start
  score: number;
  color: string;
  band: ScoreBand;
  trafficMod?: number;  // raw traffic penalty for this point
}

export interface RouteRating {
  overall: number;
  trafficExposure: number;
  airQuality: number;
  greenCorridor: number;
  consistency: number;
  summary: string;
  factors: { label: string; pct: number; detail: string }[];
}

export interface AnalyzedRoute {
  id: string;
  name: string;
  distance: string;
  distanceM: number;
  elevationGain: number;
  pointCount: number;
  coordinates: LatLng[];        // full parsed coords (for map display)
  scoredPoints: ScoredPoint[];  // scored at 50m intervals
  rating: RouteRating;
  conditions: {
    pm25: number;
    wind: number;
    temp: number;
    rain: string;
  };
  analyzedAt: string;           // ISO timestamp
}

/** Compact version stored in localStorage */
export interface SavedRoute {
  id: string;
  name: string;
  distance: string;
  distanceM: number;
  elevationGain: number;
  rating: RouteRating;
  conditions: { pm25: number; wind: number; temp: number; rain: string };
  analyzedAt: string;
  /** Downsampled to ~150 points for display */
  coordinates: LatLng[];
  /** Downsampled scored points for color display */
  scoredPoints: ScoredPoint[];
}
