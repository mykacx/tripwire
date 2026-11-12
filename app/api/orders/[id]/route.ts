import { NextResponse } from "next/server";
import { listOrders } from "@/lib/store";
import { withSignals } from "@/lib/signals";
import { pendingReviews } from "@/lib/ai";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const orders = await listOrders();
  const order = orders.find((o) => o.id === id);
  if (!order) return NextResponse.json({ error: `Order ${id} not found.` }, { status: 404 });
  return NextResponse.json({ order: withSignals(order, orders, pendingReviews) });
}
