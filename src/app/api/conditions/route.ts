// ============================================================
// GET /api/conditions
// Fetches real-time weather + air quality from data.gov.sg
// ============================================================

import { NextResponse } from "next/server";
import { fetchAllConditions } from "@/lib/api";

export const revalidate = 300; // ISR: refresh every 5 min

export async function GET() {
  try {
    const conditions = await fetchAllConditions();
    return NextResponse.json(conditions);
  } catch (error) {
    console.error("Failed to fetch conditions:", error);
    // Return sensible defaults so the app doesn't break
    return NextResponse.json(
      {
        pm25: { value: 15, band: "good", regions: {} },
        wind: { speed: 10, direction: "SE" },
        temperature: 28,
        rainfall: { isRaining: false, intensity: "None" },
        humidity: 75,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  }
}
