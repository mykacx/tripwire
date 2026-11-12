# Tripwire: Devpost submission draft

**Tagline:** The AI spots the risk, you make the call, and fraud is stopped before the money moves.

## Inspiration

Small online shops get hit by fraud they can't see coming: resellers placing orders under a handful of fake names, stolen PayPal accounts, card-testing bursts at 3 a.m. PayPal does a great job of judging whether a *payment* is legitimate, but it can't know what's normal for one particular store. A $750 order might be routine for an electronics retailer and wildly unusual for a shop whose typical order is $45.

The usual fix comes too late. The merchant captures the money, ships the goods, and finds out weeks later through a chargeback. We wanted to move the decision to *before* the money moves.

## What it does

Tripwire is an AI-assisted fraud review queue for PayPal orders.

- Every checkout uses PayPal's **authorize-then-capture** flow. The buyer's funds are held, not taken.
- Each new order lands in a live review queue built on **AG Grid**.
- Deterministic code computes risk signals from the store's own history: how far the order is above the store's typical order, ordering velocity, PayPal account country vs. shipping country, new customer + high value, gift cards and other easy-to-resell goods, quantity anomalies, odd hours, and **shared identity** (the same address, phone or PayPal account used under different names, even with small typing differences).
- **Claude** reads the order, the signals and related orders, and writes a specific, evidence-based explanation, for example *"$750 is 17× the store's typical order, and the same Singapore address received gift-card orders under three other names this week, one already voided."* It also suggests an action and links orders that look like the same person.
- **A human decides.** *Approve* captures the authorization through PayPal. *Void* voids it, so the money never moves: no refund, no chargeback, no dispute fee.

The AI never moves money on its own.

## How we built it

- **Next.js (App Router) + TypeScript + Tailwind** for the storefront, the review queue and the API routes.
- **PayPal REST APIs (sandbox):** Orders v2 to create (`intent: AUTHORIZE`, with the buyer-entered address via `SET_PROVIDED_ADDRESS`) and authorize orders; Payments v2 to capture or void authorizations; and the PayPal JS SDK for the checkout buttons. All calls are server-side with a cached OAuth token, idempotency keys and plain-English error handling.
- **Anthropic Claude (`claude-sonnet-5-5`)** for the risk review, with structured JSON output validated by zod, a retry, and a deterministic rule-score fallback when the AI is unavailable. The prompt requires evidence-based reasons, honesty about weak evidence, consideration of innocent explanations, and treating customer-written text as untrusted data.
- **AG Grid Community** as the centerpiece: a customized Quartz theme, custom cell renderers (risk badges, score bars, signal chips, country-mismatch highlight, honor-period countdown, action buttons), risk-based row styling, a pinned totals row, cell flashing for new and changed orders, a quick filter, tooltips and live updates via `getRowId`. There are no Enterprise features, so no license key is needed.
- **Claude Code** as a coding assistant during the build. The product design, fraud signals and demo were directed by us.

## Challenges we ran into

- **Linking identities through typos.** "88 Jalan Bukit Merah, #05-12" and "88 Jln Bukit Merah 05-12" are the same flat. We normalize addresses (case, punctuation, whitespace, common abbreviations) and phone numbers so a reseller can't dodge the link by retyping.
- **Keeping the AI honest.** Early on it is tempting to let the model "decide". We kept it strictly advisory, made it cite evidence from the input only, and validate its linked order IDs against real orders so it can't invent links.
- **Authorization lifecycles.** Authorizations have a 3-day honor period and can already be captured, voided or expired by the time someone clicks a button. We surface the countdown and reconcile local state with PayPal's answer when an action fails.
- **Making a demo that always looks recent.** Seed data is re-dated on load (keeping time of day), so "orders in the last 14 days" stays true whenever a judge runs it.

## Accomplishments that we're proud of

- A complete authorize → AI review → human capture/void loop on real PayPal sandbox APIs.
- Explanations a busy merchant can act on in seconds, specific to their own store.
- A review queue that feels like a real operations tool.
- Graceful failure everywhere: if the AI is down, the rule score still works; if PayPal says no, the merchant is told why.

## What we learned

- Authorize/capture/void is an under-used superpower for small merchants. It turns fraud from a refund problem into a decision.
- LLMs are most useful here as *explainers and connectors* on top of deterministic signals, not as black-box judges.
- Store-specific context ("17× *your* typical order") is what makes a risk explanation trustworthy.

## What's next for Tripwire

- PayPal webhooks for authorization events, and server-sent events instead of polling
- A real database and multi-store support
- Merchant-defined auto-approve policies for clearly low-risk orders
- Learning from each merchant's past approve/void decisions to calibrate the AI
- Re-authorization prompts before the honor period ends

## Built with

`paypal` · `paypal-orders-v2` · `paypal-payments-v2` · `paypal-js-sdk` · `anthropic` · `claude` · `ag-grid` · `nextjs` · `react` · `typescript` · `tailwindcss` · `zod` · `render`
