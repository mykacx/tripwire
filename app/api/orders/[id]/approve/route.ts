import { NextResponse } from "next/server";
import { decide } from "@/lib/decisions";
import { errorResponse } from "@/lib/http";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    return NextResponse.json(await decide(id, "approve"));
  } catch (err) {
    return errorResponse(err);
  }
}
