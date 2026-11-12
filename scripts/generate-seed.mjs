// Generates data/seed.json: ~40 fictional orders over the last 14 days for the demo.
// Run: node scripts/generate-seed.mjs   (all names, emails, phones and addresses are invented)
import { writeFileSync } from "fs";

const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const now = Date.now();
// Midnight today in Singapore (UTC+8), as a UTC timestamp.
const sgNow = new Date(now + 8 * HOUR);
const sgMidnight = Date.UTC(sgNow.getUTCFullYear(), sgNow.getUTCMonth(), sgNow.getUTCDate()) - 8 * HOUR;
/** Timestamp `daysAgo` days ago at hh:mm Singapore time. */
const at = (daysAgo, hh, mm = 0) => new Date(sgMidnight - daysAgo * DAY + hh * HOUR + mm * MIN).toISOString();
const ago = (minutes) => new Date(now - minutes * MIN).toISOString();

const P = {
  CABLE: { sku: "CABLE-USBC", name: "USB-C Cable Pack", unitPrice: 15, category: "normal" },
  MOUSE: { sku: "MOUSE-WL", name: "Wireless Mouse", unitPrice: 35, category: "normal" },
  LAMP: { sku: "LAMP-DESK", name: "Desk Lamp", unitPrice: 48, category: "normal" },
  SPEAKER: { sku: "SPEAKER-BT", name: "Bluetooth Speaker", unitPrice: 79, category: "normal" },
  GIFT100: { sku: "GIFT-100", name: "Digital Gift Card $100", unitPrice: 100, category: "gift_card" },
  GIFT250: { sku: "GIFT-250", name: "Digital Gift Card $250", unitPrice: 250, category: "gift_card" },
  LAPTOP: { sku: "LAPTOP-PRO", name: "Pro Laptop", unitPrice: 900, category: "electronics" },
};

let seq = 0x1a2;
const orders = [];

function order({ when, status, name, email, phone, addr, payerCountry, items, note, payerId }) {
  const id = "TW-D" + (seq++).toString(16).toUpperCase().padStart(5, "0");
  const lineItems = items.map(([p, q]) => ({ ...p, quantity: q }));
  const total = lineItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const t = new Date(when).getTime();
  const later = (m) => new Date(t + m * MIN).toISOString();
  const events = [
    { at: when, type: "authorized", actor: "paypal", message: `PayPal authorized $${total.toFixed(2)}. Funds held, not captured. (demo data)` },
  ];
  if (status === "approved") events.push({ at: later(95), type: "approved", actor: "human", message: "Approved by reviewer and captured. (demo data)" });
  if (status === "voided") events.push({ at: later(40), type: "voided", actor: "human", message: "Voided by reviewer — authorization released, no money moved. (demo data)" });
  orders.push({
    id, demo: true, status, createdAt: when, updatedAt: events.at(-1).at,
    customer: { name, email, phone },
    shipping: { city: "Singapore", countryCode: "SG", ...addr },
    ...(note ? { note } : {}),
    items: lineItems, total, currency: "USD",
    paypal: {
      orderId: "DEMO-ORDER-" + id.slice(3),
      orderStatus: "COMPLETED",
      authorizationId: "DEMO-AUTH-" + id.slice(3),
      authorizationStatus: status === "approved" ? "CAPTURED" : status === "voided" ? "VOIDED" : "CREATED",
      authorizationExpiresAt: new Date(t + 29 * DAY).toISOString(),
      honorPeriodEndsAt: new Date(t + 3 * DAY).toISOString(),
      payerId: payerId ?? "DEMOPAYER" + id.slice(4),
      payerEmail: email,
      payerName: name,
      payerCountry: payerCountry ?? addr.countryCode ?? "SG",
    },
    events,
  });
}

