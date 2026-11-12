"use client";

// Side drawer with the full picture for one order (custom React — no Enterprise master/detail).
import { useEffect } from "react";
import type { OrderEvent, OrderView } from "@/lib/types";
import { Chip, RiskBadge, SEVERITY_STYLES, SourceBadge, StatusPill, sgTime, timeAgo, timeLeft, usd } from "./ui";

interface Props {
  order: OrderView;
  all: OrderView[];
  now: number;
  reviewing: boolean;
  onClose: () => void;
  onOpen: (id: string) => void;
  onAction: (order: OrderView, action: "approve" | "void") => void;
  onRerun: (id: string) => void;
}

const EVENT_DOT: Record<OrderEvent["type"], string> = {
  authorized: "bg-blue-500", ai_reviewed: "bg-violet-500", approved: "bg-green-600", voided: "bg-red-600", error: "bg-red-400", note: "bg-slate-400",
};

export default function OrderDrawer({ order: o, all, now, reviewing, onClose, onOpen, onAction, onRerun }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const r = o.review;
  const linkedIds = [...new Set([
    ...r.linked_order_ids,
    ...o.signals.filter((s) => s.name === "shared_identity" || s.name === "velocity").flatMap((s) => s.relatedOrderIds ?? []),
  ])];
  const linked = linkedIds.map((id) => all.find((x) => x.id === id)).filter((x): x is OrderView => !!x);
  const sevOrder = { high: 0, medium: 1, low: 2, none: 3 };
  const signals = [...o.signals].sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);
  const a = o.shipping;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/20" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[600px] flex-col bg-white shadow-2xl" role="dialog" aria-label={`Order ${o.id}`}>
        {/* Header */}
        <div className="border-b border-slate-200 px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-mono text-lg font-semibold">{o.id}</h2>
                <SourceBadge demo={o.demo} />
                <StatusPill status={o.status} />
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {o.customer.name} · {usd(o.total, 2)} · {sgTime(o.createdAt)} SGT ({timeAgo(o.createdAt, now)})
              </p>
            </div>
            <button onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">✕</button>
          </div>
          {o.status === "needs_review" && (
            <div className="mt-4 flex items-center gap-2">
              <button className="rounded-md bg-green-600 px-3.5 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-green-700" onClick={() => onAction(o, "approve")}>
                Approve &amp; capture
              </button>
              <button className="rounded-md bg-white px-3.5 py-1.5 text-sm font-semibold text-red-700 shadow-sm ring-1 ring-inset ring-red-300 hover:bg-red-50" onClick={() => onAction(o, "void")}>
                Void authorization
              </button>
              <span className="ml-auto text-xs text-slate-500">Hold guaranteed for {timeLeft(o.paypal.honorPeriodEndsAt, now)}</span>
            </div>
          )}
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {/* AI assessment */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {r.source === "ai" ? "AI assessment" : "Rule-based assessment"}
              </h3>
              <button
                className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:opacity-50"
                onClick={() => onRerun(o.id)}
                disabled={reviewing || o.aiPending}
              >
                {reviewing || o.aiPending ? "Reviewing…" : "Re-run AI review"}
              </button>
            </div>
            <div className="rounded-lg border border-slate-200 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <RiskBadge level={r.risk_level} />
                <span className="text-sm font-semibold tabular-nums">{r.risk_score}/100</span>
                <span className="text-sm text-slate-500">· suggests <b className="text-slate-800">{r.recommended_action}</b></span>
                <span className="text-sm text-slate-500">· confidence {r.confidence}</span>
              </div>
              <p className="mt-3 text-[15px] leading-relaxed text-slate-900">{r.summary}</p>
              <ul className="mt-3 space-y-1.5">
                {r.reasons.map((reason, i) => (
                  <li key={i} className="flex gap-2 text-sm leading-snug text-slate-700"><span className="text-slate-400">•</span>{reason}</li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-slate-400">
                {r.source === "ai"
                  ? `${r.model} · ${sgTime(r.reviewedAt)} SGT · advisory only — you make the call`
                  : r.error ?? "AI review not run yet — showing the deterministic rule score."}
              </p>
            </div>
          </section>

          {/* Linked orders */}
          {linked.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Linked orders ({linked.length})</h3>
              <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {linked.map((l) => (
                  <button key={l.id} onClick={() => onOpen(l.id)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-slate-50">
                    <span className="font-mono text-xs text-slate-500">{l.id}</span>
                    <span className="flex-1 truncate font-medium">{l.customer.name}</span>
                    <span className="tabular-nums text-slate-600">{usd(l.total)}</span>
                    <StatusPill status={l.status} />
                    <span className="text-slate-400">›</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Signals */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Risk signals (rule score {o.rule.score})</h3>
            <ul className="space-y-2">
              {signals.map((s) => (
                <li key={s.name} className="flex items-start gap-3 text-sm">
                  <span className={`mt-0.5 w-16 shrink-0 rounded px-1.5 py-0.5 text-center text-[10px] font-semibold uppercase ring-1 ring-inset ${SEVERITY_STYLES[s.severity]}`}>
                    {s.severity === "none" ? "ok" : s.severity}
                  </span>
                  <span className={s.severity === "none" ? "text-slate-500" : "text-slate-800"}>{s.text}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Order details */}
          <section className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">Customer</h3>
              <p className="font-medium">{o.customer.name}</p>
              <p className="text-slate-600">{o.customer.email}</p>
              <p className="text-slate-600">{o.customer.phone}</p>
            </div>
            <div>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">Ships to</h3>
              <p>{a.line1}{a.line2 ? `, ${a.line2}` : ""}</p>
              <p className="text-slate-600">{a.city}{a.state ? `, ${a.state}` : ""} {a.postalCode}</p>
              <p className="text-slate-600">{a.countryCode}</p>
            </div>
            <div className="col-span-2">
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">Items</h3>
              <table className="w-full">
                <tbody>
                  {o.items.map((i) => (
                    <tr key={i.sku} className="border-t border-slate-100 first:border-0">
                      <td className="py-1">{i.quantity}× {i.name} {i.category !== "normal" && <Chip severity="medium">{i.category === "gift_card" ? "gift card" : "high resale"}</Chip>}</td>
                      <td className="py-1 text-right tabular-nums">{usd(i.unitPrice * i.quantity, 2)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-slate-200 font-semibold"><td className="py-1">Total</td><td className="py-1 text-right tabular-nums">{usd(o.total, 2)}</td></tr>
                </tbody>
              </table>
              {o.note && <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-slate-700">Note: “{o.note}”</p>}
            </div>
          </section>

          {/* PayPal */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">PayPal {o.demo && <span className="normal-case text-slate-400">(demo data — not real PayPal IDs)</span>}</h3>
            <dl className="grid grid-cols-[150px_1fr] gap-x-3 gap-y-1 text-sm">
              <Row k="Order ID" v={o.paypal.orderId} mono />
              <Row k="Order status" v={o.paypal.orderStatus} />
              <Row k="Authorization ID" v={o.paypal.authorizationId} mono />
              <Row k="Authorization status" v={o.paypal.authorizationStatus} />
              <Row k="Capture ID" v={o.paypal.captureId} mono />
              <Row k="Capture status" v={o.paypal.captureStatus} />
              <Row k="Payer" v={[o.paypal.payerName, o.paypal.payerEmail].filter(Boolean).join(" · ")} />
              <Row k="Payer ID / country" v={[o.paypal.payerId, o.paypal.payerCountry].filter(Boolean).join(" · ")} mono />
              <Row k="Honor period ends" v={o.paypal.honorPeriodEndsAt && `${sgTime(o.paypal.honorPeriodEndsAt)} SGT`} />
              <Row k="Authorization expires" v={o.paypal.authorizationExpiresAt && `${sgTime(o.paypal.authorizationExpiresAt)} SGT`} />
              <Row k="Debug ID" v={o.paypal.debugId} mono />
            </dl>
            {o.paypal.lastError && <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{o.paypal.lastError}</p>}
          </section>

          {/* Timeline */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Timeline</h3>
            <ol className="relative ml-1.5 border-l border-slate-200">
              {o.events.map((e, i) => (
                <li key={i} className="mb-3 ml-4">
                  <span className={`absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${EVENT_DOT[e.type]}`} />
                  <p className="text-xs text-slate-500">{sgTime(e.at)} SGT · {e.actor}</p>
                  <p className="text-sm text-slate-800">{e.message}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </aside>
    </>
  );
}

function Row({ k, v, mono }: { k: string; v?: string; mono?: boolean }) {
  return (
    <>
      <dt className="text-slate-500">{k}</dt>
      <dd className={`break-all ${mono ? "font-mono text-xs leading-5" : ""} ${v ? "text-slate-800" : "text-slate-400"}`}>{v || "—"}</dd>
    </>
  );
}
