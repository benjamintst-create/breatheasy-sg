"use client";

// ============================================================
// BreathEasy SG — Main Page (v2: upload-first)
// ============================================================

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import type {
  CurrentConditions, StaticGrid, TrafficSpeedBand,
  AnalyzedRoute, ScoredPoint, SavedRoute,
} from "@/types";
import { parseGPX, downsample } from "@/lib/gpx";
import { scoreRoutePoints, rateRoute } from "@/lib/scoring";

const Map = dynamic(() => import("@/components/Map"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center bg-[#0a1628]">
      <div className="w-8 h-8 border-2 border-[#1e3050] border-t-[#4ecdc4] rounded-full animate-spin" />
    </div>
  ),
});

const STORAGE_KEY = "breatheasy-routes-v2";
const MAX_SAVED = 30;

const SAMPLE_ROUTES = [
  { name: "Marina Bay 21K", file: "/samples/marina-bay-21k.gpx" },
];

function loadSavedRoutes(): SavedRoute[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch { return []; }
}

function persistRoutes(routes: SavedRoute[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(routes.slice(0, MAX_SAVED)));
  } catch { /* storage full */ }
}

export default function Home() {
  const [activeRoute, setActiveRoute] = useState<AnalyzedRoute | null>(null);
  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<ScoredPoint | null>(null);
  const [trafficBands, setTrafficBands] = useState<TrafficSpeedBand[]>([]);
  const [editingName, setEditingName] = useState<string | null>(null); // route id being edited
  const [editValue, setEditValue] = useState("");

  const gridRef = useRef<StaticGrid | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setSavedRoutes(loadSavedRoutes()); }, []);

  // Always fetch fresh conditions + traffic
  // Pass route points to traffic API for TomTom per-point lookups
  const fetchData = useCallback(async (routeCoords?: { lat: number; lng: number }[]) => {
    // Build points query string for TomTom (sample every ~200m, max 25)
    let trafficUrl = "/api/traffic";
    if (routeCoords && routeCoords.length > 0) {
      const step = Math.max(1, Math.floor(routeCoords.length / 25));
      const sampled = routeCoords.filter((_, i) => i % step === 0).slice(0, 25);
      const pointsStr = sampled.map(p => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join("|");
      trafficUrl = `/api/traffic?points=${encodeURIComponent(pointsStr)}`;
    }

    const [condRes, trafficRes, gridRes] = await Promise.all([
      fetch("/api/conditions"),
      fetch(trafficUrl),
      gridRef.current ? Promise.resolve(null) : fetch("/data/static_grid.json"),
    ]);

    const conditions: CurrentConditions = await condRes.json();
    const trafficData = await trafficRes.json();
    const traffic: TrafficSpeedBand[] = trafficData.bands ?? [];

    if (gridRes) {
      try { gridRef.current = await gridRes.json(); } catch { /* no grid */ }
    }

    setTrafficBands(traffic);
    return { conditions, grid: gridRef.current, traffic };
  }, []);

  // Score a route's coordinates with fresh data
  const analyzeCoordinates = useCallback(async (
    id: string, name: string, coordinates: { lat: number; lng: number }[],
    distanceM: number, distance: string, elevationGain: number
  ) => {
    setError(null);
    setAnalyzing(true);
    setSelectedPoint(null);

    try {
      const { conditions, grid, traffic } = await fetchData(coordinates);
      const { interpolateFromCoords } = await import("@/lib/gpx");
      const interpolated = interpolateFromCoords(coordinates, 50);

      const scoredPoints = scoreRoutePoints(interpolated, conditions, grid, traffic);
      const rating = rateRoute(scoredPoints, grid);

      const analyzed: AnalyzedRoute = {
        id, name, distance, distanceM, elevationGain,
        pointCount: coordinates.length,
        coordinates,
        scoredPoints,
        rating,
        conditions: {
          pm25: conditions.pm25.value,
          wind: conditions.wind.speed,
          temp: conditions.temperature,
          rain: conditions.rainfall.intensity,
        },
        analyzedAt: new Date().toISOString(),
      };

      setActiveRoute(analyzed);

      // Update saved route
      const saved: SavedRoute = {
        id: analyzed.id, name: analyzed.name,
        distance: analyzed.distance, distanceM: analyzed.distanceM,
        elevationGain: analyzed.elevationGain,
        rating: analyzed.rating, conditions: analyzed.conditions,
        analyzedAt: analyzed.analyzedAt,
        coordinates: downsample(analyzed.coordinates, 150),
        scoredPoints: downsample(
          analyzed.scoredPoints as unknown as { lat: number; lng: number }[],
          150
        ) as unknown as ScoredPoint[],
      };

      setSavedRoutes(prev => {
        const updated = [saved, ...prev.filter(r => r.id !== saved.id)].slice(0, MAX_SAVED);
        persistRoutes(updated);
        return updated;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to analyze route");
    } finally {
      setAnalyzing(false);
    }
  }, [fetchData]);

  // Analyze a GPX file
  const analyzeGPX = useCallback(async (file: File) => {
    setError(null);
    setAnalyzing(true);
    setSelectedPoint(null);

    try {
      const xml = await file.text();
      const parsed = parseGPX(xml);
      const { conditions, grid, traffic } = await fetchData(parsed.coordinates);
      const scoredPoints = scoreRoutePoints(parsed.interpolated, conditions, grid, traffic);
      const rating = rateRoute(scoredPoints, grid);

      const analyzed: AnalyzedRoute = {
        id: `route-${Date.now()}`,
        name: parsed.name,
        distance: parsed.distance,
        distanceM: parsed.distanceM,
        elevationGain: parsed.elevationGain,
        pointCount: parsed.pointCount,
        coordinates: parsed.coordinates,
        scoredPoints,
        rating,
        conditions: {
          pm25: conditions.pm25.value,
          wind: conditions.wind.speed,
          temp: conditions.temperature,
          rain: conditions.rainfall.intensity,
        },
        analyzedAt: new Date().toISOString(),
      };

      setActiveRoute(analyzed);

      const saved: SavedRoute = {
        id: analyzed.id, name: analyzed.name,
        distance: analyzed.distance, distanceM: analyzed.distanceM,
        elevationGain: analyzed.elevationGain,
        rating: analyzed.rating, conditions: analyzed.conditions,
        analyzedAt: analyzed.analyzedAt,
        coordinates: downsample(analyzed.coordinates, 150),
        scoredPoints: downsample(
          analyzed.scoredPoints as unknown as { lat: number; lng: number }[],
          150
        ) as unknown as ScoredPoint[],
      };

      setSavedRoutes(prev => {
        const updated = [saved, ...prev.filter(r => r.id !== saved.id)].slice(0, MAX_SAVED);
        persistRoutes(updated);
        return updated;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to analyze route");
    } finally {
      setAnalyzing(false);
    }
  }, [fetchData]);

  const loadSampleRoute = useCallback(async (url: string, routeName: string) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const file = new File([blob], routeName + ".gpx", { type: "application/gpx+xml" });
      analyzeGPX(file);
    } catch (err) {
      console.error("Failed to load sample:", err);
    }
  }, [analyzeGPX]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) analyzeGPX(file);
    e.target.value = "";
  }, [analyzeGPX]);

  // Click a saved route → re-analyze with fresh data
  const refreshRoute = useCallback((saved: SavedRoute) => {
    analyzeCoordinates(
      saved.id, saved.name, saved.coordinates,
      saved.distanceM, saved.distance, saved.elevationGain
    );
  }, [analyzeCoordinates]);

  const deleteSavedRoute = useCallback((id: string) => {
    setSavedRoutes(prev => {
      const updated = prev.filter(r => r.id !== id);
      persistRoutes(updated);
      return updated;
    });
    if (activeRoute?.id === id) setActiveRoute(null);
  }, [activeRoute]);

  // Rename route
  const startRename = useCallback((id: string, currentName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingName(id);
    setEditValue(currentName);
  }, []);

  const commitRename = useCallback(() => {
    if (!editingName || !editValue.trim()) { setEditingName(null); return; }
    const newName = editValue.trim();

    // Update active route if it's the one being renamed
    if (activeRoute?.id === editingName) {
      setActiveRoute(prev => prev ? { ...prev, name: newName } : null);
    }

    // Update saved routes
    setSavedRoutes(prev => {
      const updated = prev.map(r => r.id === editingName ? { ...r, name: newName } : r);
      persistRoutes(updated);
      return updated;
    });

    setEditingName(null);
  }, [editingName, editValue, activeRoute]);

  const pctColor = (pct: number) =>
    pct >= 80 ? "#4ecdc4" : pct >= 65 ? "#a8e6a3" : pct >= 50 ? "#f7d794" : pct >= 35 ? "#f8a978" : "#fc5c65";

  return (
    <main className="flex h-screen bg-[#0a1628] text-[#e0e8f0] overflow-hidden md:flex-row flex-col">
      {/* Map */}
      <div className="flex-1 relative md:order-2 order-1 min-h-[40vh] md:min-h-0">
        <Map
          coordinates={activeRoute?.coordinates ?? []}
          scoredPoints={activeRoute?.scoredPoints ?? []}
          trafficBands={trafficBands}
          onPointClick={setSelectedPoint}
        />

        {/* Upload overlay when no route */}
        {!activeRoute && !analyzing && (
          <div className="absolute inset-0 z-[500] flex items-center justify-center bg-[#0a1628]/60 backdrop-blur-sm">
            <div className="text-center max-w-sm px-6">
              <h2 className="text-2xl font-bold text-[#4ecdc4] mb-2">BreathEasy SG</h2>
              <p className="text-sm text-[#8aa0b8] mb-6">Upload your running route to see real-time air quality scoring at every 50m along the path.</p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-6 py-3 rounded-xl bg-[#4ecdc4] text-[#0a1628] font-semibold text-sm hover:bg-[#3dbdb5] transition-colors"
              >
                Upload GPX File
              </button>
              <p className="text-xs text-[#5a7090] mt-3">Export from Strava, Garmin, Nike Run Club, etc.</p>
              <div className="mt-5 pt-4 border-t border-[#1e3050]">
                <p className="text-xs text-[#5a7090] mb-2">Or try a sample route:</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {SAMPLE_ROUTES.map(s => (
                    <button
                      key={s.file}
                      onClick={() => loadSampleRoute(s.file, s.name)}
                      className="px-3 py-1.5 rounded-lg bg-[#1e3050] text-[#4ecdc4] text-xs font-medium hover:bg-[#2a4060] transition-colors"
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Analyzing overlay */}
        {analyzing && (
          <div className="absolute inset-0 z-[500] flex items-center justify-center bg-[#0a1628]/70 backdrop-blur-sm">
            <div className="text-center">
              <div className="w-10 h-10 border-3 border-[#1e3050] border-t-[#4ecdc4] rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-[#4ecdc4] font-medium">Analyzing your route...</p>
              <p className="text-xs text-[#5a7090] mt-1">Fetching live conditions & scoring every 50m</p>
            </div>
          </div>
        )}
      </div>

      {/* Sidebar */}
      <div className="md:order-1 order-2 flex-shrink-0 md:h-full h-[55vh] w-full md:w-[400px] md:min-w-[400px] bg-[#0f1d32] border-r border-[#1a2d4a] overflow-y-auto">
        {/* Header */}
        <div className="px-5 pt-4 pb-3 border-b border-[#1a2d4a] flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-[#4ecdc4] tracking-tight">
              BreathEasy <span className="text-[#7b8fa8] font-normal text-sm ml-1.5">SG</span>
            </h1>
            <p className="text-[11px] text-[#5a7090] mt-0.5">Air quality scoring for your running route</p>
          </div>
          <input ref={fileInputRef} type="file" accept=".gpx" className="hidden" onChange={handleFileChange} />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-2 rounded-lg bg-[#4ecdc4] text-[#0a1628] text-xs font-semibold hover:bg-[#3dbdb5] transition-colors shrink-0"
          >
            Upload GPX
          </button>
        </div>

        {error && (
          <div className="mx-5 mt-3 p-3 rounded-lg bg-[#2a0a0a] border border-[#5c1a1a] text-xs text-[#fc5c65]">{error}</div>
        )}

        {/* Active route rating */}
        {activeRoute && (
          <div className="px-5 py-4 border-b border-[#1a2d4a]">
            {/* Route header */}
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 shrink-0 relative">
                <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                  <circle cx="18" cy="18" r="15" fill="none" stroke="#1e3050" strokeWidth="2.5" />
                  <circle cx="18" cy="18" r="15" fill="none"
                    stroke={pctColor(activeRoute.rating.overall)} strokeWidth="2.5"
                    strokeDasharray={`${activeRoute.rating.overall * 0.94} 100`} strokeLinecap="round" />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-lg font-bold" style={{ color: pctColor(activeRoute.rating.overall) }}>
                  {activeRoute.rating.overall}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                {/* Editable name */}
                {editingName === activeRoute.id ? (
                  <input
                    autoFocus
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={e => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setEditingName(null); }}
                    className="text-[15px] font-semibold text-[#d0dce8] bg-[#162340] border border-[#4ecdc4] rounded px-2 py-0.5 w-full outline-none"
                  />
                ) : (
                  <h3
                    className="text-[15px] font-semibold text-[#d0dce8] truncate cursor-pointer hover:text-[#4ecdc4] transition-colors group"
                    onClick={(e) => startRename(activeRoute.id, activeRoute.name, e)}
                    title="Click to rename"
                  >
                    {activeRoute.name}
                    <svg className="w-3 h-3 inline-block ml-1.5 opacity-0 group-hover:opacity-60 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </h3>
                )}
                <p className="text-xs text-[#5a7090] mt-0.5">
                  {activeRoute.distance}
                  {activeRoute.elevationGain > 0 && ` · ${activeRoute.elevationGain}m gain`}
                  {` · ${activeRoute.scoredPoints.length} checkpoints`}
                </p>
              </div>
            </div>

            <p className="text-xs text-[#8aa0b8] leading-relaxed mb-4">{activeRoute.rating.summary}</p>

            <div className="space-y-3">
              {activeRoute.rating.factors.map((f) => (
                <div key={f.label}>
                  <div className="flex justify-between mb-1">
                    <span className="text-[11px] text-[#8aa0b8]">{f.label}</span>
                    <span className="text-[11px] font-semibold" style={{ color: pctColor(f.pct) }}>{f.pct}%</span>
                  </div>
                  <div className="h-[5px] rounded-full bg-[#1e3050] overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${f.pct}%`, backgroundColor: pctColor(f.pct) }} />
                  </div>
                  <p className="text-[10px] text-[#5a7090] mt-0.5">{f.detail}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-3 border-t border-[#1a2d4a]">
              <p className="text-[10px] uppercase tracking-[1.5px] text-[#5a7090] mb-2">Live conditions</p>
              <div className="grid grid-cols-4 gap-2 text-center">
                {[
                  { label: "PM2.5", val: activeRoute.conditions.pm25 },
                  { label: "Wind", val: activeRoute.conditions.wind },
                  { label: "Temp", val: `${activeRoute.conditions.temp}°` },
                  { label: "Rain", val: activeRoute.conditions.rain },
                ].map(c => (
                  <div key={c.label} className="bg-[#162340] rounded-lg px-2 py-1.5 border border-[#1e3050]">
                    <p className="text-[9px] text-[#5a7090]">{c.label}</p>
                    <p className="text-sm font-bold text-[#4ecdc4]">{c.val}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-[#1a2d4a]">
              <p className="text-[10px] uppercase tracking-[1.5px] text-[#5a7090] mb-2">Score along route</p>
              <div className="flex gap-[1px] h-8 items-end">
                {activeRoute.scoredPoints.map((p, i) => (
                  <div
                    key={i}
                    className="flex-1 min-w-0 rounded-t-sm cursor-pointer hover:opacity-100 opacity-80"
                    style={{ height: `${Math.max(10, (p.score / 10) * 100)}%`, backgroundColor: p.color }}
                    title={`${Math.round(p.distanceM)}m — Score: ${p.score.toFixed(1)}`}
                    onClick={() => setSelectedPoint(p)}
                  />
                ))}
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[9px] text-[#5a7090]">Start</span>
                <span className="text-[9px] text-[#5a7090]">{activeRoute.distance}</span>
              </div>
            </div>
          </div>
        )}

        {selectedPoint && (
          <div className="px-5 py-3 border-b border-[#1a2d4a] bg-[#0a1628]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold border border-[#1e3050]" style={{ color: selectedPoint.color }}>
                {selectedPoint.score.toFixed(1)}
              </div>
              <div>
                <p className="text-xs font-semibold text-[#d0dce8]">{Math.round(selectedPoint.distanceM)}m from start</p>
                <p className="text-[11px] text-[#5a7090]">{selectedPoint.lat.toFixed(5)}, {selectedPoint.lng.toFixed(5)}</p>
              </div>
            </div>
          </div>
        )}

        {/* History */}
        <div className="px-5 py-4 flex-1">
          <h3 className="text-[11px] uppercase tracking-[1.5px] text-[#5a7090] mb-3">
            Recent Routes {savedRoutes.length > 0 && `(${savedRoutes.length})`}
          </h3>
          {savedRoutes.length === 0 && !activeRoute && (
            <p className="text-xs text-[#3a5070] text-center py-6">Upload a GPX file to get started</p>
          )}
          <div className="space-y-1.5">
            {savedRoutes.map((route) => {
              const isActive = activeRoute?.id === route.id;
              const color = pctColor(route.rating.overall);
              const isEditing = editingName === route.id;
              return (
                <div key={route.id} className="relative group">
                  <button
                    onClick={() => refreshRoute(route)}
                    className={`w-full flex items-center gap-3 rounded-xl p-3 border transition-all text-left pr-9 ${
                      isActive ? "border-[#4ecdc4] bg-[#0f2a30]" : "border-[#1e3050] bg-[#162340] hover:border-[#2a4a6a] hover:bg-[#1a2a48]"
                    }`}
                  >
                    <div className="w-10 h-10 shrink-0 relative">
                      <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                        <circle cx="18" cy="18" r="15" fill="none" stroke="#1e3050" strokeWidth="3" />
                        <circle cx="18" cy="18" r="15" fill="none" stroke={color} strokeWidth="3"
                          strokeDasharray={`${route.rating.overall * 0.94} 100`} strokeLinecap="round" />
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center text-[12px] font-bold" style={{ color }}>
                        {route.rating.overall}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        <input
                          autoFocus
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onBlur={commitRename}
                          onKeyDown={e => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setEditingName(null); }}
                          onClick={e => e.stopPropagation()}
                          className="text-[13px] font-semibold text-[#d0dce8] bg-[#162340] border border-[#4ecdc4] rounded px-1.5 py-0.5 w-full outline-none"
                        />
                      ) : (
                        <h4
                          className="text-[13px] font-semibold text-[#d0dce8] truncate"
                          onDoubleClick={(e) => startRename(route.id, route.name, e)}
                          title="Double-click to rename"
                        >
                          {route.name}
                        </h4>
                      )}
                      <p className="text-[11px] text-[#5a7090] truncate">
                        {route.distance}
                        {route.elevationGain > 0 && ` · ${route.elevationGain}m`}
                        {" · "}
                        {new Date(route.analyzedAt).toLocaleDateString("en-SG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteSavedRoute(route.id); }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded text-[#5a7090] hover:text-[#fc5c65] opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="px-5 py-2 border-t border-[#1a2d4a] text-[10px] text-[#3a5070]">
          Data: data.gov.sg · LTA DataMall · OSM
        </div>
      </div>
    </main>
  );
}
