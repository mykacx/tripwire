import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeOrder } from "@/lib/paypal";
import { priceCart } from "@/lib/products";
import { checkoutSchema, errorResponse } from "@/lib/http";
import { event, insertOrder } from "@/lib/store";
import type { Order } from "@/lib/types";

const bodySchema = z.object({
  paypalOrderId: z.string().min(5),
  referenceId: z.string().regex(/^TW-[0-9A-F]{6}$/),
  form: checkoutSchema,
});

const HONOR_PERIOD_MS = 3 * 24 * 60 * 60 * 1000;

// Called after the buyer approves in the PayPal popup. Authorizes (holds) the funds and
// puts the order into the review queue. Capture/void happens later, by a human.
export async function POST(req: Request) {
  try {
    const { paypalOrderId, referenceId, form } = bodySchema.parse(await req.json());
    const { items, total } = priceCart(form.items);

    const result = await authorizeOrder(paypalOrderId);
    const auth = result.purchase_units?.[0]?.payments?.authorizations?.[0];
    if (!auth) throw new Error("PayPal did not return an authorization for this order.");

    const now = new Date().toISOString();
    const authCreated = auth.create_time ?? now;
    const payerName = [result.payer?.name?.given_name, result.payer?.name?.surname].filter(Boolean).join(" ");

    const order: Order = {
      id: referenceId,
      demo: false,
      status: "needs_review",
      createdAt: now,
      updatedAt: now,
      customer: form.customer,
      shipping: form.shipping,
      note: form.note || undefined,
      items,
      total,
      currency: "USD",
      paypal: {
        orderId: result.id,
        orderStatus: result.status,
        authorizationId: auth.id,
        authorizationStatus: auth.status,
        authorizationExpiresAt: auth.expiration_time,
        honorPeriodEndsAt: new Date(new Date(authCreated).getTime() + HONOR_PERIOD_MS).toISOString(),
        payerId: result.payer?.payer_id ?? result.payment_source?.paypal?.account_id,
        payerEmail: result.payer?.email_address ?? result.payment_source?.paypal?.email_address,
        payerName: payerName || undefined,
        payerCountry: result.payer?.address?.country_code ?? result.payment_source?.paypal?.address?.country_code,
      },
      events: [event("authorized", "paypal", `PayPal authorized $${auth.amount.value} (authorization ${auth.id}, status ${auth.status}). Funds held, not captured.`)],
    };

    if (Number(auth.amount.value) !== total) {
      order.events.push(event("note", "system", `Warning: PayPal authorized $${auth.amount.value} but the cart totals $${total.toFixed(2)}.`));
    }

    await insertOrder(order);
    return NextResponse.json({ orderId: order.id, authorizationStatus: auth.status });
  } catch (err) {
    return errorResponse(err);
  }
}
