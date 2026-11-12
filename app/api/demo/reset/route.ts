import { NextResponse } from "next/server";
import { resetDemoData } from "@/lib/store";
import { errorResponse } from "@/lib/http";

// Restores seeded demo orders (re-dated relative to now). Live sandbox orders are kept.
export async function POST() {
  try {
    await resetDemoData();
    return NextResponse.json({ message: "Demo data reset. Live sandbox orders were kept." });
  } catch (err) {
    return errorResponse(err);
  }
}
