// Human decisions on an order: Approve (capture) or Void. The AI never calls these.
import { captureAuthorization, PayPalError, voidAuthorization } from "./paypal";
import { event, getOrder, updateOrder } from "./store";
import type { Order } from "./types";

export type Decision = "approve" | "void";

export async function decide(id: string, decision: Decision): Promise<{ order: Order; message: string }> {
  const order = await getOrder(id);
  if (!order) throw new Error(`Order ${id} not found.`);
  if (order.status !== "needs_review") {
    throw new Error(`Order ${id} is already ${order.status}; no further action is possible.`);
  }

  // Seeded demo rows: change local state only.
  if (order.demo) {
    const updated = await updateOrder(id, (o) => {
      o.status = decision === "approve" ? "approved" : "voided";
      o.paypal.authorizationStatus = decision === "approve" ? "CAPTURED (demo)" : "VOIDED (demo)";
      o.events.push(event(decision === "approve" ? "approved" : "voided", "human", `${decision === "approve" ? "Approved" : "Voided"} by reviewer (demo data — no PayPal call made).`));
    });
    return { order: updated, message: `Demo order ${decision === "approve" ? "approved" : "voided"} locally — no PayPal call for demo data.` };
  }

  const authId = order.paypal.authorizationId;
  if (!authId) throw new Error("This order has no PayPal authorization ID.");

  try {
    if (decision === "approve") {
      const cap = await captureAuthorization(authId);
      const updated = await updateOrder(id, (o) => {
        o.status = "approved";
        o.paypal.captureId = cap.id;
        o.paypal.captureStatus = cap.status;
        o.paypal.authorizationStatus = "CAPTURED";
        o.paypal.lastError = undefined;
        o.events.push(event("approved", "human", `Approved by reviewer. PayPal captured $${o.total.toFixed(2)} (capture ${cap.id}, status ${cap.status}).`));
      });
      return { order: updated, message: `Captured $${order.total.toFixed(2)} via PayPal (status ${cap.status}).` };
    } else {
      const v = await voidAuthorization(authId);
      const updated = await updateOrder(id, (o) => {
        o.status = "voided";
        o.paypal.voidStatus = v.status;
        o.paypal.authorizationStatus = v.status;
        o.paypal.lastError = undefined;
        o.events.push(event("voided", "human", `Voided by reviewer. PayPal released the hold (authorization ${authId}, status ${v.status}). No money moved.`));
      });
      return { order: updated, message: `Authorization voided via PayPal — the money never moved.` };
    }
  } catch (err) {
    if (err instanceof PayPalError) {
      // Keep local state in sync with PayPal when the authorization already reached a final state.
      const finalState =
        err.issue === "AUTHORIZATION_ALREADY_CAPTURED" || err.issue === "CANNOT_BE_VOID_AFTER_CAPTURE" ? "approved"
        : err.issue === "AUTHORIZATION_VOIDED" || err.issue === "PREVIOUSLY_VOIDED" ? "voided"
        : null;
      await updateOrder(id, (o) => {
        o.paypal.lastError = err.message;
        o.paypal.debugId = err.debugId;
        if (finalState) o.status = finalState;
        if (err.issue === "AUTHORIZATION_EXPIRED") o.paypal.authorizationStatus = "EXPIRED";
        o.events.push(event("error", "paypal", `${decision === "approve" ? "Capture" : "Void"} failed: ${err.message}${err.debugId ? ` (debug id ${err.debugId})` : ""}`));
      });
    }
    throw err;
  }
}
