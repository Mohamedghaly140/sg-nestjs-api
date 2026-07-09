# ADR-0003: Atomic Conditional Decrement for Stock Reservation

**Status:** Accepted · **Date:** 2026-07-03 · **Deciders:** Mohamed Ghaly

## Context
Hard requirement: if two customers hold the same last unit in their carts and check out simultaneously, exactly one succeeds; the other must never be charged. Stock lives in `Product.quantity` (per-product, not per-variant).

## Decision
**Reserve at order creation** with an atomic conditional decrement inside the checkout transaction:

```ts
// per line, inside prisma.$transaction
const res = await tx.product.updateMany({
  where: { id: productId, quantity: { gte: qty } },
  data:  { quantity: { decrement: qty } },
});
if (res.count === 0) throw new ConflictException(INSUFFICIENT_STOCK); // rolls back everything
```

Postgres row locking serializes concurrent updates on the same row; the `WHERE quantity >= qty` guard makes the loser's update match zero rows → whole transaction (coupon consumption, order rows) rolls back → 409, no payment session is ever created for it.

Lifecycle rules:
- Decrement at order creation for **both** CASH and CARD (the reservation).
- `sold` increments only when `isPaid` flips true; decrements on REFUNDED.
- Restore `quantity` (increment) on: CANCELLED, REFUNDED, and cron-expired unpaid CARD orders (60 min TTL).
- Cart-level stock checks are advisory UX only; the transaction is the source of truth.
- **Forbidden pattern:** read quantity → check in JS → write. Never do this anywhere.

## Options Considered

**A — Conditional decrement at order creation (chosen):** Complexity Low · Correct under concurrency · No extra infra. Cons: CASH orders hold stock until admin cancels; unpaid CARD orders hold stock for up to 60 min.

**B — Reserve only on payment:** no held stock, but a customer can pay for an item that sold out mid-payment → refund flows. Worse outcome than a 409 before paying.

**C — Reservation table with TTL rows (Shopify-style holds):** most flexible (cart-level holds), but adds a table + reaper complexity we don't need at this scale. Revisit if flash-sale patterns emerge.

**D — `SELECT … FOR UPDATE`:** equivalent correctness, more code than `updateMany` for no gain.

## Consequences
- Easier: correctness is provable and testable (parallel-transaction integration test is a Phase 6 acceptance criterion).
- Harder: oversell is prevented but *underselling* can occur briefly (expired reservations return stock on a 15-min cron sweep).
- Revisit when per-variant (size/color) stock arrives — same pattern applies to a variant row.

**2026-07-09 addendum (Phase 11 load test, see `docs/testing/phase-11-load-test.md`):** row-lock serialization on a single hot product means the *time to clear the queue* under contention scales with concurrency × per-transaction round-trip cost (real network round trips against the remote Supabase Postgres, not local). At 10-way contention on one product, the last-queued checkout could exceed Prisma's default 5s interactive-transaction timeout and fail with a raw 500 instead of a clean 409 — fixed by raising the checkout transaction's timeout to 15s (`CHECKOUT_TRANSACTION_OPTIONS` in `orders.service.ts`), which comfortably covers up to ~8-way contention. This doesn't change the decision (Option A is still correct and still chosen) — it's confirmation that Option C's "revisit if flash-sale patterns emerge" trigger is now empirically characterized: a genuine fix for arbitrarily high single-SKU contention is a reservation queue or Redis-backed hot-product locking, both still out of scope per `FEATURES.md` §12.
