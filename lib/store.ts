import { promises as fs } from "fs";
import path from "path";
import { randomBytes } from "crypto";
import type { Order, OrderEvent } from "./types";

// Simple JSON-file store. Good enough for a single-instance demo (e.g. Render free tier).
// data/orders.json is created from data/seed.json on first use and can be reset.

const DATA_DIR = path.join(process.cwd(), "data");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");
const SEED_FILE = path.join(DATA_DIR, "seed.json");

let cache: Order[] | null = null;
let writeChain: Promise<void> = Promise.resolve();

async function loadSeed(): Promise<Order[]> {
  try {
    return JSON.parse(await fs.readFile(SEED_FILE, "utf8")) as Order[];
  } catch {
    return [];
  }
}

async function load(): Promise<Order[]> {
  if (cache) return cache;
  try {
    cache = JSON.parse(await fs.readFile(ORDERS_FILE, "utf8")) as Order[];
  } catch {
    cache = await loadSeed();
    await persist();
  }
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
  await persist();
}

export function newOrderId(): string {
  return "TW-" + randomBytes(3).toString("hex").toUpperCase();
}

export function event(type: OrderEvent["type"], actor: OrderEvent["actor"], message: string): OrderEvent {
  return { at: new Date().toISOString(), type, actor, message };
}
