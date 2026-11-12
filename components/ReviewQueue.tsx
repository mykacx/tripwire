"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type ColDef,
  type GetRowIdParams,
  type GridApi,
  type RowClassRules,
} from "ag-grid-community";
import type { OrderView } from "@/lib/types";
import {
  ActionsCell, CountriesCell, CustomerCell, ExpiryCell, MultipleCell, OrderIdCell,
  RiskCell, ScoreCell, SignalsCell, StatusCell, TotalCell, type GridContext,
} from "./cells";
import OrderDrawer from "./OrderDrawer";
import { usd } from "./ui";

ModuleRegistry.registerModules([AllCommunityModule]);

// AG Grid Quartz theme tuned to the app's neutral palette.
const gridTheme = themeQuartz.withParams({
  fontFamily: "inherit",
  fontSize: 14,
  headerFontSize: 12,
  headerFontWeight: 600,
  headerTextColor: "#475569",
  headerBackgroundColor: "#f8fafc",
  foregroundColor: "#0f172a",
  borderColor: "#e2e8f0",
  rowBorder: { color: "#eef2f6" },
  accentColor: "#334155",
  rowHoverColor: "#f8fafc",
  selectedRowBackgroundColor: "#f1f5f9",
  wrapperBorderRadius: 10,
  rowHeight: 56,
  headerHeight: 40,
  spacing: 7,
  cellHorizontalPaddingScale: 0.9,
});

type Tab = "needs_review" | "approved" | "voided" | "all";
const TABS: { key: Tab; label: string }[] = [
  { key: "needs_review", label: "Needs review" },
  { key: "approved", label: "Approved" },
  { key: "voided", label: "Voided" },
  { key: "all", label: "All" },
];

interface Toast { id: number; ok: boolean; text: string }
interface Pending { order: OrderView; action: "approve" | "void" }

const isToday = (iso: string) => {
  const fmt = (d: Date) => d.toLocaleDateString("en-SG", { timeZone: "Asia/Singapore" });
  return fmt(new Date(iso)) === fmt(new Date());
};

