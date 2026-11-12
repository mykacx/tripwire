import { NextResponse } from "next/server";
import { z } from "zod";
import { PayPalError } from "./paypal";

/** Turn any thrown error into a readable JSON error response. */
export function errorResponse(err: unknown): NextResponse {
  if (err instanceof PayPalError) {
    return NextResponse.json({ error: err.message, issue: err.issue, debugId: err.debugId }, { status: err.status >= 400 ? err.status : 502 });
  }
  if (err instanceof z.ZodError) {
    const first = err.issues[0];
    return NextResponse.json({ error: `Invalid ${first.path.join(".") || "input"}: ${first.message}` }, { status: 400 });
  }
  const message = err instanceof Error ? err.message : "Unexpected error";
  console.error("[api]", err);
  return NextResponse.json({ error: message }, { status: 400 });
}

export const checkoutSchema = z.object({
  customer: z.object({
    name: z.string().trim().min(2).max(80),
    email: z.string().trim().email().max(120),
    phone: z.string().trim().min(5).max(30),
  }),
  shipping: z.object({
    line1: z.string().trim().min(3).max(150),
    line2: z.string().trim().max(150).optional(),
    city: z.string().trim().min(2).max(80),
    state: z.string().trim().max(80).optional(),
    postalCode: z.string().trim().min(2).max(20),
    countryCode: z.string().trim().length(2).toUpperCase(),
  }),
  note: z.string().trim().max(300).optional(),
  items: z.array(z.object({ sku: z.string(), quantity: z.number().int().min(1).max(20) })).min(1),
});
