import { promises as fs } from "fs";
import path from "path";
import { randomBytes } from "crypto";
import type { Order, OrderEvent } from "./types";

// Simple JSON-file store. Good enough for a single-instance demo (e.g. Render free tier).
// data/orders.json is created from data/seed.json on first use and can be reset.

// TRIPWIRE_DATA_DIR (optional) keeps runtime orders somewhere else, e.g. for a scratch copy.
const DATA_DIR = process.env.TRIPWIRE_DATA_DIR || path.join(process.cwd(), "data");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");
const SEED_FILE = path.join(process.cwd(), "data", "seed.json");

let cache: Order[] | null = null;
let writeChain: Promise<void> = Promise.resolve();

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Load data/seed.json ({ generatedAt, orders }) and shift every timestamp forward by whole days,
 * so the demo always looks recent ("last 14 days") while keeping each order's time of day.
 */
async function loadSeed(): Promise<Order[]> {
  try {
    const seed = JSON.parse(await fs.readFile(SEED_FILE, "utf8")) as { generatedAt: string; orders: Order[] };
    const now = Date.now();
    const days = Math.max(0, Math.floor((now - new Date(seed.generatedAt).getTime()) / DAY_MS));
    return seed.orders.map((o) => {
      // An order that would land in the future (later time of day than now) goes back one more day.
      const d = new Date(o.updatedAt).getTime() + days * DAY_MS > now ? days - 1 : days;
      const shift = (iso?: string) => (iso ? new Date(new Date(iso).getTime() + d * DAY_MS).toISOString() : iso);
      return {
        ...o,
        createdAt: shift(o.createdAt)!,
        updatedAt: shift(o.updatedAt)!,
        paypal: { ...o.paypal, authorizationExpiresAt: shift(o.paypal.authorizationExpiresAt), honorPeriodEndsAt: shift(o.paypal.honorPeriodEndsAt) },
        events: o.events.map((e) => ({ ...e, at: shift(e.at)! })),
      };
    });
  } catch (err) {
    console.error("[store] could not load seed.json", err);
    return [];
  }
}

// Demo data auto-refreshes once a day, so a long-running deployment (e.g. during judging)
// always shows recent dates and a fresh queue. Live sandbox orders are never touched.
const AUTO_RESET_MS = 24 * 60 * 60 * 1000;
let seededAt = Date.now();

async function load(): Promise<Order[]> {
  if (cache && Date.now() - seededAt > AUTO_RESET_MS) {
    seededAt = Date.now(); // set first so concurrent requests don't reset twice
    const live = cache.filter((o) => !o.demo);
    cache = [...(await loadSeed()), ...live];
    await persist();
    console.log("[store] demo data auto-refreshed");
  }
  if (cache) return cache;
  try {
    cache = JSON.parse(await fs.readFile(ORDERS_FILE, "utf8")) as Order[];
  } catch {
    cache = await loadSeed();
    await persist();
  }
  seededAt = Date.now();
  return cache;
}

function persist(): Promise<void> {
  const snapshot = JSON.stringify(cache ?? [], null, 2);
  writeChain = writeChain
    .then(async () => {
      await fs.mkdir(DATA_DIR, { recursive: true });
      const tmp = ORDERS_FILE + ".tmp";
      await fs.writeFile(tmp, snapshot, "utf8");
      await fs.rename(tmp, ORDERS_FILE);
    })
    .catch((err) => console.error("[store] write failed", err));
  return writeChain;
}

export async function listOrders(): Promise<Order[]> {
  return [...(await load())];
}

export async function getOrder(id: string): Promise<Order | undefined> {
  return (await load()).find((o) => o.id === id);
}

export async function insertOrder(order: Order): Promise<Order> {
  const orders = await load();
  orders.push(order);
  await persist();
  return order;
}

/** Apply a mutation to an order and save. Returns the updated order. */
export async function updateOrder(id: string, mutate: (o: Order) => void): Promise<Order> {
  const order = (await load()).find((o) => o.id === id);
  if (!order) throw new Error(`Order ${id} not found`);
  mutate(order);
  order.updatedAt = new Date().toISOString();
  await persist();
  return order;
}

/** Restore seeded demo data, keeping live sandbox orders. */
export async function resetDemoData(): Promise<void> {
  const live = (await load()).filter((o) => !o.demo);
  cache = [...(await loadSeed()), ...live];
  seededAt = Date.now();
  await persist();
}

export function newOrderId(): string {
  return "TW-" + randomBytes(3).toString("hex").toUpperCase();
}

export function event(type: OrderEvent["type"], actor: OrderEvent["actor"], message: string): OrderEvent {
  return { at: new Date().toISOString(), type, actor, message };
}