export default function ReviewQueue() {
  const [orders, setOrders] = useState<OrderView[]>([]);
  const [ai, setAi] = useState<{ enabled: boolean; provider?: string; model?: string } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [tab, setTab] = useState<Tab>("needs_review");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const apiRef = useRef<GridApi<OrderView> | null>(null);
  const knownIds = useRef<Set<string> | null>(null);

  const toast = useCallback((ok: boolean, text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, ok, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ok ? 5000 : 9000);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/orders", { cache: "no-store" });
      const data = await res.json();
      setOrders(data.orders);
      setAi(data.ai);
      setNow(Date.now());
      setLoaded(true);
    } catch {
      /* transient network error — next poll will retry */
    }
  }, []);

  // Deep links: /?tab=all&order=TW-123ABC opens a tab and an order's drawer.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("tab");
    if (t && TABS.some((x) => x.key === t)) setTab(t as Tab);
    const id = params.get("order");
    if (id) setSelectedId(id);
  }, []);

  // Poll every 3 seconds.
  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  // Flash rows for orders that just arrived.
  useEffect(() => {
    const api = apiRef.current;
    const ids = new Set(orders.map((o) => o.id));
    if (api && knownIds.current) {
      const fresh = orders.filter((o) => !knownIds.current!.has(o.id)).map((o) => api.getRowNode(o.id)).filter((n) => !!n);
      if (fresh.length) {
        setTimeout(() => api.flashCells({ rowNodes: fresh, flashDuration: 1500, fadeDuration: 1500 }), 50);
        toast(true, `New order received: ${orders.find((o) => !knownIds.current!.has(o.id))?.id}`);
      }
    }
    if (loaded) knownIds.current = ids;
    api?.refreshCells({ columns: ["expiry"], force: true });
  }, [orders, loaded, toast]);

  const rows = useMemo(() => (tab === "all" ? orders : orders.filter((o) => o.status === tab)), [orders, tab]);
  const counts = useMemo(() => {
    const c: Record<Tab, number> = { needs_review: 0, approved: 0, voided: 0, all: orders.length };
    for (const o of orders) c[o.status]++;
    return c;
  }, [orders]);

  const kpis = useMemo(() => {
    const sum = (xs: OrderView[]) => xs.reduce((s, o) => s + o.total, 0);
    const pendingOrders = orders.filter((o) => o.status === "needs_review");
    const approvedToday = orders.filter((o) => o.status === "approved" && isToday(o.events.findLast((e) => e.type === "approved")?.at ?? o.updatedAt));
    const voided = orders.filter((o) => o.status === "voided");
    return {
      onHold: sum(pendingOrders),
      onHoldCount: pendingOrders.length,
      highRisk: pendingOrders.filter((o) => o.review.risk_level === "high").length,
      blocked: sum(voided),
      blockedCount: voided.length,
      approvedToday: sum(approvedToday),
      approvedTodayCount: approvedToday.length,
    };
  }, [orders]);

  const totalsRow = useMemo(() => {
    const total = rows.reduce((s, o) => s + o.total, 0);
    const avg = rows.length ? Math.round(rows.reduce((s, o) => s + o.review.risk_score, 0) / rows.length) : 0;
    return [{ id: `${rows.length} orders`, total, score: avg }];
  }, [rows]);

  const onAction = useCallback((order: OrderView, action: "approve" | "void") => setPending({ order, action }), []);
  const context = useMemo<GridContext>(() => ({ now, onAction }), [now, onAction]);

  const columnDefs = useMemo<ColDef<OrderView>[]>(() => [
    { headerName: "Order", field: "id", cellRenderer: OrderIdCell, width: 128, pinned: "left" },
    { headerName: "Status", field: "status", cellRenderer: StatusCell, width: 128, enableCellChangeFlash: true },
    { headerName: "Risk", colId: "risk", valueGetter: (p) => p.data?.review?.risk_level, cellRenderer: RiskCell, width: 120, enableCellChangeFlash: true,
      comparator: (a, b) => ({ low: 0, medium: 1, high: 2 } as Record<string, number>)[a] - ({ low: 0, medium: 1, high: 2 } as Record<string, number>)[b] },
    { headerName: "Score", colId: "score", valueGetter: (p) => (p.node?.rowPinned ? (p.data as unknown as { score: number }).score : p.data?.review?.risk_score),
      cellRenderer: ScoreCell, width: 118, sort: "desc", enableCellChangeFlash: true },
    { headerName: "Customer", colId: "customer", valueGetter: (p) => p.data?.customer?.name, cellRenderer: CustomerCell, flex: 1, minWidth: 190,
      getQuickFilterText: (p) => (p.data?.customer ? `${p.data.customer.name} ${p.data.customer.email} ${p.data.customer.phone}` : "") },
    { headerName: "Total", field: "total", cellRenderer: TotalCell, width: 112, type: "rightAligned" },
    { headerName: "× typical", colId: "multiple", valueGetter: (p) => p.data?.rule?.multiple, cellRenderer: MultipleCell, width: 100, type: "rightAligned" },
    { headerName: "Items", colId: "items", valueGetter: (p) => p.data?.items?.map((i) => `${i.quantity}× ${i.name}`).join(", "),
      tooltipValueGetter: (p) => p.value, width: 200, cellClass: "text-[13px] text-slate-700" },
    { headerName: "Payer → Ship", colId: "countries", valueGetter: (p) => (p.data?.paypal && p.data.shipping ? `${p.data.paypal.payerCountry ?? "??"} ${p.data.shipping.countryCode}` : undefined),
      cellRenderer: CountriesCell, width: 122 },
    { headerName: "Signals", colId: "signals", valueGetter: (p) => p.data?.signals?.filter((s) => s.severity !== "none").map((s) => s.label).join(" · "),
      cellRenderer: SignalsCell, width: 330, sortable: false, tooltipValueGetter: (p) => p.value },
    { headerName: "AI summary", colId: "summary", valueGetter: (p) => p.data?.review?.summary, tooltipValueGetter: (p) => p.value,
      width: 320, cellClass: "text-[13px] text-slate-700", sortable: false },
    { headerName: "Hold left", colId: "expiry", valueGetter: (p) => p.data?.paypal?.honorPeriodEndsAt, cellRenderer: ExpiryCell, width: 104,
      headerTooltip: "Time left in PayPal's 3-day honor period, during which capture is guaranteed" },
    { headerName: "Actions", colId: "actions", cellRenderer: ActionsCell, width: 158, pinned: "right", sortable: false },
  ], []);

  const defaultColDef = useMemo<ColDef<OrderView>>(() => ({ sortable: true, resizable: true, suppressMovable: false }), []);

  const rowClassRules = useMemo<RowClassRules<OrderView>>(() => ({
    "tw-row-high": (p) => !p.node.rowPinned && p.data?.review.risk_level === "high",
    "tw-row-medium": (p) => !p.node.rowPinned && p.data?.review.risk_level === "medium",
    "tw-row-low": (p) => !p.node.rowPinned && p.data?.review.risk_level === "low",
    "tw-row-decided": (p) => !p.node.rowPinned && p.data?.status !== "needs_review",
  }), []);

  async function confirmAction() {
    if (!pending) return;
    setBusy(true);
    const { order, action } = pending;
    try {
      const res = await fetch(`/api/orders/${order.id}/${action}`, { method: "POST" });
      const data = await res.json();
      if (res.ok) toast(true, data.message);
      else toast(false, `${order.id}: ${data.error}${data.debugId ? ` (PayPal debug id ${data.debugId})` : ""}`);
    } catch (e) {
      toast(false, `Network error: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
      setPending(null);
      load();
    }
  }

  async function rerun(id: string) {
    setReviewing(id);
    try {
      const res = await fetch(`/api/orders/${id}/review`, { method: "POST" });
      const data = await res.json();
      toast(res.ok && data.review?.source === "ai", res.ok ? data.message : data.error);
    } finally {
      setReviewing(null);
      load();
    }
  }

  async function resetDemo() {
    if (!confirm("Reset to demo data? This clears every order, including live sandbox orders, and restores the original seeded demo orders. (Uncaptured PayPal sandbox authorizations simply expire.)")) return;
    const res = await fetch("/api/demo/reset", { method: "POST" });
    const data = await res.json();
    toast(res.ok, res.ok ? data.message : data.error);
    knownIds.current = null;
    setSelectedId(null);
    load();
  }

  const selected = selectedId ? orders.find((o) => o.id === selectedId) : undefined;

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1800px] items-center justify-between gap-6 px-6 py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M2 14h5l3-7 4 12 3-5h5" /></svg>
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight tracking-tight">Tripwire</h1>
              <p className="text-xs text-slate-500">The AI spots the risk, you make the call, and fraud is stopped before the money moves.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {ai?.enabled && (
              <span className="rounded-md bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 ring-1 ring-inset ring-violet-200" title="Model used for AI risk reviews">
                AI: {ai.model}
              </span>
            )}
            <button onClick={resetDemo} className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 ring-1 ring-inset ring-slate-300 hover:bg-slate-50">
              Reset demo data
            </button>
            <Link href="/store" target="_blank" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">
              Open demo store ↗
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1800px] flex-1 flex-col gap-4 px-6 py-5">
        {ai && !ai.enabled && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
            <b>AI unavailable</b>: no AI key is configured, so orders show deterministic rule scores only. Set{" "}
            <code className="rounded bg-amber-100 px-1">ANTHROPIC_API_KEY</code> (or{" "}
            <code className="rounded bg-amber-100 px-1">GEMINI_API_KEY</code> for Google&apos;s free tier) in <code className="rounded bg-amber-100 px-1">.env.local</code> and restart to enable AI review.
          </div>
        )}

        {/* KPIs */}
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Money on hold" value={usd(kpis.onHold)} sub={`${kpis.onHoldCount} authorized, not captured`} />
          <Kpi label="High risk awaiting review" value={String(kpis.highRisk)} sub="needs a human decision" tone={kpis.highRisk ? "red" : undefined} />
          <Kpi label="Money blocked (voided)" value={usd(kpis.blocked)} sub={`${kpis.blockedCount} authorizations released — no chargebacks`} />
          <Kpi label="Approved today" value={usd(kpis.approvedToday)} sub={`${kpis.approvedTodayCount} captured via PayPal`} />
        </section>

        {/* Toolbar */}
        <section className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex rounded-lg bg-slate-200/60 p-1" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition ${tab === t.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
              >
                {t.label} <span className="ml-1 tabular-nums text-slate-400">{counts[t.key]}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-xs text-slate-500"><span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />Live · refreshes every 3s</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, order, item…"
              className="w-72 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
          </div>
        </section>

        {/* Grid */}
        {/* AG Grid sizes itself to 100% of its parent, so the parent needs an explicit height. */}
        <section style={{ height: "calc(100vh - 250px)", minHeight: 480 }}>
          <AgGridReact<OrderView>
            theme={gridTheme}
            rowData={rows}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            getRowId={(p: GetRowIdParams<OrderView>) => p.data.id}
            context={context}
            pinnedTopRowData={totalsRow}
            quickFilterText={search}
            rowClassRules={rowClassRules}
            tooltipShowDelay={250}
            animateRows
            suppressCellFocus
            onGridReady={(e) => (apiRef.current = e.api)}
            onRowClicked={(e) => !e.node.rowPinned && e.data && setSelectedId(e.data.id)}
            overlayNoRowsTemplate={loaded ? '<span class="text-slate-500">No orders here. Place one in the demo store.</span>' : "Loading…"}
            domLayout="normal"
          />
        </section>
      </main>

      {selected && (
        <OrderDrawer
          order={selected}
          all={orders}
          now={now}
          reviewing={reviewing === selected.id}
          onClose={() => setSelectedId(null)}
          onOpen={setSelectedId}
          onAction={onAction}
          onRerun={rerun}
        />
      )}

      {pending && <ConfirmDialog pending={pending} busy={busy} onCancel={() => setPending(null)} onConfirm={confirmAction} />}

      {/* Toasts */}
      <div className="fixed bottom-5 right-5 z-[70] flex w-[420px] flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className={`rounded-lg px-4 py-3 text-sm shadow-lg ring-1 ${t.ok ? "bg-white text-slate-800 ring-slate-200" : "bg-red-50 text-red-800 ring-red-200"}`}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "red" }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone === "red" ? "text-red-600" : "text-slate-900"}`}>{value}</p>
      <p className="text-xs text-slate-500">{sub}</p>
    </div>
  );
}

