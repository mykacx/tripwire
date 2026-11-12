import { NextResponse } from "next/server";
import { listOrders } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const orders = await listOrders();
  orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return NextResponse.json({ orders, serverTime: new Date().toISOString() });
}
