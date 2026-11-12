"use client";

// Phase 1 placeholder queue. Replaced by the AG Grid review queue in Phase 4.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Order } from "@/lib/types";

export default function QueuePage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/orders", { cache: "no-store" });
    setOrders((await res.json()).orders);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  async function act(id: string, action: "approve" | "void") {
    if (!confirm(`${action === "approve" ? "Capture" : "Void"} order ${id}?`)) return;
    const res = await fetch(`/api/orders/${id}/${action}`, { method: "POST" });
    const data = await res.json();
    setMsg({ ok: res.ok, text: res.ok ? data.message : data.error });
    load();
  }

  return (
    <div className="mx-auto max-w-6xl p-8">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tripwire</h1>
          <p className="text-slate-500">The AI spots the risk, you make the call, and fraud is stopped before the money moves.</p>
        </div>
        <Link href="/store" className="text-sm font-medium text-slate-600 hover:text-slate-900">Demo store →</Link>
      </header>
      {msg && <div className={`mb-4 rounded-md p-3 text-sm ${msg.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>{msg.text}</div>}
      <table className="w-full border-collapse bg-white text-sm shadow-sm">
        <thead className="bg-slate-50 text-left text-slate-600">
          <tr>{["Order", "Status", "Customer", "Total", "Payer → Ship", "Authorization", ""].map((h) => <th key={h} className="p-2">{h}</th>)}</tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} className="border-t border-slate-100">
              <td className="p-2 font-mono">{o.id} {o.demo ? "(demo)" : "(live)"}</td>
              <td className="p-2">{o.status}</td>
              <td className="p-2">{o.customer.name}<div className="text-slate-500">{o.customer.email}</div></td>
              <td className="p-2 tabular-nums">${o.total.toFixed(2)}</td>
              <td className="p-2">{o.paypal.payerCountry ?? "?"} → {o.shipping.countryCode}</td>
              <td className="p-2 font-mono text-xs">{o.paypal.authorizationId}<div>{o.paypal.authorizationStatus}{o.paypal.lastError && <span className="text-red-600"> · {o.paypal.lastError}</span>}</div></td>
              <td className="p-2 whitespace-nowrap">
                {o.status === "needs_review" && (
                  <>
                    <button className="mr-2 rounded bg-green-600 px-2 py-1 text-white" onClick={() => act(o.id, "approve")}>Approve</button>
                    <button className="rounded bg-red-600 px-2 py-1 text-white" onClick={() => act(o.id, "void")}>Void</button>
                  </>
                )}
              </td>
            </tr>
          ))}
          {orders.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-slate-500">No orders yet — place one in the demo store.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
