import type { CheckoutForm, OrderItem, Product } from "./types";

// Northwind Gadgets catalog. Prices are fixed so the demo math works.
export const PRODUCTS: Product[] = [
  { sku: "CABLE-USBC", name: "USB-C Cable Pack", price: 15, category: "normal", blurb: "3 braided 1m cables" },
  { sku: "MOUSE-WL", name: "Wireless Mouse", price: 35, category: "normal", blurb: "Quiet clicks, 18-month battery" },
  { sku: "LAMP-DESK", name: "Desk Lamp", price: 48, category: "normal", blurb: "Dimmable warm-to-cool LED" },
  { sku: "SPEAKER-BT", name: "Bluetooth Speaker", price: 79, category: "normal", blurb: "Pocket-sized, 12h playback" },
  { sku: "GIFT-100", name: "Digital Gift Card $100", price: 100, category: "gift_card", blurb: "Delivered by email" },
  { sku: "GIFT-250", name: "Digital Gift Card $250", price: 250, category: "gift_card", blurb: "Delivered by email" },
  { sku: "LAPTOP-PRO", name: "Pro Laptop", price: 900, category: "electronics", blurb: "14\" display, 16GB RAM" },
];

export function findProduct(sku: string): Product | undefined {
  return PRODUCTS.find((p) => p.sku === sku);
}

export const MAX_QTY_PER_ITEM = 20;

/** Re-price a cart on the server from the catalog (never trust client prices). */
export function priceCart(items: CheckoutForm["items"]): { items: OrderItem[]; total: number } {
  if (!Array.isArray(items) || items.length === 0) throw new Error("Cart is empty.");
  const priced: OrderItem[] = items.map(({ sku, quantity }) => {
    const p = findProduct(sku);
    if (!p) throw new Error(`Unknown product: ${sku}`);
    const qty = Math.floor(Number(quantity));
    if (!(qty >= 1 && qty <= MAX_QTY_PER_ITEM)) throw new Error(`Invalid quantity for ${p.name}.`);
    return { sku: p.sku, name: p.name, unitPrice: p.price, quantity: qty, category: p.category };
  });
  const total = priced.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  return { items: priced, total };
}