function ConfirmDialog({ pending, busy, onCancel, onConfirm }: { pending: Pending; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  const { order: o, action } = pending;
  const approve = action === "approve";
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl" role="alertdialog">
        <h2 className="text-lg font-semibold">{approve ? `Approve and capture ${usd(o.total, 2)}?` : `Void ${o.id}?`}</h2>
        <p className="mt-2 text-sm text-slate-600">
          {approve
            ? `PayPal will capture the authorized ${usd(o.total, 2)} from ${o.customer.name}. The money moves to the store.`
            : `PayPal will release the hold on ${usd(o.total, 2)}. The money never moves: no refund, no chargeback. This can't be undone.`}
        </p>
        <p className="mt-2 text-sm text-slate-600">
          AI suggests <b>{o.review.recommended_action}</b> ({o.review.risk_level} risk, {o.review.risk_score}/100).
        </p>
        {o.demo && <p className="mt-3 rounded-md bg-slate-100 px-3 py-2 text-xs text-slate-600">Demo data: this only changes local state. No PayPal call is made.</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} disabled={busy} className="rounded-md px-3.5 py-2 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50">Cancel</button>
          <button
            onClick={onConfirm}
            disabled={busy}
            autoFocus
            className={`rounded-md px-3.5 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-60 ${approve ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}`}
          >
            {busy ? "Working…" : approve ? "Approve & capture" : "Void authorization"}
          </button>
        </div>
      </div>
    </div>
  );
}
