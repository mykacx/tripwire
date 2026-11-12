import { NextResponse } from "next/server";
import { listOrders } from "@/lib/store";
import { withSignals } from "@/lib/signals";

export const dynamic = "force-dynamic";

// All orders with their risk signals, computed fresh against current history.
export async function GET() {
  const orders = await listOrders();
  const views = orders.map((o) => withSignals(o, orders));
  views.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return NextResponse.json({ orders: views, serverTime: new Date().toISOString() });
}
