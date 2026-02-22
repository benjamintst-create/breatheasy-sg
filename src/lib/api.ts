// ============================================================
// BreathEasy SG — API Client (v2)
// ============================================================

import type { CurrentConditions, TrafficSpeedBand } from "@/types";

const DATA_GOV_BASE = "https://api.data.gov.sg/v1";
const LTA_BASE = "https://datamall2.mytransport.sg/ltaodataservice";

// ── data.gov.sg ──

export async function fetchPM25(): Promise<{ value: number; regions: Record<string, number> }> {
  const res = await fetch(`${DATA_GOV_BASE}/environment/pm25`, { next: { revalidate: 300 } });
  const data = await res.json();
  const item = data.items?.[0];
  if (!item) return { value: 0, regions: {} };
  const readings = item.readings?.pm25_one_hourly ?? {};
  const values = Object.values(readings) as number[];
  const avg = values.length > 0 ? values.reduce((a: number, b: number) => a + b, 0) / values.length : 0;
  return { value: Math.round(avg), regions: readings };
}

export async function fetchWind(): Promise<{ speed: number; direction: string }> {
  const res = await fetch(`${DATA_GOV_BASE}/environment/wind-speed`, { next: { revalidate: 300 } });
  const data = await res.json();
  const items = data.items?.[0]?.readings ?? [];
  if (items.length === 0) return { speed: 0, direction: "N" };
  const avgSpeed = items.reduce((sum: number, r: { value: number }) => sum + r.value, 0) / items.length;

  let direction = "N";
  try {
    const dirRes = await fetch(`${DATA_GOV_BASE}/environment/wind-direction`, { next: { revalidate: 300 } });
    const dirData = await dirRes.json();
    const dirReadings = dirData.items?.[0]?.readings ?? [];
    if (dirReadings.length > 0) {
      const dirs = dirReadings.map((r: { value: number }) => degToCompass(r.value));
      direction = dirs.sort((a: string, b: string) =>
        dirs.filter((v: string) => v === b).length - dirs.filter((v: string) => v === a).length
      )[0] ?? "N";
    }
  } catch { /* fallback */ }

  return { speed: Math.round(avgSpeed * 3.6 * 10) / 10, direction };
}

function degToCompass(deg: number): string {
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}

export async function fetchTemperature(): Promise<number> {
  const res = await fetch(`${DATA_GOV_BASE}/environment/air-temperature`, { next: { revalidate: 300 } });
  const data = await res.json();
  const readings = data.items?.[0]?.readings ?? [];
  if (readings.length === 0) return 28;
  const avg = readings.reduce((sum: number, r: { value: number }) => sum + r.value, 0) / readings.length;
  return Math.round(avg * 10) / 10;
}

export async function fetchRainfall(): Promise<{ isRaining: boolean; intensity: string }> {
  const res = await fetch(`${DATA_GOV_BASE}/environment/rainfall`, { next: { revalidate: 300 } });
  const data = await res.json();
  const readings = data.items?.[0]?.readings ?? [];
  if (readings.length === 0) return { isRaining: false, intensity: "None" };
  const values = readings.map((r: { value: number }) => r.value);
  const maxRain = Math.max(...values);
  if (maxRain === 0) return { isRaining: false, intensity: "None" };
  if (maxRain < 2.5) return { isRaining: true, intensity: "Light" };
  if (maxRain < 7.5) return { isRaining: true, intensity: "Moderate" };
  return { isRaining: true, intensity: "Heavy" };
}

export async function fetchHumidity(): Promise<number> {
  const res = await fetch(`${DATA_GOV_BASE}/environment/relative-humidity`, { next: { revalidate: 300 } });
  const data = await res.json();
  const readings = data.items?.[0]?.readings ?? [];
  if (readings.length === 0) return 75;
  const avg = readings.reduce((sum: number, r: { value: number }) => sum + r.value, 0) / readings.length;
  return Math.round(avg);
}

export async function fetchAllConditions(): Promise<CurrentConditions> {
  const [pm25, wind, temperature, rainfall, humidity] = await Promise.all([
    fetchPM25(), fetchWind(), fetchTemperature(), fetchRainfall(), fetchHumidity(),
  ]);
  let pm25Band: CurrentConditions["pm25"]["band"] = "excellent";
  if (pm25.value > 75) pm25Band = "hazardous";
  else if (pm25.value > 55) pm25Band = "poor";
  else if (pm25.value > 37) pm25Band = "moderate";
  else if (pm25.value > 25) pm25Band = "good";

  return { pm25: { value: pm25.value, band: pm25Band, regions: pm25.regions }, wind, temperature, rainfall, humidity, timestamp: new Date().toISOString() };
}

// ── LTA DataMall (paginated) ──

export async function fetchTrafficSpeedBands(apiKey: string): Promise<TrafficSpeedBand[]> {
  if (!apiKey) return [];
  const allBands: TrafficSpeedBand[] = [];
  let skip = 0;

  try {
    while (true) {
      const url = skip === 0 ? `${LTA_BASE}/v3/TrafficSpeedBands` : `${LTA_BASE}/v3/TrafficSpeedBands?$skip=${skip}`;
      const res = await fetch(url, {
        headers: { AccountKey: apiKey, accept: "application/json" },
        next: { revalidate: 300 },
      });
      if (!res.ok) break;
      const data = await res.json();
      const entries = data.value ?? [];
      if (entries.length === 0) break;

      for (const e of entries) {
        const startLat = parseFloat(e.StartLat ?? e.startLat ?? 0) || 0;
        const startLng = parseFloat(e.StartLon ?? e.startLon ?? 0) || 0;
        const endLat = parseFloat(e.EndLat ?? e.endLat ?? 0) || 0;
        const endLng = parseFloat(e.EndLon ?? e.endLon ?? 0) || 0;
        if (startLat && startLng && endLat && endLng) {
          allBands.push({
            linkId: e.LinkID ?? e.linkId ?? "",
            roadName: e.RoadName ?? e.roadName ?? "",
            speedBand: e.SpeedBand ?? e.speedBand ?? 8,
            startLat, startLng, endLat, endLng,
          });
        }
      }
      skip += 500;
      if (skip >= 10000) break;
    }
    return allBands;
  } catch {
    return allBands;
  }
}
