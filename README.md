# BreathEasy SG

Hyperlocal air quality scoring for Singapore runners. Click any point on the map to get a 1-10 pollution exposure score, compare popular running routes, and find the best time to run.

## Quick Start

```bash
npm install
cp .env.example .env.local   # add your API keys (optional)
npm run dev                   # http://localhost:3000
```

## Architecture

```
User taps map → Score = Static Grid + Dynamic Modifiers
```

**Static Grid** (precomputed from OSM data):
- Expressway proximity (exponential decay, 120m half-life)
- Arterial road proximity (80m decay)
- Junction stop-start penalty
- Industrial zone proximity
- Green buffer bonus (parks)
- Street canyon effect

**Dynamic Modifiers** (real-time APIs, polled every 5 min):
- PM2.5 from data.gov.sg (regional readings)
- Wind speed/direction (dispersal factor)
- Time of day (traffic pattern proxy)
- Rainfall (particulate washout)
- Traffic speed bands from LTA DataMall

## Project Structure

```
src/
├── app/
│   ├── layout.tsx          # Root layout, metadata
│   ├── page.tsx            # Main page — state orchestration
│   ├── globals.css         # Tailwind + Leaflet dark theme
│   └── api/
│       ├── conditions/     # Proxies data.gov.sg weather/air quality
│       └── traffic/        # Proxies LTA DataMall speed bands
├── components/
│   ├── Map.tsx             # Leaflet map, OneMap tiles, routes, heatmap
│   └── Sidebar.tsx         # Conditions, recommendation, hourly chart, routes
├── lib/
│   ├── scoring.ts          # Scoring engine (static + dynamic modifiers)
│   ├── api.ts              # Server-side API clients (data.gov.sg, LTA)
│   └── routes.ts           # 8 popular Singapore running routes
└── types/
    └── index.ts            # TypeScript interfaces
```

## Environment Variables

| Variable | Required | Source |
|----------|----------|--------|
| `LTA_API_KEY` | No | [LTA DataMall](https://datamall.lta.gov.sg/) — instant approval |
| `NEXT_PUBLIC_ONEMAP_TOKEN` | No | [OneMap](https://www.onemap.gov.sg/apidocs/) — quick form |

The app works without any API keys. Basemap tiles load without a token for testing. LTA traffic data is optional (enhances scoring near congested roads).

## Adding the Static Grid

The app ships with default base scores. To enable the full 50m×50m precomputed grid:

1. Run the data pipeline (see `../breatheasy/README.md`)
2. Copy `static_grid.json` to `public/data/`
3. The frontend loads it automatically on page load

## Deploy to Vercel

```bash
npm i -g vercel
vercel --prod
```

Add your `LTA_API_KEY` in Vercel → Settings → Environment Variables.

## Features

- **Click-to-score**: Tap any point on the map for an instant 1-10 rating
- **Route comparison**: 8 popular routes ranked by current air quality
- **Hourly forecast**: 24-hour chart showing best/worst times to run
- **Score breakdown**: See exactly what's contributing to the score
- **Live conditions**: PM2.5, wind, rain, temperature updated every 5 min
- **Mobile-first**: Responsive layout, installable as PWA
- **Dark theme**: Easy on the eyes for early morning/evening runs

## Data Sources

All free with instant or no registration:

| Source | Data | Registration |
|--------|------|-------------|
| OpenStreetMap | Roads, parks, buildings | None |
| data.gov.sg | PM2.5, weather, rainfall | None |
| LTA DataMall | Traffic speed bands | Instant |
| OneMap (SLA) | Basemap tiles | Quick form |
