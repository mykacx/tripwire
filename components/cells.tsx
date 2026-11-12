"use client";

// Custom AG Grid cell renderers for the review queue.
import type { CustomCellRendererProps } from "ag-grid-react";
import type { OrderView } from "@/lib/types";
import { Chip, RISK_BAR, RiskBadge, SourceBadge, StatusPill, timeLeft, usd } from "./ui";

type P = CustomCellRendererProps<OrderView>;
export interface GridContext {
  now: number;
  onAction: (order: OrderView, action: "approve" | "void") => void;
}

const isTotals = (p: P) => p.node.rowPinned === "top";

export function OrderIdCell(p: P) {
  if (isTotals(p)) return <span className="font-semibold text-slate-700">Totals · {p.data?.id}</span>;
  const o = p.data!;
  return (
    <div className="flex h-full flex-col justify-center leading-tight">
      <span className="font-mono text-[13px] font-medium">{o.id}</span>
      <span className="mt-0.5"><SourceBadge demo={o.demo} /></span>
    </div>
  );
}

export function StatusCell(p: P) {
  if (isTotals(p) || !p.data) return null;
  return <StatusPill status={p.data.status} />;
}

export function RiskCell(p: P) {
  if (isTotals(p) || !p.data) return null;
  const o = p.data;
  return (
    <div className="flex h-full items-center gap-1.5">
      <RiskBadge level={o.review.risk_level} compact />
      {o.aiPending ? (
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" title="AI review running…" />
      ) : o.review.source === "rules" ? (
        <span className="text-[10px] font-medium uppercase text-slate-400" title={o.review.error ?? "AI review not run yet — rule score shown"}>rules</span>
      ) : (
        <span className="text-[10px] font-medium uppercase text-slate-400" title={`Reviewed by ${o.review.model}`}>AI</span>
      )}
    </div>
  );
}

export function ScoreCell(p: P) {
  if (isTotals(p)) return <span className="text-slate-500">avg {p.value}</span>;
  if (!p.data) return null;
  const score = p.data.review.risk_score;
  return (
    <div className="flex h-full items-center gap-2">
      <span className="w-7 text-right font-semibold tabular-nums">{score}</span>
      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${RISK_BAR[p.data.review.risk_level]}`} style={{ width: `${Math.max(4, score)}%` }} />
      </div>
    </div>
  );
}

export function CustomerCell(p: P) {
  if (isTotals(p) || !p.data) return null;
  const c = p.data.customer;
  return (
    <div className="flex h-full flex-col justify-center leading-tight">
      <span className="truncate font-medium">{c.name}</span>
      <span className="truncate text-xs text-slate-500">{c.email}</span>
    </div>
  );
}

export function TotalCell(p: P) {
  if (isTotals(p)) return <span className="font-semibold tabular-nums">{usd(p.value ?? 0, 2)}</span>;
  return <span className="font-medium tabular-nums">{usd(p.value ?? 0, 2)}</span>;
}

export function MultipleCell(p: P) {
  if (isTotals(p) || !p.data) return null;
  const m = p.data.rule.multiple;
  const cls = m >= 10 ? "text-red-700 font-semibold" : m >= 4 ? "text-amber-700 font-semibold" : "text-slate-600";
  return <span className={`tabular-nums ${cls}`}>{m >= 10 ? Math.round(m) : m}×</span>;
}

export function CountriesCell(p: P) {
  if (isTotals(p) || !p.data) return null;
  const payer = p.data.paypal.payerCountry ?? "??";
  const ship = p.data.shipping.countryCode;
  const mismatch = payer !== "??" && payer !== ship;
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-xs ${mismatch ? "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200" : "text-slate-600"}`}>
      {payer} <span className="text-slate-400">→</span> {ship}
    </span>
  );
}

export function SignalsCell(p: P) {
  if (isTotals(p) || !p.data) return null;
  const order = { high: 0, medium: 1, low: 2, none: 3 };
  const fired = p.data.signals.filter((s) => s.severity !== "none").sort((a, b) => order[a.severity] - order[b.severity]);
  if (!fired.length) return <span className="text-xs text-slate-400">No signals</span>;
  return (
    <div className="flex h-full items-center gap-1 overflow-hidden">
      {fired.slice(0, 3).map((s) => <Chip key={s.name} severity={s.severity} title={s.text}>{s.label}</Chip>)}
      {fired.length > 3 && <span className="text-xs text-slate-500">+{fired.length - 3}</span>}
    </div>
  );
}

export function ExpiryCell(p: P) {
  if (isTotals(p) || !p.data) return null;
  const o = p.data;
  if (o.status === "approved") return <span className="text-xs text-slate-500">Captured</span>;
  if (o.status === "voided") return <span className="text-xs text-slate-500">Released</span>;
  const now = (p.context as GridContext).now;
  const left = timeLeft(o.paypal.honorPeriodEndsAt, now);
  const urgent = left === "expired" || /^\d+h|^\d+m/.test(left);
  return <span className={`tabular-nums text-sm ${urgent ? "font-semibold text-red-700" : "text-slate-700"}`}>{left}</span>;
}

export function ActionsCell(p: P) {
  if (isTotals(p) || !p.data) return null;
  const o = p.data;
  const ctx = p.context as GridContext;
  if (o.status !== "needs_review") return <span className="text-xs text-slate-400">Decided</span>;
  return (
    <div className="flex h-full items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <button className="rounded-md bg-green-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm hover:bg-green-700" onClick={() => ctx.onAction(o, "approve")}>
        Approve
      </button>
      <button className="rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-red-700 shadow-sm ring-1 ring-inset ring-red-300 hover:bg-red-50" onClick={() => ctx.onAction(o, "void")}>
        Void
      </button>
    </div>
  );
}
