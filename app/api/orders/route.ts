import { NextResponse } from "next/server";
import { listOrders } from "@/lib/store";
import { withSignals } from "@/lib/signals";
import { pendingReviews, reviewMissingInBackground } from "@/lib/ai";

export const dynamic = "force-dynamic";

// All orders with their risk signals (computed fresh against current history) and AI review.
export async function GET() {
  const orders = await listOrders();
  reviewMissingInBackground(orders); // e.g. freshly seeded orders still awaiting a decision
  const views = orders.map((o) => withSignals(o, orders, pendingReviews));
  views.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return NextResponse.json({ orders: views, serverTime: new Date().toISOString() });
}
