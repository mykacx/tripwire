import { NextResponse } from "next/server";
import { createAuthorizeOrder } from "@/lib/paypal";
import { priceCart } from "@/lib/products";
import { checkoutSchema, errorResponse } from "@/lib/http";
import { newOrderId } from "@/lib/store";

// Creates a PayPal order with intent AUTHORIZE: the buyer approves, funds are held, nothing is captured yet.
export async function POST(req: Request) {
  try {
    const form = checkoutSchema.parse(await req.json());
    const { items, total } = priceCart(form.items);
    const referenceId = newOrderId();
    const order = await createAuthorizeOrder({
      referenceId,
      items,
      total,
      shipTo: { name: form.customer.name, address: form.shipping },
    });
    return NextResponse.json({ id: order.id, status: order.status, referenceId });
  } catch (err) {
    return errorResponse(err);
  }
}
