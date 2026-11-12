// Deterministic risk signals. Pure functions: same orders in → same signals out.
// The AI reads these as evidence; the rule score is the fallback if the AI is unavailable.
import type { Order, OrderView, RiskLevel, RuleResult, Severity, Signal } from "./types";

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const VELOCITY_WINDOW = 30 * MIN;
const IDENTITY_WINDOW = 14 * DAY;
const DEFAULT_MEDIAN = 45; // used before the store has any approved history
const STORE_TZ = "Asia/Singapore";

const COUNTRY_NAMES = new Intl.DisplayNames(["en"], { type: "region" });
const countryName = (code?: string) => {
  try {
    return code ? `${COUNTRY_NAMES.of(code)} (${code})` : "unknown";
  } catch {
    return code ?? "unknown";
  }
};
const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
const time = (o: Order) => new Date(o.createdAt).getTime();

// ---- Normalization: small typing differences should still match ----

const ABBREVIATIONS: Record<string, string> = {
  jln: "jalan", st: "street", rd: "road", ave: "avenue", av: "avenue", blk: "block",
  bt: "bukit", apt: "apartment", ste: "suite", dr: "drive", ln: "lane",
};

export function normalizeText(s: string | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "") // strip punctuation (#05-12 → 0512)
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((w) => ABBREVIATIONS[w] ?? w)
    .join(" ");
}

/** Street + unit + postal code + country. City is left out (often redundant, e.g. Singapore). */
export function addressKey(o: Order): string {
  const a = o.shipping;
  return [normalizeText(`${a.line1} ${a.line2 ?? ""}`), normalizeText(a.postalCode), a.countryCode.toUpperCase()].join("|");
}

/** Last 8 digits, so "+65 9123 4567" and "91234567" match. */
export function phoneKey(o: Order): string {
  const digits = o.customer.phone.replace(/\D/g, "");
  return digits.length >= 8 ? digits.slice(-8) : digits;
}

const emailKey = (o: Order) => o.customer.email.trim().toLowerCase();
const nameKey = (o: Order) => normalizeText(o.customer.name);

// ---- Helpers ----

