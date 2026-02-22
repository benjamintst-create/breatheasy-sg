import { NextResponse } from "next/server";
import { fetchAllConditions } from "@/lib/api";

// Fresh conditions each time
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const conditions = await fetchAllConditions();
    return NextResponse.json(conditions);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch conditions" },
      { status: 502 }
    );
  }
}
