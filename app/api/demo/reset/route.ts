import { NextResponse } from "next/server";
import { resetDemoData } from "@/lib/store";
import { errorResponse } from "@/lib/http";

// Starts over with only the seeded demo orders (re-dated relative to now). Live sandbox orders are removed from the queue.
export async function POST() {
  try {
    await resetDemoData();
    return NextResponse.json({ message: "Reset complete: the queue now contains only the seeded demo orders." });
  } catch (err) {
    return errorResponse(err);
  }
}
