import { NextResponse } from "next/server";
import { reviewOrder } from "@/lib/ai";
import { errorResponse } from "@/lib/http";

// "Re-run AI review" button.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const review = await reviewOrder(id);
    return NextResponse.json({
      review,
      message: review.source === "ai" ? `AI review updated (${review.model}).` : review.error ?? "AI unavailable — using rule score.",
    });
  } catch (err) {
    return errorResponse(err);
  }
}
