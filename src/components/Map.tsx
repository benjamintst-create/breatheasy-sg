"use client";

// ============================================================
// BreathEasy SG — Map (v2: route-focused + nearby traffic)
// ============================================================

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { ScoredPoint, LatLng, TrafficSpeedBand } from "@/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;

const DEG_TO_M = 111320;

/** Filter traffic bands within `radiusM` metres of any route point */
function nearbyBands(bands: TrafficSpeedBand[], route: LatLng[], radiusM: number): TrafficSpeedBand[] {
  if (!bands.length || !route.length) return [];
  const cosLat = Math.cos((1.35 * Math.PI) / 180);
  // Downsample route to every ~200m for perf
  const step = Math.max(1, Math.floor(route.length / 50));
  const sample = route.filter((_, i) => i % step === 0);

  return bands.filter(b => {
    const midLat = (b.startLat + b.endLat) / 2;
    const midLng = (b.startLng + b.endLng) / 2;
    for (const p of sample) {
      const dLat = (p.lat - midLat) * DEG_TO_M;
      const dLng = (p.lng - midLng) * DEG_TO_M * cosLat;
      if (Math.sqrt(dLat * dLat + dLng * dLng) < radiusM) return true;
    }
    return false;
  });
}

function bandColor(b: number): string {
  if (b <= 2) return "#fc5c65";
  if (b <= 4) return "#f8a978";
  if (b <= 6) return "#f7d794";
  return "#26a69a";
}

interface MapProps {
  coordinates: LatLng[];
  scoredPoints: ScoredPoint[];
  trafficBands: TrafficSpeedBand[];
  onPointClick?: (point: ScoredPoint) => void;
}

export default function Map({ coordinates, scoredPoints, trafficBands, onPointClick }: MapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const trafficLayerRef = useRef<L.LayerGroup | null>(null);
  const markerRef = useRef<L.CircleMarker | null>(null);

  // ── Init map ──
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [1.3521, 103.8198], zoom: 12,
      zoomControl: false, attributionControl: false,
    });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://carto.com">CARTO</a> · OSM',
    }).addTo(map);
    L.control.attribution({ position: "bottomright" }).addTo(map);
    L.control.zoom({ position: "topright" }).addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // ── Draw traffic overlay (behind route) ──
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    if (trafficLayerRef.current) { map.removeLayer(trafficLayerRef.current); trafficLayerRef.current = null; }
    if (!trafficBands.length || !coordinates.length) return;

    const nearby = nearbyBands(trafficBands, coordinates, 500);
    if (!nearby.length) return;

    const grp = L.layerGroup();
    for (const band of nearby) {
      if (!band.startLat || !band.startLng || !band.endLat || !band.endLng) continue;
      const color = bandColor(band.speedBand);
      const w = band.speedBand <= 4 ? 4 : 3;
      const op = band.speedBand <= 4 ? 0.7 : 0.35;
      L.polyline([[band.startLat, band.startLng], [band.endLat, band.endLng]], {
        color, weight: w, opacity: op, lineCap: "round", lineJoin: "round",
      }).bindTooltip(`${band.roadName} — ${band.speedBand <= 2 ? "Jam" : band.speedBand <= 4 ? "Slow" : band.speedBand <= 6 ? "Moderate" : "Free flow"}`, {
        sticky: true,
      }).addTo(grp);
    }
    grp.addTo(map);
    trafficLayerRef.current = grp;
  }, [trafficBands, coordinates]);

  // ── Draw color-coded route segments (on top) ──
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    if (routeLayerRef.current) { map.removeLayer(routeLayerRef.current); routeLayerRef.current = null; }
    if (markerRef.current) { map.removeLayer(markerRef.current); markerRef.current = null; }

    if (scoredPoints.length < 2) return;

    const grp = L.layerGroup();

    for (let i = 0; i < scoredPoints.length - 1; i++) {
      const a = scoredPoints[i];
      const b = scoredPoints[i + 1];
      const line = L.polyline(
        [[a.lat, a.lng], [b.lat, b.lng]],
        { color: a.color, weight: 6, opacity: 0.9, lineCap: "round", lineJoin: "round" }
      );
      line.on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        onPointClick?.(a);
        if (markerRef.current) {
          markerRef.current.setLatLng([a.lat, a.lng]);
          markerRef.current.setStyle({ fillColor: a.color, color: "#ffffff" });
        } else {
          markerRef.current = L.circleMarker([a.lat, a.lng], {
            radius: 8, fillColor: a.color, color: "#ffffff", fillOpacity: 1, weight: 2,
          }).addTo(map);
        }
      });
      line.addTo(grp);
    }

    // Start/end markers
    const start = scoredPoints[0];
    const end = scoredPoints[scoredPoints.length - 1];
    L.circleMarker([start.lat, start.lng], {
      radius: 7, fillColor: "#4ecdc4", color: "#0a1628", fillOpacity: 1, weight: 3,
    }).bindTooltip("Start", { permanent: true, direction: "top", className: "start-tooltip" }).addTo(grp);
    L.circleMarker([end.lat, end.lng], {
      radius: 7, fillColor: "#fc5c65", color: "#0a1628", fillOpacity: 1, weight: 3,
    }).bindTooltip("End", { permanent: true, direction: "top", className: "end-tooltip" }).addTo(grp);

    grp.addTo(map);
    routeLayerRef.current = grp;

    const bounds = L.latLngBounds(scoredPoints.map(p => [p.lat, p.lng] as L.LatLngTuple));
    map.fitBounds(bounds, { padding: [50, 50] });
  }, [scoredPoints, onPointClick]);

  return (
    <div className="relative flex-1 h-full">
      <div ref={containerRef} className="w-full h-full" />
      {scoredPoints.length > 0 && (
        <div className="absolute bottom-6 right-4 z-[1000] bg-[#0f1d32ee] border border-[#1e3050] rounded-xl px-4 py-3 backdrop-blur-sm">
          <p className="text-[10px] uppercase tracking-widest text-[#5a7090] mb-2">Air Quality Score</p>
          <div className="w-36 h-3 rounded-full bg-gradient-to-r from-[#4ecdc4] via-[#a8e6a3] via-[#f7d794] via-[#f8a978] to-[#fc5c65]" />
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-[#5a7090]">1 Best</span>
            <span className="text-[10px] text-[#5a7090]">10 Worst</span>
          </div>
          {trafficBands.length > 0 && (
            <div className="mt-3 pt-2 border-t border-[#1e3050]">
              <p className="text-[10px] uppercase tracking-widest text-[#5a7090] mb-1.5">Nearby Traffic</p>
              <div className="flex gap-2 text-[10px] text-[#8aa0b8]">
                <span className="flex items-center gap-1"><span className="w-3 h-1 rounded bg-[#fc5c65]" />Jam</span>
                <span className="flex items-center gap-1"><span className="w-3 h-1 rounded bg-[#f8a978]" />Slow</span>
                <span className="flex items-center gap-1"><span className="w-3 h-1 rounded bg-[#f7d794]" />Med</span>
                <span className="flex items-center gap-1"><span className="w-3 h-1 rounded bg-[#26a69a]" />Free</span>
              </div>
            </div>
          )}
          <p className="text-[9px] text-[#3a5070] mt-2">Click route segment for details</p>
        </div>
      )}
    </div>
  );
}
