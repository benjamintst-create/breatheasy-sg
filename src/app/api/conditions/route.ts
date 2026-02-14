import { NextResponse } from "next/server";
import { fetchAllConditions } from "@/lib/api";

// Fresh conditions each time
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const conditions = await fetchAllConditions();
    return NextResponse.json(conditions);
  } catch (error) {
    console.error("Failed to fetch conditions:", error);
    return NextResponse.json({
      pm25: { value: 0, band: "excellent", regions: {} },
      wind: { speed: 0, direction: "N" },
      temperature: 28, rainfall: { isRaining: false, intensity: "None" },
      humidity: 75, timestamp: new Date().toISOString(),
    });
  }
}
