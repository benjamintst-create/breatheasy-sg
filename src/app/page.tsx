"use client";

// ============================================================
// BreathEasy SG — Main Page (v2: upload-first)
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import type {
  CurrentConditions, StaticGrid, TrafficSpeedBand,
  AnalyzedRoute, ScoredPoint, SavedRoute,
} from "@/types";
import { parseGPX, downsample } from "@/lib/gpx";
import { scoreRoutePoints, rateRoute } from "@/lib/scoring";
import TimeRecommendation from "@/components/TimeRecommendation";
import ScoreHistory from "@/components/ScoreHistory";
import { saveSnapshot, getHistory } from "@/lib/history";
import { downloadGPX } from "@/lib/gpx-export";

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
  { name: "East Coast 16K", file: "/samples/east-coast-16k.gpx" },
  { name: "Pandan 6K", file: "/samples/pandan-6k.gpx" },
  { name: "Jurong West 6K", file: "/samples/jurong-west-6k.gpx" },
];

function isValidSavedRoute(r: unknown): r is SavedRoute {
  if (!r || typeof r !== "object") return false;
  const obj = r as Record<string, unknown>;
  return typeof obj.id === "string" && obj.id.length <= 200
    && typeof obj.name === "string" && obj.name.length <= 200
    && typeof obj.distance === "string"
    && typeof obj.distanceM === "number" && isFinite(obj.distanceM)
    && typeof obj.analyzedAt === "string"
    && Array.isArray(obj.coordinates) && obj.coordinates.length <= 500
    && obj.rating != null && typeof obj.rating === "object";
}

