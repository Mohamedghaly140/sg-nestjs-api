# ADR-0002: Geidea Checkout (hosted) for Card Payments

**Status:** Accepted · **Date:** 2026-07-03 · **Deciders:** Mohamed Ghaly

## Context
SG Couture sells in Egypt (EGP). Stripe has no native Egypt merchant support; Geidea is a licensed local gateway supporting EGP, local cards and Meeza, with a sandbox and test cards. Geidea offers two integration styles: **Geidea Checkout** (hosted payment page/iframe, session-based) and **Direct API** (card data hits our servers → PCI-DSS scope).

## Decision
Use **Geidea Checkout (hosted)**:
1. Backend creates a payment session server-to-server (amount from `order.totalOrderPrice`, currency EGP, `merchantReferenceId = order.id`, HMAC signature + timestamp per Geidea spec) and stores `geideaSessionId`.
2. Client opens Geidea Checkout with the session id (JS SDK on web, WebView on mobile). Card data never touches our infrastructure.
3. `POST /webhooks/geidea` is the **only** writer of `isPaid` for CARD orders: verify callback signature → verify amount/currency against our order → flip `isPaid`, store `geideaOrderId`, increment `sold`, emit `order.paid`. Return-URL redirects are UX only.
4. Idempotent webhook handling; replay-safe. Unpaid CARD orders are auto-cancelled after 60 min (stock + coupon restored).
5. Refunds at MVP are executed manually in the Geidea dashboard, then reflected by ADMIN setting status REFUNDED; API-automated refunds are a future enhancement.

Schema impact: replace `stripePaymentIntentId` with `geideaSessionId` + `geideaOrderId` (DATABASE.md §4.1). `PaymentsModule` wraps everything behind a `PaymentGatewayService` interface so a second gateway remains pluggable.

## Options Considered

**A — Geidea Checkout (chosen):** Complexity Low-Med · PCI scope none (SAQ-A level) · Local methods (Meeza) supported. Cons: less UI control, callback-spec coupling.

**B — Geidea Direct API:** full UX control, but card data on our servers → PCI-DSS compliance burden. Rejected outright for a small team.

**C — Keep Stripe:** not viable for Egyptian merchant settlement.

## Consequences
- Easier: no PCI scope; payment truth centralized in one webhook handler; local payment methods.
- Harder: e2e testing requires the Geidea sandbox; signature spec must be tracked from docs.geidea.net; reconciliation endpoint needed for support cases (spec'd as `POST /admin/orders/:id/verify-payment`).

## Action Items
1. [ ] Obtain sandbox merchant credentials
2. [ ] Migration 001 field changes
3. [ ] Phase 7 implementation per DEVELOPMENT_PHASES.md
