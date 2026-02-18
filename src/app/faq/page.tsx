"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

interface FAQItem {
  q: string;
  a: React.ReactNode;
}

function Accordion({ item }: { item: FAQItem }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-[#1e3050] rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-[#162340] transition-colors"
      >
        <span className="text-[15px] font-semibold text-[#d0dce8] pr-4">{item.q}</span>
        <svg
          className={`w-4 h-4 text-[#4ecdc4] shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-5 pb-5 text-sm text-[#8aa0b8] leading-relaxed space-y-3">
          {item.a}
        </div>
      )}
    </div>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} className="text-left px-3 py-2 bg-[#1e3050] text-[#8aa0b8] font-medium border border-[#2a4060]">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2 border border-[#1e3050] text-[#8aa0b8]">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const SECTIONS = [
  { id: "general", label: "General" },
  { id: "methodology", label: "Methodology" },
  { id: "data", label: "Data & Accuracy" },
];

export default function FAQPage() {
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 400);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const generalFAQ: FAQItem[] = [
    {
      q: "What is BreathEasy SG?",
      a: (
        <>
          <p>
            BreathEasy SG is a hyperlocal air quality scoring app for Singapore runners. Upload a GPX route file from
            Strava, Garmin, Nike Run Club, or any GPS watch, and get a detailed breathability score for every 50 metres
            of your route — factoring in real-time traffic, air quality, weather, and how green your path is.
          </p>
          <p>
            The goal is to help runners make informed decisions about <strong>when</strong> and <strong>where</strong> to
            run for the cleanest air possible — especially in Singapore where running routes often pass near expressways,
            arterial roads, and industrial estates with heavy vehicle traffic and factory emissions.
          </p>
        </>
      ),
    },
    {
      q: "How was this built?",
      a: (
        <>
          <p>
            BreathEasy SG was <strong>vibe coded with Claude Opus 4.6</strong> (Anthropic&apos;s most advanced AI model) in
            a series of iterative sessions — from initial concept and technical specification through to production
            deployment. The entire codebase, scoring model, data pipeline, and UI were developed collaboratively
            between a human (a busy professional and occasional runner based in the far west of Singapore) and Claude.
          </p>
          <p>
            The tech stack is Next.js deployed on Vercel, with Leaflet for maps and Tailwind CSS for styling. All data
            comes from free government and commercial APIs — no paid tiers required.
          </p>
        </>
      ),
    },
    {
      q: "What GPX formats are supported?",
      a: (
        <p>
          Standard GPX 1.1 files with trackpoints (<code className="text-[#4ecdc4] text-xs bg-[#1e3050] px-1 rounded">trkpt</code> elements).
          This covers exports from Strava, Garmin Connect, Nike Run Club, Apple Fitness, Coros, Suunto, and most GPS
          watches. The parser also handles Garmin&apos;s non-standard <code className="text-[#4ecdc4] text-xs bg-[#1e3050] px-1 rounded">&lt;n&gt;</code> tag
          for track names.
        </p>
      ),
    },
    {
      q: "Is my data stored anywhere?",
      a: (
        <p>
          Your routes are stored locally in your browser&apos;s localStorage only — nothing is sent to any server or
          database. The app retains your last 30 uploaded routes. GPX files are parsed client-side; only sampled
          coordinates (up to 25 points per route) are sent to the traffic API for real-time lookups.
        </p>
      ),
    },
    {
      q: "Why does the score change when I re-analyze the same route?",
      a: (
        <p>
          Scores reflect <strong>real-time conditions</strong> — PM2.5 levels, wind speed, rainfall, traffic
          congestion, and time of day all fluctuate. The same route might score 75 at 6am on a breezy Sunday morning
          and 52 at 6pm on a congested weekday. The static components (green corridor, road proximity) stay the same;
          the dynamic components change with every refresh.
        </p>
      ),
    },
  ];

  const methodologyFAQ: FAQItem[] = [
    {
      q: "How is the overall score calculated?",
      a: (
        <>
          <p>Each route receives a 0–100% overall score, which is a weighted average of four factors:</p>
          <Table
            headers={["Factor", "Weight", "What it measures"]}
            rows={[
              ["Traffic Exposure", "40%", "Exhaust fumes from nearby roads — road class, congestion, distance, industrial zones"],
              ["Air Quality", "30%", "Real-time PM2.5, wind, rainfall, time of day"],
              ["Green Corridor", "20%", "Proportion of route through parks, nature reserves, and green space"],
              ["Consistency", "10%", "How uniform conditions are along the route (penalises routes with wild swings)"],
            ]}
          />
          <p className="mt-2">
            Traffic Exposure is weighted highest because, for runners, proximity to vehicle exhaust is typically the
            single biggest controllable factor in air quality — and it varies dramatically between routes.
          </p>
        </>
      ),
    },
    {
      q: "How does the Traffic Exposure scoring work?",
      a: (
        <>
          <p>
            This is the core innovation of BreathEasy. Rather than using raw traffic speed (which conflates a quiet
            residential street at 30 km/h with a congested expressway at 30 km/h), we model <strong>exhaust
            volume</strong> — the actual amount of fumes a runner would inhale.
          </p>
          <p><strong>Exhaust volume = traffic volume × emissions per vehicle × distance decay</strong></p>

          <p className="font-semibold text-[#d0dce8] mt-3">Step 1: Traffic Volume (Road Class)</p>
          <p>
            We use TomTom&apos;s Functional Road Classification (FRC) as a proxy for how many vehicles use each road.
          </p>
          <Table
            headers={["Road Class", "FRC", "Volume Baseline"]}
            rows={[
              ["Expressway / Motorway", "FRC 0–1", "1.0 (maximum)"],
              ["Major Arterial", "FRC 2", "0.7"],
              ["Secondary Road", "FRC 3", "0.5"],
              ["Collector Road", "FRC 4", "0.25"],
              ["Local Road", "FRC 5", "0.12"],
              ["Residential Street", "FRC 6–7", "0.05"],
            ]}
          />

          <p className="font-semibold text-[#d0dce8] mt-3">Step 2: Congestion Emission Multiplier</p>
          <p>
            Stop-start traffic produces significantly more emissions per vehicle than free-flowing traffic.
          </p>
          <Table
            headers={["Congestion Ratio", "Traffic State", "Emission Multiplier"]}
            rows={[
              ["< 0.25", "Standstill", "3.0×"],
              ["0.25 – 0.4", "Severe jam", "2.5×"],
              ["0.4 – 0.6", "Slow", "1.8×"],
              ["0.6 – 0.8", "Moderate", "1.3×"],
              ["0.8 – 0.95", "Slightly slow", "1.1×"],
              ["> 0.95", "Free flow", "1.0×"],
            ]}
          />

          <p className="font-semibold text-[#d0dce8] mt-3">Step 3: Distance Decay</p>
          <p>
            Linear decay within 400m. At 0m, full penalty. At 400m, zero. Beyond 400m, no effect.
          </p>
          <p className="bg-[#1e3050] px-3 py-2 rounded-lg font-mono text-xs text-[#4ecdc4]">
            distanceFactor = 1 − (distance_metres / 400)
          </p>

          <p className="font-semibold text-[#d0dce8] mt-3">Step 4: Worst Road Wins</p>
          <p>
            For each point, we take the single worst nearby road within 400m (not accumulated), to avoid double-counting
            road sub-segments.
          </p>
          <p className="bg-[#1e3050] px-3 py-2 rounded-lg font-mono text-xs text-[#4ecdc4]">
            exhaust = roadVolume(frc) × emissionMultiplier(congestion) × distanceFactor<br />
            penalty = min(4.0, worstExhaust × 3.5)
          </p>
        </>
      ),
    },
    {
      q: "How do industrial zones affect the score?",
      a: (
        <>
          <p>
            Industrial estates have heavy vehicles, diesel fumes, and factory emissions beyond what road classification
            alone captures. We model 21 industrial zones across Singapore:
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mt-1">
            {[
              "Jurong Industrial Estate", "Tuas Industrial", "Tuas South", "Pioneer / Gul",
              "Pandan Loop / Penjuru", "Jalan Buroh Industrial", "Bukit Batok Industrial",
              "Woodlands Industrial", "Senoko Industrial", "Kranji Industrial",
              "Mandai Industrial", "Seletar Aerospace", "Kallang/Kolam Ayer",
              "Tai Seng Industrial", "Paya Lebar Industrial", "Defu Industrial",
              "Ubi / Eunos Industrial", "Changi Business Park", "Loyang Industrial",
              "Tanjong Kling Industrial", "Keppel / Tanjong Pagar Terminal",
            ].map(z => <span key={z} className="text-[#8aa0b8]">• {z}</span>)}
          </div>
          <Table
            headers={["Location", "Baseline Addition", "Traffic Multiplier"]}
            rows={[
              ["Inside industrial zone", "+1.2 points", "1.8× traffic penalty"],
              ["Within 300m of boundary", "+0.8 × proximity", "Up to 1.6×"],
              ["Beyond 300m", "No effect", "No effect"],
            ]}
          />
          <p>
            Surfaced transparently in Traffic Exposure detail, e.g. &ldquo;Significant traffic exposure (42% near industrial zones)&rdquo;.
          </p>
        </>
      ),
    },
    {
      q: "How does Air Quality scoring work?",
      a: (
        <>
          <p>Combines a static baseline grid with real-time modifiers:</p>
          <p className="font-semibold text-[#d0dce8] mt-2">Static Grid — 33,938 cells at 100m resolution</p>
          <p>
            Each cell&apos;s baseline factors in proximity to expressways, arterials, junctions, industrial zones, parks,
            water bodies, and building density.
          </p>
          <p className="font-semibold text-[#d0dce8] mt-2">Real-Time Modifiers</p>
          <Table
            headers={["Factor", "Range", "How it works"]}
            rows={[
              ["PM2.5", "0 to +4.0", "NEA readings. ≤12 µg/m³ = 0; 55+ = +3.0; 75+ = +4.0"],
              ["Wind", "−1.0 to 0", "≥20 km/h = −1.0; ≥12 = −0.5; ≥6 = −0.2; calm = neutral"],
              ["Time of Day", "−0.5 to +1.0", "Rush hours (7–9am, 5–7pm) +1.0; shoulders +0.5; pre-dawn bonus −0.5"],
              ["Rainfall", "−2.0 to 0", "Heavy rain = −2.0 (scrubs particulates)"],
            ]}
          />
          <p className="mt-2 bg-[#1e3050] px-3 py-2 rounded-lg font-mono text-xs text-[#4ecdc4]">
            pointScore = staticBase + pm25Mod + windMod + timeMod + rainMod + trafficMod &nbsp;[clamped 1–10]
          </p>
        </>
      ),
    },
    {
      q: "How do Green Corridor and Consistency work?",
      a: (
        <>
          <p>
            <strong>Green Corridor (20%)</strong> — Measures how much of your route passes through green space. We use
            two complementary methods:
          </p>
          <p>
            <strong>1. Static grid:</strong> Grid cells ≤1.5 = &ldquo;deep green&rdquo; (parks/reserves), ≤2.5 = &ldquo;park-adjacent&rdquo;.
          </p>
          <p>
            <strong>2. Known park polygons:</strong> 20 major parks and green corridors are defined as explicit zones,
            ensuring they&apos;re always recognised regardless of grid resolution:
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mt-1">
            {[
              "East Coast Park", "Gardens by the Bay", "Marina Bay Promenade", "Botanic Gardens",
              "MacRitchie Reservoir", "Bedok Reservoir Park", "Pandan Reservoir Park", "Jurong Lake Gardens",
              "West Coast Park", "Pasir Ris Park", "Bishan-AMK Park", "Fort Canning Park",
              "Labrador Nature Reserve", "Kent Ridge Park", "Seletar Reservoir", "Punggol Waterway Park",
              "Coney Island", "Tampines Eco Green", "Southern Ridges", "Bukit Timah Nature Reserve",
            ].map(z => <span key={z} className="text-[#8aa0b8]">• {z}</span>)}
          </div>
          <p>
            <strong>3. Park Connectors (PCN):</strong> 12 major park connector routes are defined as polylines.
            Points within 50m get a discounted green score (base 2.5 vs 1.2 for parks), contributing at 0.15 weight
            to the Green Corridor score (vs 0.7 for parks). Connectors include:
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mt-1">
            {[
              "Eastern Coastal PCN", "Ulu Pandan PCN", "Jurong PCN", "Kallang PCN",
              "Punggol PCN", "NE Riverine Loop", "Alexandra Canal PCN", "Tampines PCN",
              "Sungei Serangoon PCN", "Central Catchment PCN", "Clementi PCN", "Yishun PCN",
            ].map(z => <span key={z} className="text-[#8aa0b8]">• {z}</span>)}
          </div>
          <p className="mt-2">
            Points inside a park get a low base score (1.2); points within 150m get park-adjacent treatment (2.0);
            points on park connectors get 2.5.
            The better of grid-based or polygon-based recognition is used, so parks are never missed.
            Weighted blend: 70% deep green + 30% park-adjacent.
          </p>
          <p>
            <strong>Consistency (10%)</strong> — Standard deviation of point scores. A consistently &ldquo;good&rdquo; route
            rates higher than one that swings between excellent and poor.
            Formula: <code className="text-[#4ecdc4] text-xs bg-[#1e3050] px-1 rounded">(1 − stdDev/3) × 100%</code>.
          </p>
        </>
      ),
    },
  ];

  const dataFAQ: FAQItem[] = [
    {
      q: "What data sources does BreathEasy use?",
      a: (
        <Table
          headers={["Source", "Data", "Frequency", "Cost"]}
          rows={[
            ["NEA (data.gov.sg)", "PM2.5, wind, temp, rainfall", "5–60 min", "Free"],
            ["LTA DataMall", "Island-wide traffic speed bands", "5 min", "Free"],
            ["TomTom Flow", "Per-road speed, FRC, congestion ratio, geometry", "Real-time", "Free (~2,500 req/day)"],
            ["OpenStreetMap", "Roads, parks, industrial zones, buildings, cycleways", "Static", "Free"],
          ]}
        />
      ),
    },
    {
      q: "How does the TomTom + LTA hybrid work?",
      a: (
        <p>
          <strong>LTA</strong> provides island-wide speed bands for major roads — good for overall conditions but sparse
          in residential areas. <strong>TomTom</strong> provides per-road lookups with FRC and congestion ratios — covering
          every road including minor streets. We sample up to 25 points along your route and query TomTom for each.
          LTA supplements with broader context.
        </p>
      ),
    },
    {
      q: "How accurate is this?",
      a: (
        <>
          <p>
            BreathEasy is a <strong>best-effort model</strong>, not a scientific instrument. Key simplifications:
          </p>
          <ul className="list-disc list-inside space-y-1 text-xs">
            <li>Road class is a proxy for traffic volume — actual vehicle counts aren&apos;t freely available in real-time</li>
            <li>Industrial zone boundaries are approximate polygons, not exact URA zoning</li>
            <li>Wind direction is not factored into dispersion (only speed)</li>
            <li>TomTom samples limited to ~25 points per route (free-tier API limits)</li>
          </ul>
          <p>
            The relative rankings are meaningful — a park route will reliably score better than one along an industrial
            road during rush hour. Use scores for comparative decisions, not absolute health claims.
          </p>
        </>
      ),
    },
  ];

  return (
    <main className="min-h-screen bg-[#0a1628] text-[#e0e8f0]">
      {/* Sticky nav */}
      <div className="sticky top-0 z-50 bg-[#0a1628]/95 backdrop-blur-sm border-b border-[#1e3050]">
        <div className="max-w-3xl mx-auto px-5 py-3 flex items-center justify-between">
          <Link href="/" className="text-[#4ecdc4] text-sm font-semibold hover:underline">← BreathEasy SG</Link>
          <div className="flex gap-4">
            {SECTIONS.map(s => (
              <a key={s.id} href={`#${s.id}`} className="text-xs text-[#5a7090] hover:text-[#4ecdc4] transition-colors">
                {s.label}
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-5 py-8">
        {/* Header */}
        <h1 className="text-2xl font-bold text-[#4ecdc4] mb-1">FAQ & Methodology</h1>
        <p className="text-sm text-[#5a7090] mb-6">How BreathEasy SG works under the hood</p>

        {/* Vibe coded badge */}
        <div className="bg-[#0f1d32] border border-[#1e3050] rounded-xl px-5 py-4 mb-8">
          <p className="text-sm text-[#8aa0b8] leading-relaxed">
            🫁 BreathEasy SG was <strong className="text-[#4ecdc4]">vibe coded with Claude Opus 4.6</strong> — Anthropic&apos;s
            most advanced AI model. The entire app was developed through collaborative human–AI sessions. Source
            on <a href="https://github.com/benjamintst-create/breatheasy-sg" target="_blank" rel="noopener noreferrer" className="text-[#4ecdc4] hover:underline">GitHub</a>.
          </p>
        </div>

        {/* General */}
        <h2 id="general" className="text-lg font-bold text-[#4ecdc4] mb-4 scroll-mt-16">General</h2>
        <div className="space-y-2 mb-10">
          {generalFAQ.map((item, i) => <Accordion key={i} item={item} />)}
        </div>

        {/* Methodology */}
        <h2 id="methodology" className="text-lg font-bold text-[#4ecdc4] mb-4 scroll-mt-16">Scoring Methodology</h2>
        <div className="space-y-2 mb-10">
          {methodologyFAQ.map((item, i) => <Accordion key={i} item={item} />)}
        </div>

        {/* Data */}
        <h2 id="data" className="text-lg font-bold text-[#4ecdc4] mb-4 scroll-mt-16">Data Sources & Accuracy</h2>
        <div className="space-y-2 mb-10">
          {dataFAQ.map((item, i) => <Accordion key={i} item={item} />)}
        </div>

        {/* Footer */}
        <div className="pt-6 border-t border-[#1e3050] text-center">
          <p className="text-xs text-[#3a5070]">
            BreathEasy SG · Built with Claude Opus 4.6 · Data from NEA, LTA, TomTom, OpenStreetMap
          </p>
        </div>
      </div>

      {/* Back to top */}
      {showTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-6 right-6 z-50 w-10 h-10 rounded-full bg-[#4ecdc4] text-[#0a1628] flex items-center justify-center shadow-lg hover:bg-[#3dbdb5] transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
          </svg>
        </button>
      )}
    </main>
  );
}
