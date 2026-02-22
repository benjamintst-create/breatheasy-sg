"use client";

// ============================================================
// BreathEasy SG — Score History Sparkline (SVG)
// ============================================================

import { useMemo } from "react";
import type { ScoreSnapshot } from "@/lib/history";

interface ScoreHistoryProps {
  snapshots: ScoreSnapshot[];
}

export default function ScoreHistory({ snapshots }: ScoreHistoryProps) {
  const data = useMemo(() => snapshots.slice(-20), [snapshots]);

  if (data.length < 2) return null;

  const scores = data.map(d => d.overall);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = max - min || 1;

  const W = 200;
  const H = 40;
  const PAD = 4;

  const points = data.map((d, i) => {
    const x = PAD + (i / (data.length - 1)) * (W - 2 * PAD);
    const y = PAD + (1 - (d.overall - min) / range) * (H - 2 * PAD);
    return `${x},${y}`;
  }).join(" ");

  const latest = data[data.length - 1];
  const prev = data[data.length - 2];
  const diff = latest.overall - prev.overall;

  return (
    <div className="mt-4 pt-3 border-t border-[#1a2d4a]">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] uppercase tracking-[1.5px] text-[#5a7090]">Score history</p>
        <div className="flex items-center gap-1 text-[10px]">
          <span className="text-[#8aa0b8]">{min}–{max}</span>
          {diff !== 0 && (
            <span className={diff > 0 ? "text-[#4ecdc4]" : "text-[#fc5c65]"}>
              {diff > 0 ? `+${diff}` : diff}
            </span>
          )}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-10">
        <polyline
          fill="none"
          stroke="#4ecdc4"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={points}
        />
        {data.map((d, i) => {
          const x = PAD + (i / (data.length - 1)) * (W - 2 * PAD);
          const y = PAD + (1 - (d.overall - min) / range) * (H - 2 * PAD);
          return (
            <circle
              key={i}
              cx={x} cy={y} r="2"
              fill={i === data.length - 1 ? "#4ecdc4" : "#1e3050"}
              stroke="#4ecdc4"
              strokeWidth="0.5"
            >
              <title>{new Date(d.timestamp).toLocaleString("en-SG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}: {d.overall}</title>
            </circle>
          );
        })}
      </svg>
      <p className="text-[9px] text-[#5a7090] mt-0.5">{data.length} snapshots</p>
    </div>
  );
}