// ---- 1. Normal, approved orders ($15–$94). Median of approved totals ≈ $45. ----
const normals = [
  ["Priya Nair", [[P.CABLE, 1]], 13, 10], ["Marcus Lim", [[P.MOUSE, 1]], 13, 15], ["Hannah Goh", [[P.LAMP, 1]], 12, 11],
  ["Rahul Menon", [[P.CABLE, 2]], 12, 19], ["Sofia Tan", [[P.MOUSE, 1]], 11, 14], ["Ethan Ong", [[P.CABLE, 3]], 11, 20],
  ["Nurul Aziz", [[P.LAMP, 1]], 10, 9], ["Jacob Lee", [[P.CABLE, 1], [P.MOUSE, 1]], 10, 16], ["Mei Lin Chua", [[P.MOUSE, 1]], 9, 12],
  ["Arjun Pillai", [[P.SPEAKER, 1]], 9, 21], ["Grace Wong", [[P.LAMP, 1]], 8, 13], ["Daniel Yeo", [[P.CABLE, 2]], 8, 18],
  ["Aiden Teo", [[P.MOUSE, 1]], 7, 10], ["Chloe Ng", [[P.CABLE, 3]], 7, 15], ["Faizal Hamid", [[P.LAMP, 1]], 6, 20],
  ["Isabel Cruz", [[P.CABLE, 1], [P.LAMP, 1]], 6, 11], ["Mei Lin Chua", [[P.LAMP, 1]], 5, 19], ["Kevin Sim", [[P.MOUSE, 2]], 5, 14],
  ["Lauren Ho", [[P.SPEAKER, 1]], 4, 12], ["Siti Rahim", [[P.CABLE, 2]], 4, 17], ["Ryan Koh", [[P.MOUSE, 1], [P.LAMP, 1]], 3, 10],
  ["Wen Hui Lau", [[P.MOUSE, 1]], 3, 22], ["Vikram Rao", [[P.CABLE, 1], [P.SPEAKER, 1]], 2, 13], ["Amelia Foo", [[P.CABLE, 1]], 1, 11],
  ["Joel Seah", [[P.CABLE, 3]], 1, 16],
];
const RETURNING = {
  "Mei Lin Chua": { phone: "+65 9248 0611", addr: { line1: "35 Tampines Avenue 9", line2: "#08-18", postalCode: "520188" }, payerId: "DEMOPAYERMLC01" },
  "Sofia Tan": { phone: "+65 9248 2340", addr: { line1: "25 Tampines Avenue 5", line2: "#05-14", postalCode: "520144" }, payerId: "DEMOPAYERSOF01" },
};
normals.forEach(([name, items, d, h], i) => {
  const slug = name.toLowerCase().replace(/[^a-z]+/g, ".");
  const returning = RETURNING[name]; // repeat customers keep the same phone/address
  order({
    when: at(d, h, (i * 7) % 60), status: "approved", name, email: `${slug}@example.com`,
    phone: returning?.phone ?? `+65 9${String(100 + i * 37).padStart(3, "0")} ${String(2000 + i * 173).slice(0, 4)}`,
    addr: returning?.addr ?? { line1: `${10 + i * 3} Tampines Avenue ${1 + (i % 9)}`, line2: `#0${1 + (i % 9)}-${10 + i}`, postalCode: String(520100 + i * 11) },
    items, payerId: returning?.payerId,
  });
});

// ---- 2. Reseller ring: 3 names, 3 emails, one address (formatted slightly differently), mostly gift cards ----
const ring = { line1: "88 Jalan Bukit Merah", line2: "#05-12", postalCode: "150088" };
order({ when: at(6, 14, 22), status: "approved", name: "Daniel Koh", email: "dkoh.deals@example.net", phone: "+65 8123 4401",
  addr: ring, items: [[P.GIFT100, 2]] });
order({ when: at(4, 16, 5), status: "approved", name: "Aisha Rahman", email: "aisha.r.gifts@example.org", phone: "+65 8123 7788",
  addr: { line1: "88 Jln Bukit Merah #05-12", postalCode: "150088" }, items: [[P.GIFT250, 1]] });
