// Server-side PayPal REST client (sandbox). Never import this from client components.
import { randomUUID } from "crypto";
import type { Address, OrderItem } from "./types";

const BASE_URL = "https://api-m.sandbox.paypal.com";

export class PayPalError extends Error {
  constructor(
    message: string,
    public status: number,
    public issue?: string,
    public debugId?: string,
  ) {
    super(message);
  }
}

// Plain-English versions of the PayPal issue codes we expect to hit.
const FRIENDLY: Record<string, string> = {
  AUTHORIZATION_ALREADY_CAPTURED: "This authorization was already captured — the money has already moved.",
  AUTHORIZATION_VOIDED: "This authorization was already voided — it can no longer be captured.",
  AUTHORIZATION_EXPIRED: "This authorization has expired. Funds are no longer held; ask the buyer to re-order.",
  CANNOT_BE_VOID_AFTER_CAPTURE: "This authorization was already captured, so it can't be voided (a refund would be needed).",
  PREVIOUSLY_VOIDED: "This authorization was already voided.",
  ORDER_ALREADY_AUTHORIZED: "This PayPal order was already authorized.",
  ORDER_NOT_APPROVED: "The buyer hasn't approved this PayPal order yet.",
  INSTRUMENT_DECLINED: "The buyer's funding source was declined. They can retry with another payment method.",
  PAYER_ACTION_REQUIRED: "The buyer needs to complete an extra step in PayPal before this can be authorized.",
  INVALID_RESOURCE_ID: "PayPal couldn't find that order or authorization ID.",
};

// ---- OAuth2 client-credentials token, cached until shortly before expiry ----
let token: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (token && Date.now() < token.expiresAt) return token.value;
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new PayPalError("PayPal credentials are not configured (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET).", 500);

  const res = await fetch(`${BASE_URL}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new PayPalError(`PayPal authentication failed: ${data.error_description ?? res.statusText}`, res.status);
  }
  token = { value: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  return token.value;
}

/** Call a PayPal REST endpoint. Retries once with a fresh token on 401. */
async function paypalFetch<T>(path: string, init: { method: string; body?: unknown; idempotencyKey?: string }, retried = false): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${await getAccessToken()}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.idempotencyKey ? { "PayPal-Request-Id": init.idempotencyKey } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });

  if (res.status === 401 && !retried) {
    token = null; // token expired or revoked — fetch a new one and retry
    return paypalFetch<T>(path, init, true);
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const issue: string | undefined = data.details?.[0]?.issue ?? data.name;
    const detail: string | undefined = data.details?.[0]?.description ?? data.message;
    const message = (issue && FRIENDLY[issue]) || `PayPal error ${res.status}${issue ? ` (${issue})` : ""}: ${detail ?? res.statusText}`;
    throw new PayPalError(message, res.status, issue, data.debug_id ?? res.headers.get("paypal-debug-id") ?? undefined);
  }
  return data as T;
}

const money = (n: number) => ({ currency_code: "USD", value: n.toFixed(2) });

// ---- Orders v2 ----

export async function createAuthorizeOrder(args: {
  referenceId: string;
  items: OrderItem[];
  total: number;
  shipTo: { name: string; address: Address };
}): Promise<{ id: string; status: string }> {
  const { address } = args.shipTo;
  return paypalFetch("/v2/checkout/orders", {
    method: "POST",
    idempotencyKey: randomUUID(),
    body: {
      intent: "AUTHORIZE",
      purchase_units: [
        {
          reference_id: args.referenceId,
          custom_id: args.referenceId,
          description: "Northwind Gadgets order",
          amount: { ...money(args.total), breakdown: { item_total: money(args.total) } },
          items: args.items.map((i) => ({
            name: i.name,
            sku: i.sku,
            quantity: String(i.quantity),
            unit_amount: money(i.unitPrice),
            category: i.category === "gift_card" ? "DIGITAL_GOODS" : "PHYSICAL_GOODS",
          })),
          shipping: {
            type: "SHIPPING",
            name: { full_name: args.shipTo.name },
            address: {
              address_line_1: address.line1,
              ...(address.line2 ? { address_line_2: address.line2 } : {}),
              admin_area_2: address.city,
              ...(address.state ? { admin_area_1: address.state } : {}),
              postal_code: address.postalCode,
              country_code: address.countryCode,
            },
          },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: "Northwind Gadgets",
            shipping_preference: "SET_PROVIDED_ADDRESS",
            user_action: "PAY_NOW",
          },
        },
      },
    },
  });
}

export interface PayPalAuthorizeResult {
  id: string;
  status: string;
  payer?: { payer_id?: string; email_address?: string; name?: { given_name?: string; surname?: string }; address?: { country_code?: string } };
  payment_source?: { paypal?: { account_id?: string; email_address?: string; address?: { country_code?: string } } };
  purchase_units?: {
    payments?: {
      authorizations?: { id: string; status: string; amount: { value: string }; create_time?: string; expiration_time?: string }[];
    };
  }[];
}

export function authorizeOrder(orderId: string): Promise<PayPalAuthorizeResult> {
  return paypalFetch(`/v2/checkout/orders/${encodeURIComponent(orderId)}/authorize`, {
    method: "POST",
    idempotencyKey: `authorize-${orderId}`,
    body: {},
  });
}

// ---- Payments v2 ----

export function captureAuthorization(authId: string): Promise<{ id: string; status: string }> {
  return paypalFetch(`/v2/payments/authorizations/${encodeURIComponent(authId)}/capture`, {
    method: "POST",
    idempotencyKey: `capture-${authId}`,
    body: { final_capture: true },
  });
}

export async function voidAuthorization(authId: string): Promise<{ id?: string; status: string }> {
  const data = await paypalFetch<{ id?: string; status?: string }>(`/v2/payments/authorizations/${encodeURIComponent(authId)}/void`, {
    method: "POST",
    idempotencyKey: `void-${authId}`,
  });
  // PayPal may answer 204 No Content; a successful void means status VOIDED.
  return { id: data.id ?? authId, status: data.status ?? "VOIDED" };
}
