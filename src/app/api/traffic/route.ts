import { NextResponse } from "next/server";
import { fetchTrafficSpeedBands } from "@/lib/api";

export const dynamic = "force-dynamic";

// ── TomTom Flow Segment Data for a single point ──
interface TomTomSegment {
  frc: string;  // "FRC0" to "FRC7"
  currentSpeed: number;
  freeFlowSpeed: number;
  confidence: number;
  roadClosure: boolean;
  coordinates: { coordinate: { latitude: number; longitude: number }[] };
}

async function fetchTomTomSegment(lat: number, lng: number, apiKey: string): Promise<TomTomSegment | null> {
  try {
    const url = `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/15/json?key=${apiKey}&point=${lat},${lng}&unit=KMPH`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    return data.flowSegmentData ?? null;
  } catch {
    return null;
  }
}

// Convert TomTom segment to multiple sub-segments using all intermediate coords
function tomtomToSpeedBands(seg: TomTomSegment): {
  startLat: number; startLng: number; endLat: number; endLng: number;
  speedBand: number; roadName: string;
  frc?: number; congestionRatio?: number;
}[] {
  const coords = seg.coordinates?.coordinate;
  if (!coords || coords.length < 2) return [];

  // Parse FRC: "FRC0" -> 0, "FRC3" -> 3, etc.
  const frc = seg.frc ? parseInt(seg.frc.replace("FRC", ""), 10) : undefined;

  // Congestion ratio: 1.0 = free flow, 0.0 = standstill
  const congestionRatio = seg.freeFlowSpeed > 0
    ? Math.min(1, seg.currentSpeed / seg.freeFlowSpeed)
    : 1;

  // Convert to 1-8 speed band for backward compat with map display
  let speedBand: number;
  if (seg.roadClosure) speedBand = 1;
  else if (congestionRatio < 0.25) speedBand = 1;
  else if (congestionRatio < 0.4) speedBand = 2;
  else if (congestionRatio < 0.55) speedBand = 3;
  else if (congestionRatio < 0.7) speedBand = 4;
  else if (congestionRatio < 0.8) speedBand = 5;
  else if (congestionRatio < 0.9) speedBand = 6;
  else if (congestionRatio < 0.95) speedBand = 7;
  else speedBand = 8;

  const roadName = `${seg.currentSpeed} km/h (free: ${seg.freeFlowSpeed})`;
  const bands = [];
  for (let i = 0; i < coords.length - 1; i++) {
    bands.push({
      startLat: coords[i].latitude,
      startLng: coords[i].longitude,
      endLat: coords[i + 1].latitude,
      endLng: coords[i + 1].longitude,
      speedBand,
      roadName,
      frc,
      congestionRatio: Math.round(congestionRatio * 100) / 100,
    });
  }
  return bands;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pointsParam = searchParams.get("points"); // lat,lng|lat,lng|...

  const ltaKey = process.env.LTA_API_KEY;
  const tomtomKey = process.env.TOMTOM_API_KEY;

  // Always fetch LTA speed bands (island-wide)
  let ltaBands: { startLat: number; startLng: number; endLat: number; endLng: number; speedBand: number; roadName: string }[] = [];
  if (ltaKey) {
    try {
      ltaBands = await fetchTrafficSpeedBands(ltaKey);
    } catch (e) {
      console.error("LTA fetch failed:", e);
    }
  }

  // If route points provided + TomTom key, fetch per-point traffic for better coverage
  let tomtomBands: typeof ltaBands = [];
  if (tomtomKey && pointsParam) {
    const points = pointsParam.split("|").map(p => {
      const [lat, lng] = p.split(",").map(Number);
      return { lat, lng };
    }).filter(p => !isNaN(p.lat) && !isNaN(p.lng));

    // Sample every ~200m (limit API calls). Max 25 points per request.
    const step = Math.max(1, Math.floor(points.length / 25));
    const sampled = points.filter((_, i) => i % step === 0).slice(0, 25);

    // Fetch in parallel with concurrency limit
    const results = await Promise.all(
      sampled.map(p => fetchTomTomSegment(p.lat, p.lng, tomtomKey))
    );

    const seen = new Set<string>(); // dedupe by start+end coords
    for (const seg of results) {
      if (!seg) continue;
      const bands = tomtomToSpeedBands(seg);
      for (const band of bands) {
        const key = `${band.startLat.toFixed(5)},${band.startLng.toFixed(5)}-${band.endLat.toFixed(5)},${band.endLng.toFixed(5)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        tomtomBands.push(band);
      }
    }
  }

  // Merge: TomTom bands supplement LTA bands
  const allBands = [...ltaBands, ...tomtomBands];

  return NextResponse.json({ 
    bands: allBands,
    sources: {
      lta: ltaBands.length,
      tomtom: tomtomBands.length,
    }
  });
}
