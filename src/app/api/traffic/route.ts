import { NextResponse } from "next/server";
import { fetchTrafficSpeedBands } from "@/lib/api";

// No caching — always fetch fresh traffic data
export const dynamic = "force-dynamic";

export async function GET() {
  const apiKey = process.env.LTA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ bands: [], error: "LTA_API_KEY not configured" }, { status: 200 });
  }
  try {
    const bands = await fetchTrafficSpeedBands(apiKey);
    return NextResponse.json({ bands });
  } catch (error) {
    console.error("Failed to fetch traffic data:", error);
    return NextResponse.json({ bands: [] }, { status: 200 });
  }
}