function loadSavedRoutes(): SavedRoute[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter(isValidSavedRoute).slice(0, MAX_SAVED);
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
  const [warning, setWarning] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [compareRoute, setCompareRoute] = useState<AnalyzedRoute | null>(null);
  const [showCopied, setShowCopied] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [historySnapshots, setHistorySnapshots] = useState<{ timestamp: string; overall: number }[]>([]);
  const [isOffline, setIsOffline] = useState(false);
  const [editingName, setEditingName] = useState<string | null>(null); // route id being edited
  const [editValue, setEditValue] = useState("");

  const gridRef = useRef<StaticGrid | null>(null);
  const conditionsRef = useRef<CurrentConditions | null>(null);
  const trafficRef = useRef<TrafficSpeedBand[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setSavedRoutes(loadSavedRoutes()); }, []);

  // PWA: register service worker + online/offline detection
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    setIsOffline(!navigator.onLine);
    return () => { window.removeEventListener("offline", goOffline); window.removeEventListener("online", goOnline); };
  }, []);

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
      fetch("/api/conditions").catch(() => null),
      fetch(trafficUrl).catch(() => null),
      gridRef.current ? Promise.resolve(null) : fetch("/data/static_grid.json").catch(() => null),
    ]);

    let conditions: CurrentConditions | null = null;
    if (condRes && condRes.ok) {
      try { conditions = await condRes.json(); } catch { /* parse error */ }
    }
    if (!conditions) {
      setWarning("Live conditions unavailable — scoring with defaults");
    } else {
      setWarning(null);
    }

    let traffic: TrafficSpeedBand[] = [];
    if (trafficRes && trafficRes.ok) {
      try { const td = await trafficRes.json(); traffic = td.bands ?? []; } catch { /* parse error */ }
    }

    if (gridRes && gridRes.ok) {
      try { gridRef.current = await gridRes.json(); } catch { /* no grid */ }
    }

    conditionsRef.current = conditions;
    trafficRef.current = traffic;
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
        interpolated,
        rating,
        conditions: {
          pm25: conditions?.pm25?.value ?? 0,
          wind: conditions?.wind?.speed ?? 0,
          temp: conditions?.temperature ?? 28,
          rain: conditions?.rainfall?.intensity ?? "Unknown",
        },
        analyzedAt: new Date().toISOString(),
      };

      setActiveRoute(analyzed);
      saveSnapshot(analyzed.id, analyzed.rating.overall);
      setHistorySnapshots(getHistory(analyzed.id));

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
    if (file.size > 5 * 1024 * 1024) {
      setError("GPX file too large. Maximum is 5 MB.");
      return;
    }
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
        interpolated: parsed.interpolated,
        rating,
        conditions: {
          pm25: conditions?.pm25?.value ?? 0,
          wind: conditions?.wind?.speed ?? 0,
          temp: conditions?.temperature ?? 28,
          rain: conditions?.rainfall?.intensity ?? "Unknown",
        },
        analyzedAt: new Date().toISOString(),
      };

      setActiveRoute(analyzed);
      saveSnapshot(analyzed.id, analyzed.rating.overall);
      setHistorySnapshots(getHistory(analyzed.id));

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
    if (file) {
      if (!file.name.toLowerCase().endsWith(".gpx")) {
        setError("Please upload a .gpx file");
        e.target.value = "";
        return;
      }
      analyzeGPX(file);
    }
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
    const newName = editValue.trim().slice(0, 100);

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

  // Reverse route
  const reverseRoute = useCallback(() => {
    if (!activeRoute) return;
    const reversed = [...activeRoute.coordinates].reverse();
    const revId = activeRoute.id.endsWith("-rev") ? activeRoute.id.slice(0, -4) : `${activeRoute.id}-rev`;
    const revName = activeRoute.name.endsWith(" (reversed)")
      ? activeRoute.name.slice(0, -11)
      : `${activeRoute.name} (reversed)`;
    analyzeCoordinates(revId, revName, reversed, activeRoute.distanceM, activeRoute.distance, activeRoute.elevationGain);
  }, [activeRoute, analyzeCoordinates]);

  // Share route results
  const shareRoute = useCallback(async () => {
    if (!activeRoute) return;
    const factors = activeRoute.rating.factors.map(f => `  ${f.label}: ${f.pct}%`).join("\n");
    const text = [
      `${activeRoute.name} — Score: ${activeRoute.rating.overall}/100`,
      `Distance: ${activeRoute.distance}`,
      factors,
      `PM2.5: ${activeRoute.conditions.pm25} · Wind: ${activeRoute.conditions.wind} km/h · ${activeRoute.conditions.rain}`,
      `Analyzed: ${new Date(activeRoute.analyzedAt).toLocaleString("en-SG")}`,
      `\nScored with BreathEasy SG`,
    ].join("\n");

    if (navigator.share) {
      try { await navigator.share({ title: "BreathEasy SG", text }); return; } catch { /* cancelled */ }
    }
    try {
      await navigator.clipboard.writeText(text);
      setShowCopied(true);
      setTimeout(() => setShowCopied(false), 2000);
    } catch { /* clipboard denied */ }
  }, [activeRoute]);

  // Compare: re-analyze a saved route and set as comparison
  const startCompare = useCallback(async (saved: SavedRoute) => {
    try {
      const { conditions, grid, traffic } = await fetchData(saved.coordinates);
      const { interpolateFromCoords } = await import("@/lib/gpx");
      const interpolated = interpolateFromCoords(saved.coordinates, 50);
      const scoredPoints = scoreRoutePoints(interpolated, conditions, grid, traffic);
      const rating = rateRoute(scoredPoints, grid);
      setCompareRoute({
        id: saved.id, name: saved.name, distance: saved.distance,
        distanceM: saved.distanceM, elevationGain: saved.elevationGain,
        pointCount: saved.coordinates.length, coordinates: saved.coordinates,
        scoredPoints, interpolated, rating,
        conditions: {
          pm25: conditions?.pm25?.value ?? 0,
          wind: conditions?.wind?.speed ?? 0,
          temp: conditions?.temperature ?? 28,
          rain: conditions?.rainfall?.intensity ?? "Unknown",
        },
        analyzedAt: new Date().toISOString(),
      });
    } catch { /* silent */ }
  }, [fetchData]);

  // Drag-and-drop handlers
  const dragCounter = useRef(0);
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.types.includes("Files")) setIsDragging(true);
  }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  }, []);
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
  }, []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;
    const file = e.dataTransfer.files?.[0];
    if (file && file.name.toLowerCase().endsWith(".gpx")) {
      analyzeGPX(file);
    } else if (file) {
      setError("Please drop a .gpx file");
    }
  }, [analyzeGPX]);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    if (!autoRefresh || !activeRoute) return;
    const id = setInterval(() => {
      if (activeRoute) {
        analyzeCoordinates(
          activeRoute.id, activeRoute.name, activeRoute.coordinates,
          activeRoute.distanceM, activeRoute.distance, activeRoute.elevationGain
        );
      }
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [autoRefresh, activeRoute, analyzeCoordinates]);

  // Clear auto-refresh when route changes
  useEffect(() => {
    if (!activeRoute) setAutoRefresh(false);
  }, [activeRoute?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const pctColor = (pct: number) =>
    pct >= 80 ? "#4ecdc4" : pct >= 65 ? "#a8e6a3" : pct >= 50 ? "#f7d794" : pct >= 35 ? "#f8a978" : "#fc5c65";

  return (
    <main className="flex h-screen bg-[#0a1628] text-[#e0e8f0] overflow-hidden md:flex-row flex-col">
      {/* Map */}
      <div
        className="flex-1 relative md:order-2 order-1 min-h-[40vh] md:min-h-0"
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <Map
          coordinates={activeRoute?.coordinates ?? []}
          scoredPoints={activeRoute?.scoredPoints ?? []}
          trafficBands={trafficBands}
          onPointClick={setSelectedPoint}
          compareCoordinates={compareRoute?.coordinates}
          compareScoredPoints={compareRoute?.scoredPoints}
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
              <p className="text-xs text-[#5a7090] mt-2">Or try a sample route from the sidebar →</p>
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

        {isDragging && (
          <div className="absolute inset-0 z-[600] flex items-center justify-center bg-[#0a1628]/80 backdrop-blur-sm">
            <div className="border-2 border-dashed border-[#4ecdc4] rounded-2xl p-12 text-center">
              <svg className="w-12 h-12 text-[#4ecdc4] mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <p className="text-lg font-semibold text-[#4ecdc4]">Drop GPX file here</p>
              <p className="text-xs text-[#5a7090] mt-1">Release to analyze your route</p>
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
            <p className="text-[11px] text-[#5a7090] mt-0.5">
              Air quality scoring for your running route
              <span className="mx-1.5">·</span>
              <a href="/faq" className="text-[#4ecdc4] hover:underline">FAQ</a>
            </p>
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
        {isOffline && (
          <div className="mx-5 mt-3 p-3 rounded-lg bg-[#2a1f0a] border border-[#5c4a1a] text-xs text-[#f7d794]">
            You&apos;re offline — cached data will be used where available
          </div>
        )}
        {warning && !error && !isOffline && (
          <div className="mx-5 mt-3 p-3 rounded-lg bg-[#2a1f0a] border border-[#5c4a1a] text-xs text-[#f7d794]">{warning}</div>
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
                    maxLength={100}
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

            {activeRoute.interpolated && activeRoute.interpolated.length > 0 && (
              <TimeRecommendation
                interpolated={activeRoute.interpolated}
                conditions={conditionsRef.current}
                grid={gridRef.current}
                traffic={trafficRef.current}
              />
            )}

            {historySnapshots.length >= 2 && (
              <ScoreHistory snapshots={historySnapshots} />
            )}

            {/* Action buttons */}
            <div className="mt-4 pt-3 border-t border-[#1a2d4a] flex gap-2 flex-wrap">
              <button
                onClick={reverseRoute}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#162340] border border-[#1e3050] text-[11px] text-[#8aa0b8] hover:border-[#4ecdc4] hover:text-[#4ecdc4] transition-all"
                title="Analyze route in reverse direction"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                </svg>
                Reverse
              </button>
              <button
                onClick={shareRoute}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#162340] border border-[#1e3050] text-[11px] text-[#8aa0b8] hover:border-[#4ecdc4] hover:text-[#4ecdc4] transition-all relative"
                title="Share route results"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                Share
                {showCopied && (
                  <span className="absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-[#4ecdc4] text-[#0a1628] text-[10px] font-semibold whitespace-nowrap">
                    Copied!
                  </span>
                )}
              </button>
              <button
                onClick={() => setAutoRefresh(v => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] transition-all ${
                  autoRefresh
                    ? "bg-[#0f2a30] border-[#4ecdc4] text-[#4ecdc4]"
                    : "bg-[#162340] border-[#1e3050] text-[#8aa0b8] hover:border-[#4ecdc4] hover:text-[#4ecdc4]"
                }`}
                title={autoRefresh ? "Auto-refresh ON (every 5 min)" : "Enable auto-refresh"}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {autoRefresh ? "Auto" : "Auto"}
              </button>
              <button
                onClick={() => activeRoute && downloadGPX(activeRoute)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#162340] border border-[#1e3050] text-[11px] text-[#8aa0b8] hover:border-[#4ecdc4] hover:text-[#4ecdc4] transition-all"
                title="Export scored route as GPX"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export
              </button>
            </div>
          </div>
        )}

        {compareRoute && activeRoute && (
          <div className="px-5 py-3 border-b border-[#1a2d4a] bg-[#0d1a2e]">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] uppercase tracking-[1.5px] text-[#5a7090]">Comparison</p>
              <button onClick={() => setCompareRoute(null)} className="text-[10px] text-[#5a7090] hover:text-[#fc5c65]">Clear</button>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
              <div />
              <div className="text-[#4ecdc4] font-semibold truncate">{activeRoute.name}</div>
              <div className="text-[#8aa0b8] font-semibold truncate">{compareRoute.name}</div>
              {[
                { label: "Overall", a: activeRoute.rating.overall, b: compareRoute.rating.overall },
                { label: "Traffic", a: activeRoute.rating.trafficExposure, b: compareRoute.rating.trafficExposure },
                { label: "Air", a: activeRoute.rating.airQuality, b: compareRoute.rating.airQuality },
                { label: "Green", a: activeRoute.rating.greenCorridor, b: compareRoute.rating.greenCorridor },
              ].map(row => {
                const diff = row.a - row.b;
                return (
                  <React.Fragment key={row.label}>
                    <div className="text-[#5a7090] text-left">{row.label}</div>
                    <div style={{ color: pctColor(row.a) }}>{row.a}%</div>
                    <div className="flex items-center justify-center gap-1">
                      <span style={{ color: pctColor(row.b) }}>{row.b}%</span>
                      {diff !== 0 && (
                        <span className={`text-[9px] ${diff > 0 ? "text-[#4ecdc4]" : "text-[#fc5c65]"}`}>
                          {diff > 0 ? `+${diff}` : diff}
                        </span>
                      )}
                    </div>
                  </React.Fragment>
                );
              })}
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

        {/* Route lists */}
        <div className="px-5 py-4 flex-1">
          {/* Sample Routes */}
          <h3 className="text-[11px] uppercase tracking-[1.5px] text-[#5a7090] mb-3">Sample Routes</h3>
          <div className="space-y-1.5 mb-6">
            {SAMPLE_ROUTES.map((s) => (
              <button
                key={s.file}
                onClick={() => loadSampleRoute(s.file, s.name)}
                className="w-full flex items-center gap-3 rounded-xl p-3 border border-[#1e3050] bg-[#162340] hover:border-[#4ecdc4] hover:bg-[#1a2a48] transition-all text-left"
              >
                <div className="w-8 h-8 shrink-0 rounded-lg bg-[#1e3050] flex items-center justify-center">
                  <svg className="w-4 h-4 text-[#4ecdc4]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-[13px] font-semibold text-[#d0dce8] truncate">{s.name}</h4>
                  <p className="text-[11px] text-[#5a7090]">Tap to analyze</p>
                </div>
              </button>
            ))}
          </div>

          {/* User Routes */}
          <h3 className="text-[11px] uppercase tracking-[1.5px] text-[#5a7090] mb-3">
            Your Routes {savedRoutes.length > 0 && `(${savedRoutes.length})`}
          </h3>
          {savedRoutes.length === 0 && (
            <p className="text-xs text-[#3a5070] text-center py-4">Upload a GPX file to see your routes here</p>
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
                    className={`w-full flex items-center gap-3 rounded-xl p-3 border transition-all text-left pr-16 ${
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
                          maxLength={100}
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
                  <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    {activeRoute && activeRoute.id !== route.id && (
                      <button
                        onClick={(e) => { e.stopPropagation(); startCompare(route); }}
                        className="p-1 rounded text-[#5a7090] hover:text-[#4ecdc4]"
                        title="Compare with active route"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                        </svg>
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteSavedRoute(route.id); }}
                      className="p-1 rounded text-[#5a7090] hover:text-[#fc5c65]"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="px-5 py-2 border-t border-[#1a2d4a] text-[10px] text-[#3a5070] flex justify-between">
          <span>Data: data.gov.sg · LTA DataMall · OSM</span>
          <span>v1.1.0</span>
        </div>
      </div>
    </main>
  );
}
