"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import { PRODUCTS } from "@/lib/products";
import type { CheckoutForm } from "@/lib/types";

const COUNTRIES: [string, string][] = [
  ["SG", "Singapore"], ["US", "United States"], ["MY", "Malaysia"], ["BR", "Brazil"], ["GB", "United Kingdom"],
  ["AU", "Australia"], ["CA", "Canada"], ["DE", "Germany"], ["FR", "France"], ["IN", "India"], ["ID", "Indonesia"],
  ["PH", "Philippines"], ["JP", "Japan"], ["HK", "Hong Kong"], ["NG", "Nigeria"], ["AE", "United Arab Emirates"],
];

type FormState = Omit<CheckoutForm, "items">;

const EMPTY: FormState = {
  customer: { name: "", email: "", phone: "" },
  shipping: { line1: "", line2: "", city: "", state: "", postalCode: "", countryCode: "SG" },
  note: "",
};

// Optional shortcuts so judges can run the README scenarios quickly.
const SAMPLES: Record<string, FormState> = {
  normal: {
    customer: { name: "Priya Raman", email: "priya.raman@example.com", phone: "+65 9123 4567" },
    shipping: { line1: "12 Tampines Street 81", line2: "#03-04", city: "Singapore", state: "", postalCode: "520012", countryCode: "SG" },
    note: "",
  },
  ring: {
    customer: { name: "Marcos Oliveira", email: "m.oliveira.gifts@example.com", phone: "+55 11 98765 4321" },
    shipping: { line1: "88 Jalan Bukit Merah", line2: "#05-12", city: "Singapore", state: "", postalCode: "150088", countryCode: "SG" },
    note: "urgent gift, ship fast",
  },
};

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export default function Storefront({ paypalClientId }: { paypalClientId: string }) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ orderId: string } | null>(null);
  const [filled, setFilled] = useState<"normal" | "ring" | null>(null);

  // PayPal callbacks are created once; read the latest state through refs.
  const latest = useRef({ cart, form });
  latest.current = { cart, form };
  const referenceId = useRef<string | null>(null);

  const lines = useMemo(
    () => PRODUCTS.filter((p) => cart[p.sku]).map((p) => ({ ...p, quantity: cart[p.sku] })),
    [cart],
  );
  const total = lines.reduce((s, l) => s + l.price * l.quantity, 0);

  // Stable SDK options so the PayPal script is never reset by an unrelated re-render.
  const paypalOptions = useMemo(
    () => ({ clientId: paypalClientId, intent: "authorize", currency: "USD", disableFunding: "card,paylater,credit,venmo" }),
    [paypalClientId],
  );

  const setQty = (sku: string, q: number) =>
    setCart((c) => {
      const next = { ...c };
      if (q <= 0) delete next[sku];
      else next[sku] = Math.min(q, 20);
      return next;
    });

  const update = (section: "customer" | "shipping", key: string, value: string) =>
    setForm((f) => ({ ...f, [section]: { ...f[section], [key]: value } }));

  function buildPayload(): CheckoutForm {
    const { cart, form } = latest.current;
    return {
      ...form,
      items: Object.entries(cart).map(([sku, quantity]) => ({ sku, quantity })),
    };
  }

  function validate(): string | null {
    const { cart, form } = latest.current;
    if (Object.keys(cart).length === 0) return "Add something to your cart first.";
    const { customer: c, shipping: s } = form;
    if (!c.name || !c.email || !c.phone) return "Please fill in your name, email and phone.";
    if (!/^\S+@\S+\.\S+$/.test(c.email)) return "Please enter a valid email.";
    if (!s.line1 || !s.city || !s.postalCode || !s.countryCode) return "Please complete the shipping address.";
    return null;
  }

  async function post<T>(url: string, body: unknown): Promise<T> {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
    return data as T;
  }

  if (done) {
    return (
      <Shell>
        <div className="mx-auto mt-16 max-w-lg rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-2xl">⏳</div>
          <h2 className="text-2xl font-semibold">Order received — pending review</h2>
          <p className="mt-3 text-slate-600">
            Thanks! Your payment of <b>{usd(total)}</b> is authorized but <b>not charged yet</b>. We review every order
            before shipping; you&apos;ll only be charged once it&apos;s approved.
          </p>
          <p className="mt-4 font-mono text-sm text-slate-500">Order {done.orderId}</p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
              onClick={() => { setDone(null); setCart({}); setForm(EMPTY); setFilled(null); }}
            >
              Place another order
            </button>
            <Link href="/" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
              Open Tripwire review queue →
            </Link>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="grid gap-8 lg:grid-cols-[1fr_420px]">
        {/* Products */}
        <section>
          <h2 className="mb-4 text-lg font-semibold">Products</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {PRODUCTS.map((p) => (
              <div key={p.sku} className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex h-24 items-center justify-center rounded-lg bg-slate-100 text-4xl">
                  {p.category === "gift_card" ? "🎁" : p.sku === "LAPTOP-PRO" ? "💻" : p.sku === "MOUSE-WL" ? "🖱️" : p.sku === "LAMP-DESK" ? "💡" : p.sku === "SPEAKER-BT" ? "🔊" : "🔌"}
                </div>
                <div className="font-medium">{p.name}</div>
                <div className="text-sm text-slate-500">{p.blurb}</div>
                <div className="mt-auto flex items-center justify-between pt-3">
                  <span className="text-lg font-semibold">{usd(p.price)}</span>
                  {cart[p.sku] ? (
                    <QtyStepper value={cart[p.sku]} onChange={(q) => setQty(p.sku, q)} />
                  ) : (
                    <button className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700" onClick={() => setQty(p.sku, 1)}>
                      Add to cart
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Cart + checkout */}
        <aside className="space-y-5">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold">Cart</h2>
            {lines.length === 0 ? (
              <p className="text-sm text-slate-500">Your cart is empty.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {lines.map((l) => (
                  <li key={l.sku} className="flex items-center justify-between gap-2">
                    <span className="flex-1">{l.name}</span>
                    <QtyStepper value={l.quantity} onChange={(q) => setQty(l.sku, q)} />
                    <span className="w-20 text-right tabular-nums">{usd(l.price * l.quantity)}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex justify-between border-t border-slate-100 pt-3 font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{usd(total)}</span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold">Checkout</h2>

            {/* Demo shortcuts: fill the form with one of the README scenarios */}
            <div className="mb-4 rounded-lg border-2 border-dashed border-blue-300 bg-blue-50/60 p-3">
              <p className="text-sm font-semibold text-blue-900">⚡ Demo shortcut: fill in a test customer</p>
              <p className="mb-2.5 text-xs text-blue-800/80">Pick a scenario to auto-fill the form, then pay with your sandbox buyer.</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => { setForm(SAMPLES.normal); setFilled("normal"); }}
                  className={`rounded-lg border-2 bg-white px-3 py-2 text-left transition hover:border-green-500 hover:bg-green-50 ${filled === "normal" ? "border-green-600 ring-2 ring-green-200" : "border-green-300"}`}
                >
                  <span className="block text-sm font-semibold text-green-800">{filled === "normal" ? "✓ " : ""}Normal customer</span>
                  <span className="block text-xs text-slate-600">Singapore address, expect low risk</span>
                </button>
                <button
                  onClick={() => { setForm(SAMPLES.ring); setFilled("ring"); }}
                  className={`rounded-lg border-2 bg-white px-3 py-2 text-left transition hover:border-red-500 hover:bg-red-50 ${filled === "ring" ? "border-red-600 ring-2 ring-red-200" : "border-red-300"}`}
                >
                  <span className="block text-sm font-semibold text-red-800">{filled === "ring" ? "✓ " : ""}Suspicious customer</span>
                  <span className="block text-xs text-slate-600">Reseller-ring address + &ldquo;urgent&rdquo; note</span>
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Field label="Full name" className="col-span-2" value={form.customer.name} onChange={(v) => update("customer", "name", v)} />
              <Field label="Email" type="email" value={form.customer.email} onChange={(v) => update("customer", "email", v)} />
              <Field label="Phone" value={form.customer.phone} onChange={(v) => update("customer", "phone", v)} />
              <Field label="Address line 1" className="col-span-2" value={form.shipping.line1} onChange={(v) => update("shipping", "line1", v)} />
              <Field label="Address line 2 (optional)" className="col-span-2" value={form.shipping.line2 ?? ""} onChange={(v) => update("shipping", "line2", v)} />
              <Field label="City" value={form.shipping.city} onChange={(v) => update("shipping", "city", v)} />
              <Field label="State / region" value={form.shipping.state ?? ""} onChange={(v) => update("shipping", "state", v)} />
              <Field label="Postal code" value={form.shipping.postalCode} onChange={(v) => update("shipping", "postalCode", v)} />
              <label className="flex flex-col gap-1">
                <span className="text-slate-600">Country</span>
                <select
                  className="rounded-md border border-slate-300 bg-white px-2 py-1.5"
                  value={form.shipping.countryCode}
                  onChange={(e) => update("shipping", "countryCode", e.target.value)}
                >
                  {COUNTRIES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                </select>
              </label>
              <label className="col-span-2 flex flex-col gap-1">
                <span className="text-slate-600">Order note (optional)</span>
                <textarea
                  rows={2}
                  className="rounded-md border border-slate-300 px-2 py-1.5"
                  value={form.note ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                />
              </label>
            </div>

            {error && <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

            <div className="mt-4">
              {!paypalClientId ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  NEXT_PUBLIC_PAYPAL_CLIENT_ID is not set. Add it to .env.local and restart.
                </div>
              ) : (
                <PayPalScriptProvider options={paypalOptions}>
                  {lines.length === 0 ? (
                    <div className="rounded-md border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
                      Add something to your cart to check out with PayPal.
                    </div>
                  ) : (
                  <PayPalButtons
                    style={{ layout: "vertical", shape: "rect", label: "pay" }}
                    disabled={busy}
                    onClick={(_data, actions) => {
                      const problem = validate();
                      setError(problem);
                      return problem ? actions.reject() : actions.resolve();
                    }}
                    createOrder={async () => {
                      setError(null);
                      const res = await post<{ id: string; referenceId: string }>("/api/paypal/create-order", buildPayload());
                      referenceId.current = res.referenceId;
                      return res.id;
                    }}
                    onApprove={async (data) => {
                      setBusy(true);
                      try {
                        const res = await post<{ orderId: string }>("/api/paypal/authorize-order", {
                          paypalOrderId: data.orderID,
                          referenceId: referenceId.current,
                          form: buildPayload(),
                        });
                        setDone({ orderId: res.orderId });
                      } catch (e) {
                        setError(e instanceof Error ? e.message : String(e));
                      } finally {
                        setBusy(false);
                      }
                    }}
                    onCancel={() => setError("Payment cancelled — nothing was charged.")}
                    onError={(err) => setError(err instanceof Error ? err.message : String(err))}
                  />
                  )}
                </PayPalScriptProvider>
              )}
              <p className="mt-2 text-xs text-slate-500">Your PayPal payment is authorized now and charged only after the order is reviewed.</p>
            </div>
          </div>
        </aside>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-200">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <div className="text-xl font-bold tracking-tight">Northwind Gadgets</div>
            <div className="text-xs text-slate-500">Fictional demo store for Tripwire · PayPal sandbox</div>
          </div>
          <Link href="/" className="text-sm font-medium text-slate-600 hover:text-slate-900">Tripwire review queue →</Link>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}

function QtyStepper({ value, onChange }: { value: number; onChange: (q: number) => void }) {
  return (
    <div className="flex items-center rounded-lg border border-slate-300 text-sm">
      <button className="px-2 py-1 hover:bg-slate-50" aria-label="Decrease" onClick={() => onChange(value - 1)}>−</button>
      <span className="w-6 text-center tabular-nums">{value}</span>
      <button className="px-2 py-1 hover:bg-slate-50" aria-label="Increase" onClick={() => onChange(value + 1)}>+</button>
    </div>
  );
}

function Field(props: { label: string; value: string; onChange: (v: string) => void; type?: string; className?: string }) {
  return (
    <label className={`flex flex-col gap-1 ${props.className ?? ""}`}>
      <span className="text-slate-600">{props.label}</span>
      <input
        type={props.type ?? "text"}
        className="rounded-md border border-slate-300 px-2 py-1.5"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </label>
  );
}
