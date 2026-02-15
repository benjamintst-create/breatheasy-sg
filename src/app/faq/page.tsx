"use client";

import Link from "next/link";
import { useState } from "react";

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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-bold text-[#4ecdc4] mt-10 mb-4">{children}</h2>;
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

export default function FAQPage() {
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
            run for the cleanest air possible.
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
            between a human (a corporate real estate lawyer and avid runner based in Jurong West) and Claude.
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
            An expressway always has hundreds of cars; a residential lane has very few.
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
            Stop-start traffic produces significantly more emissions per vehicle than free-flowing traffic — idling
            engines are inefficient. We calculate a congestion ratio (currentSpeed ÷ freeFlowSpeed) and apply a
            multiplier:
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
            Exhaust concentrations drop with distance from the road. We use a linear decay within a 400m radius:
          </p>
          <p className="bg-[#1e3050] px-3 py-2 rounded-lg font-mono text-xs text-[#4ecdc4]">
            distanceFactor = 1 − (distance_metres / 400)
          </p>
          <p>At 0m (roadside), full penalty. At 400m, zero penalty. Beyond 400m, that road has no effect.</p>

          <p className="font-semibold text-[#d0dce8] mt-3">Step 4: Worst Road Wins</p>
          <p>
            For each point along your route, we find the single worst nearby road (highest exhaust score) within 400m.
            We deliberately chose a &ldquo;worst road&rdquo; model over accumulation — because TomTom breaks roads into many
            sub-segments, and summing them would double-count the same road multiple times.
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
            Singapore has significant industrial estates where air quality is measurably worse — heavy vehicles
            (trucks, lorries), diesel fumes, and factory emissions go beyond what road classification alone captures. A
            collector road inside Tuas Industrial is substantially worse than the same road class in Bishan.
          </p>
          <p>We model 21 industrial zones across Singapore, including:</p>
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
          <p className="mt-2">Each zone applies two effects:</p>
          <Table
            headers={["Location", "Baseline Addition", "Traffic Multiplier"]}
            rows={[
              ["Inside industrial zone", "+1.2 points", "1.8× traffic penalty"],
              ["Within 300m of boundary", "+0.8 × proximity factor", "Up to 1.6× traffic penalty"],
              ["Beyond 300m", "No effect", "No effect"],
            ]}
          />
          <p>
            The <strong>baseline addition</strong> represents factory and industrial emissions that exist regardless of
            road traffic. The <strong>multiplier</strong> reflects that vehicles in industrial areas are
            disproportionately trucks and diesel, so the same road class carries worse exhaust.
          </p>
          <p>
            If your route passes through or near industrial zones, this is surfaced transparently in the Traffic
            Exposure factor detail, e.g. &ldquo;Significant traffic exposure (42% near industrial zones)&rdquo;.
          </p>
        </>
      ),
    },
    {
      q: "How does Air Quality scoring work?",
      a: (
        <>
          <p>Air Quality combines a static baseline (from the pre-computed grid) with real-time modifiers:</p>

          <p className="font-semibold text-[#d0dce8] mt-2">Static Grid (33,938 cells at 100m resolution)</p>
          <p>
            A pre-computed grid covering all of Singapore, built from OpenStreetMap data. Each cell has a baseline AQI
            score factoring in proximity to expressways, arterial roads, junctions, industrial zones, parks, water
            bodies, and building density (street canyon effect). Cells deep inside parks score ~1.0 (excellent); cells
            adjacent to expressways score ~6.0+ (poor).
          </p>

          <p className="font-semibold text-[#d0dce8] mt-2">Real-Time Modifiers</p>
          <Table
            headers={["Factor", "Range", "How it works"]}
            rows={[
              ["PM2.5", "0 to +4.0", "NEA real-time readings. ≤12 µg/m³ = no penalty; 55+ µg/m³ = +3.0; 75+ = +4.0"],
              ["Wind", "−1.0 to 0", "Wind disperses pollutants. ≥20 km/h = −1.0 (significant benefit)"],
              ["Time of Day", "−0.5 to +1.0", "Rush hours (7–10am, 4–8pm) add penalty; late night (12–5am) gets bonus"],
              ["Rainfall", "−2.0 to 0", "Rain scrubs particulates from air. Heavy rain = −2.0 (major benefit)"],
            ]}
          />

          <p className="mt-2 bg-[#1e3050] px-3 py-2 rounded-lg font-mono text-xs text-[#4ecdc4]">
            pointScore = staticBase + pm25Mod + windMod + timeMod + rainMod + trafficMod<br />
            clamped to range [1, 10]
          </p>
        </>
      ),
    },
    {
      q: "How does Green Corridor scoring work?",
      a: (
        <p>
          Green Corridor measures what proportion of your route passes through parks and green space. Points are
          classified using the static grid: cells with a baseline score ≤1.5 are considered &ldquo;deep green&rdquo; (inside
          parks/reserves), and cells ≤2.5 are considered &ldquo;park-adjacent&rdquo;. The green percentage is calculated as a
          weighted blend: 70% weight on deep green points + 30% weight on park-adjacent points. A route entirely
          through East Coast Park would score ~100%; a route entirely through the CBD would score near 0%.
        </p>
      ),
    },
    {
      q: "How does Consistency scoring work?",
      a: (
        <p>
          Consistency measures how uniform conditions are along your route, using the standard deviation of point
          scores. A route that&apos;s consistently &ldquo;good&rdquo; (e.g., all points scoring 3–4) rates higher than one that
          alternates between &ldquo;excellent&rdquo; and &ldquo;poor&rdquo; — because those poor stretches still expose you to bad air,
          regardless of the great sections. Formula: <code className="text-[#4ecdc4] text-xs bg-[#1e3050] px-1 rounded">consistency = (1 − stdDev/3) × 100%</code>.
        </p>
      ),
    },
  ];

  const dataFAQ: FAQItem[] = [
    {
      q: "What data sources does BreathEasy use?",
      a: (
        <>
          <Table
            headers={["Source", "Data", "Update Frequency", "Cost"]}
            rows={[
              ["NEA (data.gov.sg)", "PM2.5, wind speed/direction, temperature, rainfall", "Every 5–60 minutes", "Free"],
              ["LTA DataMall", "Island-wide traffic speed bands (expressways + arterials)", "Every 5 minutes", "Free"],
              ["TomTom Flow Segment Data", "Per-road speed, congestion ratio, road class (FRC), road geometry", "Real-time", "Free tier (~2,500 req/day)"],
              ["OpenStreetMap", "Expressways, arterials, parks, industrial zones, buildings, cycleways", "Static (pre-computed)", "Free"],
            ]}
          />
          <p className="mt-2">
            All data sources are free-tier or open data. No paid API subscriptions are required to run this app.
          </p>
        </>
      ),
    },
    {
      q: "How does the TomTom + LTA hybrid work?",
      a: (
        <>
          <p>We use both traffic data providers for complementary coverage:</p>
          <p>
            <strong>LTA DataMall</strong> provides island-wide speed bands for major roads — great for knowing overall
            traffic conditions but sparse in residential areas. <strong>TomTom Flow Segment Data</strong> provides
            per-road lookups with road class (FRC) and congestion ratios — covering every road in Singapore including
            minor residential streets.
          </p>
          <p>
            When you upload a route, we sample up to 25 points along it and query TomTom for road-level data at each
            point. LTA data supplements this with broader context. Each road segment carries its FRC
            classification and real-time congestion ratio, which feed directly into the exhaust volume model.
          </p>
        </>
      ),
    },
    {
      q: "How accurate is this?",
      a: (
        <>
          <p>
            BreathEasy is a <strong>best-effort model</strong>, not a scientific instrument. The scoring is based on
            well-established principles (exhaust dispersion with distance, congestion increasing per-vehicle emissions,
            road classification as a proxy for traffic volume) but uses several simplifications:
          </p>
          <ul className="list-disc list-inside space-y-1 text-xs">
            <li>Road class is a proxy for traffic volume — actual vehicle counts are not freely available in real-time</li>
            <li>Industrial zone boundaries are approximate polygons, not exact URA zoning boundaries</li>
            <li>Wind direction is not factored into dispersion (only wind speed)</li>
            <li>Elevation and street canyon effects are modelled coarsely via building density</li>
            <li>TomTom samples are limited to ~25 points per route to stay within free-tier API limits</li>
          </ul>
          <p>
            That said, the relative rankings are meaningful — a route through East Coast Park will reliably score
            better than one along Pandan Loop during rush hour. Use the scores for comparative decisions, not absolute
            health claims.
          </p>
        </>
      ),
    },
  ];

  return (
    <main className="min-h-screen bg-[#0a1628] text-[#e0e8f0]">
      <div className="max-w-3xl mx-auto px-5 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link href="/" className="text-[#4ecdc4] text-sm hover:underline mb-2 inline-block">← Back to app</Link>
            <h1 className="text-2xl font-bold text-[#4ecdc4]">
              FAQ & Methodology
            </h1>
            <p className="text-sm text-[#5a7090] mt-1">How BreathEasy SG works under the hood</p>
          </div>
        </div>

        {/* Vibe coded badge */}
        <div className="bg-[#0f1d32] border border-[#1e3050] rounded-xl px-5 py-4 mb-8">
          <p className="text-sm text-[#8aa0b8] leading-relaxed">
            🫁 BreathEasy SG was <strong className="text-[#4ecdc4]">vibe coded with Claude Opus 4.6</strong> — Anthropic&apos;s
            most advanced AI model. From concept to production, the entire app (scoring engine, data pipeline, UI, and
            this FAQ) was developed through collaborative human–AI sessions. The source code is open
            on <a href="https://github.com/benjamintst-create/breatheasy-sg" target="_blank" rel="noopener noreferrer" className="text-[#4ecdc4] hover:underline">GitHub</a>.
          </p>
        </div>

        {/* General */}
        <SectionTitle>General</SectionTitle>
        <div className="space-y-2">
          {generalFAQ.map((item, i) => <Accordion key={i} item={item} />)}
        </div>

        {/* Scoring Methodology */}
        <SectionTitle>Scoring Methodology</SectionTitle>
        <div className="space-y-2">
          {methodologyFAQ.map((item, i) => <Accordion key={i} item={item} />)}
        </div>

        {/* Data Sources */}
        <SectionTitle>Data Sources & Accuracy</SectionTitle>
        <div className="space-y-2">
          {dataFAQ.map((item, i) => <Accordion key={i} item={item} />)}
        </div>

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-[#1e3050] text-center">
          <p className="text-xs text-[#3a5070]">
            BreathEasy SG · Built with Claude Opus 4.6 · Data from NEA, LTA, TomTom, OpenStreetMap
          </p>
        </div>
      </div>
    </main>
  );
}
