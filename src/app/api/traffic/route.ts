// ============================================================
// GET /api/traffic
// Fetches traffic speed bands from LTA DataMall
// Requires LTA_API_KEY environment variable
// ============================================================

import { NextResponse } from "next/server";
import { fetchTrafficSpeedBands } from "@/lib/api";

export const revalidate = 300;

export async function GET() {
  const apiKey = process.env.LTA_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { bands: [], error: "LTA_API_KEY not configured" },
      { status: 200 }
    );
  }

  try {
    const bands = await fetchTrafficSpeedBands(apiKey);
    return NextResponse.json({ bands });
  } catch (error) {
    console.error("Failed to fetch traffic data:", error);
    return NextResponse.json({ bands: [] }, { status: 200 });
  }
}
