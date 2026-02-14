"use client";

// ============================================================
// BreathEasy SG — Map (v2: route-focused)
// ============================================================
// Shows uploaded route with color-coded segments by score.
// Clicking a segment shows that point's breakdown.

import { useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { ScoredPoint, LatLng } from "@/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;

interface MapProps {
  /** All coordinates for the route polyline */
  coordinates: LatLng[];
  /** Scored points at 50m intervals (color-coded) */
  scoredPoints: ScoredPoint[];
  /** Callback when user clicks a scored segment */
  onPointClick?: (point: ScoredPoint) => void;
}

export default function Map({ coordinates, scoredPoints, onPointClick }: MapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const layersRef = useRef<L.LayerGroup | null>(null);
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

  // ── Draw color-coded route segments ──
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    if (layersRef.current) { map.removeLayer(layersRef.current); layersRef.current = null; }
    if (markerRef.current) { map.removeLayer(markerRef.current); markerRef.current = null; }

    if (scoredPoints.length < 2) return;

    const grp = L.layerGroup();

    // Draw each segment between consecutive scored points
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
        // Show marker
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
    layersRef.current = grp;

    // Fit to route bounds
    const bounds = L.latLngBounds(scoredPoints.map(p => [p.lat, p.lng] as L.LatLngTuple));
    map.fitBounds(bounds, { padding: [50, 50] });
  }, [scoredPoints, onPointClick]);

  return (
    <div className="relative flex-1 h-full">
      <div ref={containerRef} className="w-full h-full" />
      {/* Legend */}
      {scoredPoints.length > 0 && (
        <div className="absolute bottom-6 right-4 z-[1000] bg-[#0f1d32ee] border border-[#1e3050] rounded-xl px-4 py-3 backdrop-blur-sm">
          <p className="text-[10px] uppercase tracking-widest text-[#5a7090] mb-2">Air Quality Score</p>
          <div className="w-36 h-3 rounded-full bg-gradient-to-r from-[#4ecdc4] via-[#a8e6a3] via-[#f7d794] via-[#f8a978] to-[#fc5c65]" />
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-[#5a7090]">1 Best</span>
            <span className="text-[10px] text-[#5a7090]">10 Worst</span>
          </div>
          <p className="text-[9px] text-[#3a5070] mt-2">Click a segment for details</p>
        </div>
      )}
    </div>
  );
}
