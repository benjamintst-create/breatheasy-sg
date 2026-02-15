// ============================================================
// BreathEasy SG — GPX Parser with 50m interpolation
// ============================================================

import type { LatLng } from "@/types";

export interface ParsedGPX {
  name: string;
  coordinates: LatLng[];
  distance: string;
  distanceM: number;
  elevationGain: number;
  pointCount: number;
  /** Points interpolated every 50m along the track */
  interpolated: { lat: number; lng: number; distanceM: number }[];
}

export function parseGPX(xmlString: string): ParsedGPX {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, "application/xml");

  const parseError = doc.querySelector("parsererror");
  if (parseError) throw new Error("Invalid GPX file: could not parse XML");

  const nameEl = doc.querySelector("trk > name") ?? doc.querySelector("trk > n") ?? doc.querySelector("rte > name") ?? doc.querySelector("metadata > name") ?? doc.querySelector("metadata > n");
  const name = nameEl?.textContent?.trim() ?? "Uploaded Route";

  let points = doc.querySelectorAll("trkpt");
  if (points.length === 0) points = doc.querySelectorAll("rtept");
  if (points.length === 0) points = doc.querySelectorAll("wpt");
  if (points.length === 0) throw new Error("No track points found in GPX file");

  const coordinates: LatLng[] = [];
  const elevations: number[] = [];

  points.forEach((pt) => {
    const lat = parseFloat(pt.getAttribute("lat") ?? "0");
    const lng = parseFloat(pt.getAttribute("lon") ?? "0");
    if (lat !== 0 && lng !== 0) {
      coordinates.push({ lat, lng });
      const ele = pt.querySelector("ele");
      if (ele) elevations.push(parseFloat(ele.textContent ?? "0"));
    }
  });

  if (coordinates.length === 0) throw new Error("No valid coordinates found in GPX file");

  const distanceM = totalDistance(coordinates);
  const distance = distanceM >= 1000 ? `${(distanceM / 1000).toFixed(1)} km` : `${Math.round(distanceM)} m`;

  let elevationGain = 0;
  for (let i = 1; i < elevations.length; i++) {
    const diff = elevations[i] - elevations[i - 1];
    if (diff > 0) elevationGain += diff;
  }

  // Interpolate at 50m intervals
  const interpolated = interpolateRoute(coordinates, 50);

  return {
    name,
    coordinates,
    distance,
    distanceM,
    elevationGain: Math.round(elevationGain),
    pointCount: coordinates.length,
    interpolated,
  };
}

/** Haversine distance in metres */
export function haversine(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * sinLng * sinLng;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function totalDistance(coords: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) total += haversine(coords[i - 1], coords[i]);
  return total;
}

/** Interpolate points every `stepM` metres along a polyline */
function interpolateRoute(coords: LatLng[], stepM: number): { lat: number; lng: number; distanceM: number }[] {
  if (coords.length < 2) return coords.map(c => ({ ...c, distanceM: 0 }));

  const result: { lat: number; lng: number; distanceM: number }[] = [];
  result.push({ lat: coords[0].lat, lng: coords[0].lng, distanceM: 0 });

  let cumDist = 0;
  let nextTarget = stepM;
  let segStart = coords[0];

  for (let i = 1; i < coords.length; i++) {
    const segEnd = coords[i];
    const segLen = haversine(segStart, segEnd);

    while (cumDist + segLen >= nextTarget) {
      const overshoot = nextTarget - cumDist;
      const t = segLen > 0 ? overshoot / segLen : 0;
      const lat = segStart.lat + t * (segEnd.lat - segStart.lat);
      const lng = segStart.lng + t * (segEnd.lng - segStart.lng);
      result.push({ lat, lng, distanceM: nextTarget });
      nextTarget += stepM;
    }

    cumDist += segLen;
    segStart = segEnd;
  }

  // Add final point
  const last = coords[coords.length - 1];
  if (result.length === 0 || haversine(result[result.length - 1], last) > 1) {
    result.push({ lat: last.lat, lng: last.lng, distanceM: cumDist });
  }

  return result;
}

/** Re-interpolate from stored coordinates (for refresh) */
export function interpolateFromCoords(coords: LatLng[], stepM: number): { lat: number; lng: number; distanceM: number }[] {
  return interpolateRoute(coords, stepM);
}

/** Downsample coordinates for storage */
export function downsample(coords: LatLng[], target: number): LatLng[] {
  if (coords.length <= target) return coords;
  const step = (coords.length - 1) / (target - 1);
  const result: LatLng[] = [];
  for (let i = 0; i < target; i++) result.push(coords[Math.round(i * step)]);
  return result;
}