function median(values: number[]): number {
  if (values.length === 0) return DEFAULT_MEDIAN;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** The store's typical order: median total of approved orders (excluding the order being scored). */
export function storeMedian(orders: Order[], excludeId?: string): number {
  return median(orders.filter((o) => o.status === "approved" && o.id !== excludeId).map((o) => o.total));
}

function signal(s: Omit<Signal, "points"> & { points?: number }): Signal {
  return { points: 0, ...s };
}

function storeHour(iso: string): number {
  const h = new Intl.DateTimeFormat("en-US", { timeZone: STORE_TZ, hour: "numeric", hourCycle: "h23" }).format(new Date(iso));
  return Number(h);
}

// ---- Signals ----

export function computeSignals(order: Order, all: Order[]): { signals: Signal[]; rule: RuleResult } {
  const others = all.filter((o) => o.id !== order.id);
  const t = time(order);
  const med = storeMedian(all, order.id);
  const multiple = order.total / med;
  const signals: Signal[] = [];

  // 1. amount_vs_typical
  {
    const m = Math.round(multiple * 10) / 10;
    const label = `${m >= 10 ? Math.round(m) : m}× typical`;
    const [severity, points]: [Severity, number] =
      multiple >= 10 ? ["high", 30] : multiple >= 4 ? ["medium", 15] : multiple >= 2 ? ["low", 5] : ["none", 0];
    signals.push(signal({
      name: "amount_vs_typical", label, value: m, severity, points,
      text: `${usd(order.total)} is ${label.replace(" typical", "")} the store's typical order (median ${usd(med)}).`,
    }));
  }

  // 2. velocity — same email / payer / address / phone within the 30 minutes before this order
  {
    const recent = others.filter((o) => time(o) <= t && t - time(o) <= VELOCITY_WINDOW);
    const matches = recent.filter(
      (o) =>
        emailKey(o) === emailKey(order) ||
        (order.paypal.payerId && o.paypal.payerId === order.paypal.payerId) ||
        addressKey(o) === addressKey(order) ||
        (phoneKey(order).length >= 6 && phoneKey(o) === phoneKey(order)),
    );
    const n = matches.length;
    const [severity, points]: [Severity, number] = n >= 3 ? ["high", 25] : n >= 1 ? ["medium", 12] : ["none", 0];
    signals.push(signal({
      name: "velocity", label: n ? `${n + 1} orders / 30 min` : "No burst", value: n, severity, points,
      text: n
        ? `${n} other order${n > 1 ? "s" : ""} with the same email, PayPal account, address or phone in the 30 minutes before this one.`
        : "No other orders from the same customer details in the previous 30 minutes.",
      relatedOrderIds: n ? matches.map((o) => o.id) : undefined,
    }));
  }

  // 3. country_mismatch — PayPal account country vs shipping country
  {
    const payer = order.paypal.payerCountry?.toUpperCase();
    const ship = order.shipping.countryCode.toUpperCase();
    const mismatch = !!payer && payer !== ship;
    signals.push(signal({
      name: "country_mismatch", label: mismatch ? `${payer} → ${ship}` : "Countries match",
      value: mismatch, severity: mismatch ? "medium" : "none", points: mismatch ? 15 : 0,
      text: !payer
        ? "PayPal did not report the payer's country."
        : mismatch
          ? `PayPal account is from ${countryName(payer)} but the order ships to ${countryName(ship)}.`
          : `PayPal account country matches the shipping country (${countryName(ship)}).`,
    }));
  }

  // 4. new_customer_high_value — no approved history for this email/payer AND total > 3× median
  {
    const priorApproved = others.filter(
      (o) => o.status === "approved" && time(o) < t &&
        (emailKey(o) === emailKey(order) || (order.paypal.payerId && o.paypal.payerId === order.paypal.payerId)),
    ).length;
    const flagged = priorApproved === 0 && multiple > 3;
    signals.push(signal({
      name: "new_customer_high_value", label: flagged ? "New + high value" : priorApproved ? `${priorApproved} prior orders` : "New customer",
      value: flagged, severity: flagged ? "high" : "none", points: flagged ? 20 : 0,
      text: flagged
        ? `First-time customer (no previously approved orders) spending ${usd(order.total)}, more than 3× the typical order.`
        : priorApproved
          ? `Returning customer with ${priorApproved} previously approved order${priorApproved > 1 ? "s" : ""}.`
          : "First-time customer, but the order value is in a normal range.",
    }));
  }

  // 5. high_risk_items — share of the total in gift cards / high-resale electronics
  {
    const risky = order.items.filter((i) => i.category !== "normal");
    const riskyTotal = risky.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
    const share = order.total ? riskyTotal / order.total : 0;
    const pct = Math.round(share * 100);
    const [severity, points]: [Severity, number] =
      share >= 0.8 ? ["high", 20] : share >= 0.4 ? ["medium", 10] : share > 0 ? ["low", 3] : ["none", 0];
    signals.push(signal({
      name: "high_risk_items", label: pct ? `${pct}% resale-risk items` : "Low-risk items", value: pct, severity, points,
      text: pct
        ? `${pct}% of the order value is easy-to-resell goods (${risky.map((i) => `${i.quantity}× ${i.name}`).join(", ")}).`
        : "No gift cards or high-resale electronics in the order.",
    }));
  }

  // 6. quantity_anomaly — many units of one item
  {
    const top = [...order.items].sort((a, b) => b.quantity - a.quantity)[0];
    const q = top?.quantity ?? 0;
    const [severity, points]: [Severity, number] = q >= 5 ? ["high", 15] : q >= 3 ? ["medium", 8] : ["none", 0];
    signals.push(signal({
      name: "quantity_anomaly", label: q >= 3 ? `${q}× ${top.name}` : "Normal quantities", value: q, severity, points,
      text: q >= 3 ? `${q} units of ${top.name} in one order — unusual for this store.` : "Item quantities look normal.",
    }));
  }

  // 7. odd_hour — 01:00–05:00 store time
  {
    const h = storeHour(order.createdAt);
    const odd = h >= 1 && h < 5;
    const hh = String(h).padStart(2, "0");
    signals.push(signal({
      name: "odd_hour", label: odd ? `${hh}:00 SGT` : "Normal hours", value: h,
      severity: odd ? "low" : "none", points: odd ? 8 : 0,
      text: odd ? `Placed at ${hh}:xx store time (Singapore), between 01:00 and 05:00.` : `Placed during normal hours (${hh}:xx Singapore time).`,
    }));
  }

  // 8. shared_identity — same address / phone / payer but a different name or email, within 14 days
  {
    const linked: { o: Order; via: string[] }[] = [];
    for (const o of others) {
      if (Math.abs(time(o) - t) > IDENTITY_WINDOW) continue;
      const differentPerson = nameKey(o) !== nameKey(order) || emailKey(o) !== emailKey(order);
      if (!differentPerson) continue;
      const via: string[] = [];
      if (addressKey(o) === addressKey(order)) via.push("shipping address");
      if (phoneKey(order).length >= 6 && phoneKey(o) === phoneKey(order)) via.push("phone");
      if (order.paypal.payerId && o.paypal.payerId === order.paypal.payerId) via.push("PayPal account");
      if (via.length) linked.push({ o, via });
    }
    const n = linked.length;
    const names = [...new Set(linked.map((l) => l.o.customer.name))];
    const voided = linked.filter((l) => l.o.status === "voided").length;
    const vias = [...new Set(linked.flatMap((l) => l.via))];
    const [severity, points]: [Severity, number] = n >= 2 || voided ? ["high", 30] : n === 1 ? ["medium", 18] : ["none", 0];
    signals.push(signal({
      name: "shared_identity", label: n ? `Linked to ${n} order${n > 1 ? "s" : ""}` : "No links", value: n, severity, points,
      text: n
        ? `Same ${vias.join(" / ")} used by ${names.length} other name${names.length > 1 ? "s" : ""} in the last 14 days: ` +
          linked.map((l) => `${l.o.id} (${l.o.customer.name}, ${l.o.status})`).join(", ") +
          (voided ? `. ${voided} of these ${voided > 1 ? "were" : "was"} voided as fraud.` : ".")
        : "No other customers share this address, phone or PayPal account.",
      relatedOrderIds: n ? linked.map((l) => l.o.id) : undefined,
    }));
  }

  const score = Math.min(100, signals.reduce((s, x) => s + x.points, 0));
  const level: RiskLevel = score >= 60 ? "high" : score >= 30 ? "medium" : "low";
  return { signals, rule: { score, level, medianTotal: med, multiple: Math.round(multiple * 10) / 10 } };
}

export function withSignals(order: Order, all: Order[]): OrderView {
  return { ...order, ...computeSignals(order, all) };
}