order({ when: at(2, 15, 48), status: "voided", name: "Wei Jie Tan", email: "wj.tan.88@example.com", phone: "+65 8123 7788",
  addr: { line1: "88, Jalan Bukit Merah", line2: "05-12", postalCode: "150088" }, items: [[P.GIFT250, 2], [P.CABLE, 1]],
  payerCountry: "BR", note: "pls send codes asap" });

// ---- 3. Card-testing burst: 6 × $15 from one email within 10 minutes, 2 days ago at ~03:10 SGT ----
[0, 1, 3, 5, 7, 9].forEach((m, i) =>
  order({ when: at(2, 3, 10 + m), status: i < 2 ? "approved" : "voided", name: "J Smith", email: "qa.buyer.7731@example.net",
    phone: "+1 415 555 0142", addr: { line1: "1200 Harbor Blvd", line2: `Apt ${4 + i}`, city: "Oakland", state: "CA", postalCode: "94607", countryCode: "US" },
    payerCountry: "US", items: [[P.CABLE, 1]] }));

// ---- 4. Huge first order: 2 laptops, US PayPal account shipping to Nigeria, voided ----
order({ when: at(5, 2, 41), status: "voided", name: "Michael Brandt", email: "m.brandt.office@example.com", phone: "+234 803 555 0199",
  addr: { line1: "14 Admiralty Way", line2: "Lekki Phase 1", city: "Lagos", state: "Lagos", postalCode: "106104", countryCode: "NG" },
  payerCountry: "US", items: [[P.LAPTOP, 2]], note: "Ship express, will pay any fee" });

// ---- 5. Still awaiting review (a spread of low/medium risk) ----
order({ when: at(1, 2, 37), status: "needs_review", name: "Liam Chen", email: "liam.chen.sg@example.com", phone: "+65 9732 1180",
  addr: { line1: "21 Pasir Ris Drive 3", line2: "#11-04", postalCode: "519498" }, items: [[P.GIFT100, 1]] });
order({ when: ago(185), status: "needs_review", name: "Mei Lin Chua", email: "mei.lin.chua@example.com", phone: "+65 9248 0611",
  addr: { line1: "35 Tampines Avenue 9", line2: "#08-18", postalCode: "520188" }, items: [[P.LAPTOP, 1]], payerId: "DEMOPAYERMLC01" });
order({ when: ago(130), status: "needs_review", name: "Oliver Hughes", email: "oliver.hughes@example.co.uk", phone: "+44 7700 900412",
  addr: { line1: "8 Marina Boulevard", line2: "#22-01", postalCode: "018981" }, payerCountry: "GB",
  items: [[P.LAMP, 2], [P.SPEAKER, 1]], note: "Gift for my sister, she lives here" });
order({ when: ago(75), status: "needs_review", name: "Hafiz Ismail", email: "hafiz.ismail@example.my", phone: "+60 12 345 6789",
  addr: { line1: "5 Woodlands Square", line2: "#03-02", postalCode: "737714" }, payerCountry: "MY", items: [[P.SPEAKER, 3]] });
order({ when: ago(25), status: "needs_review", name: "Sofia Tan", email: "sofia.tan@example.com", phone: "+65 9248 2340",
  addr: { line1: "25 Tampines Avenue 5", line2: "#05-14", postalCode: "520144" }, items: [[P.MOUSE, 1]], payerId: "DEMOPAYERSOF01" });

writeFileSync(new URL("../data/seed.json", import.meta.url), JSON.stringify({ generatedAt: new Date(now).toISOString(), orders }, null, 2) + "\n");

const approved = orders.filter((o) => o.status === "approved").map((o) => o.total).sort((a, b) => a - b);
const mid = Math.floor(approved.length / 2);
const median = approved.length % 2 ? approved[mid] : (approved[mid - 1] + approved[mid]) / 2;
console.log(`Wrote ${orders.length} orders. Approved median total: $${median} (750 / median = ${(750 / median).toFixed(1)}×)`);
