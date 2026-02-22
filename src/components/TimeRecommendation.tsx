"use client";

// ============================================================
// BreathEasy SG — Time-of-Day Recommendation (24-hour chart)
// ============================================================

import { useMemo } from "react";
import type { CurrentConditions, StaticGrid, TrafficSpeedBand } from "@/types";
import { computeScore } from "@/lib/scoring";

interface TimeRecommendationProps {
  interpolated: { lat: number; lng: number; distanceM: number }[];
  conditions: CurrentConditions | null;
  grid: StaticGrid | null;
  traffic: TrafficSpeedBand[];
}

function scoreColor(score: number): string {
  if (score <= 2) return "#4ecdc4";
  if (score <= 3.5) return "#a8e6a3";
  if (score <= 5) return "#f7d794";
  if (score <= 7) return "#f8a978";
  return "#fc5c65";
}

export default function TimeRecommendation({ interpolated, conditions, grid, traffic }: TimeRecommendationProps) {
  const hourlyScores = useMemo(() => {
    if (!interpolated || interpolated.length === 0) return [];
    // Sample every 5th point for performance
    const step = Math.max(1, Math.floor(interpolated.length / 20));
    const sampled = interpolated.filter((_, i) => i % step === 0);

    return Array.from({ length: 24 }, (_, hour) => {
      const scores = sampled.map(p =>
        computeScore(p.lat, p.lng, conditions, grid, hour, traffic).score
      );
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      return { hour, avg: Math.round(avg * 10) / 10 };
    });
  }, [interpolated, conditions, grid, traffic]);

  if (hourlyScores.length === 0) return null;

  const best = hourlyScores.reduce((a, b) => a.avg < b.avg ? a : b);
  const worst = hourlyScores.reduce((a, b) => a.avg > b.avg ? a : b);
  const maxScore = Math.max(...hourlyScores.map(h => h.avg));

  const formatHour = (h: number) => {
    if (h === 0) return "12am";
    if (h === 12) return "12pm";
    return h < 12 ? `${h}am` : `${h - 12}pm`;
  };

  return (
    <div className="mt-4 pt-3 border-t border-[#1a2d4a]">
      <p className="text-[10px] uppercase tracking-[1.5px] text-[#5a7090] mb-2">Best time to run</p>
      <div className="flex items-center gap-3 mb-3">
        <div className="px-2.5 py-1 rounded-lg bg-[#162340] border border-[#1e3050]">
          <p className="text-[9px] text-[#5a7090]">Best</p>
          <p className="text-sm font-bold text-[#4ecdc4]">{formatHour(best.hour)}</p>
        </div>
        <div className="px-2.5 py-1 rounded-lg bg-[#162340] border border-[#1e3050]">
          <p className="text-[9px] text-[#5a7090]">Score</p>
          <p className="text-sm font-bold" style={{ color: scoreColor(best.avg) }}>{best.avg}</p>
        </div>
        <div className="px-2.5 py-1 rounded-lg bg-[#162340] border border-[#1e3050]">
          <p className="text-[9px] text-[#5a7090]">Worst</p>
          <p className="text-sm font-bold text-[#fc5c65]">{formatHour(worst.hour)}</p>
        </div>
      </div>
      <div className="flex gap-[2px] h-12 items-end">
        {hourlyScores.map(({ hour, avg }) => (
          <div
            key={hour}
            className="flex-1 min-w-0 rounded-t-sm opacity-80 hover:opacity-100 transition-opacity cursor-default"
            style={{
              height: `${Math.max(10, (avg / maxScore) * 100)}%`,
              backgroundColor: scoreColor(avg),
            }}
            title={`${formatHour(hour)}: score ${avg}`}
          />
        ))}
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[9px] text-[#5a7090]">12am</span>
        <span className="text-[9px] text-[#5a7090]">6am</span>
        <span className="text-[9px] text-[#5a7090]">12pm</span>
        <span className="text-[9px] text-[#5a7090]">6pm</span>
        <span className="text-[9px] text-[#5a7090]">11pm</span>
      </div>
      <p className="text-[10px] text-[#5a7090] mt-1">Lower score = better air quality (1–10 scale)</p>
    </div>
  );
}
