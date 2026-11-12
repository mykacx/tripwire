// Small presentational pieces shared by the grid and the drawer.
import type { OrderStatus, RiskLevel, Severity } from "@/lib/types";

export const usd = (n: number, digits = 0) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits });

export const RISK_STYLES: Record<RiskLevel, string> = {
  high: "bg-red-50 text-red-700 ring-red-200",
  medium: "bg-amber-50 text-amber-800 ring-amber-200",
  low: "bg-green-50 text-green-700 ring-green-200",
};

export const RISK_BAR: Record<RiskLevel, string> = { high: "bg-red-500", medium: "bg-amber-500", low: "bg-green-500" };

export const SEVERITY_STYLES: Record<Severity, string> = {
  high: "bg-red-50 text-red-700 ring-red-200",
  medium: "bg-amber-50 text-amber-800 ring-amber-200",
  low: "bg-slate-100 text-slate-700 ring-slate-200",
  none: "bg-slate-50 text-slate-500 ring-slate-200",
};

export function RiskBadge({ level, compact }: { level: RiskLevel; compact?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ring-1 ring-inset ${RISK_STYLES[level]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${RISK_BAR[level]}`} />
      {compact ? level : `${level} risk`}
    </span>
  );
}

const STATUS: Record<OrderStatus, { label: string; cls: string }> = {
  needs_review: { label: "Needs review", cls: "bg-slate-900 text-white" },
  approved: { label: "Approved", cls: "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-300" },
  voided: { label: "Voided", cls: "bg-white text-slate-500 ring-1 ring-inset ring-slate-300 line-through decoration-slate-400" },
};

export function StatusPill({ status }: { status: OrderStatus }) {
  const s = STATUS[status];
  return <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>;
}

export function SourceBadge({ demo }: { demo: boolean }) {
  return demo ? (
    <span className="rounded bg-slate-100 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider text-slate-500">Demo data</span>
  ) : (
    <span className="rounded bg-blue-50 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider text-blue-700 ring-1 ring-inset ring-blue-200">Live</span>
  );
}

export function Chip({ severity, children, title }: { severity: Severity; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${SEVERITY_STYLES[severity]}`}>
      {children}
    </span>
  );
}

/** "2d 4h", "3h 12m", "expired" */
export function timeLeft(iso: string | undefined, now: number): string {
  if (!iso) return "—";
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return "expired";
  const m = Math.floor(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
  return d >= 1 ? `${d}d ${h % 24}h` : h >= 1 ? `${h}h ${m % 60}m` : `${m}m`;
}

export function timeAgo(iso: string, now: number): string {
  const m = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export const sgTime = (iso: string) =>
  new Date(iso).toLocaleString("en-SG", { timeZone: "Asia/Singapore", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
