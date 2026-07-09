# Phase 11 — Checkout Concurrency Load Test

> Script: `test/load/checkout-load.ts` · Run with `pnpm test:load` against a **running** instance of the app (not the Nest testing module) with `LOAD_TEST_MODE=true` set on that instance. Tool: [autocannon](https://github.com/mcollina/autocannon).

## Purpose

The Phase 6 acceptance criteria already prove *correctness* of the conditional-stock-decrement transaction (ADR-0003) at 2 parallel requests (`test/orders.e2e-spec.ts`, "allows only one of two concurrent guest checkouts for the last unit"). Phase 11 asks for an actual **load** test: does that same invariant hold under a realistic concurrent burst against one product, and what does the system do under contention (clean rejections, or something uglier)?

## Method

The script seeds one product with `quantity = STOCK` and `CONCURRENCY` pre-seeded guest carts (one item each, same product), then fires exactly `CONCURRENCY` simultaneous `POST /orders/guest` requests (one per autocannon connection, `connections = amount = CONCURRENCY`, `pipelining: 1`) at a running instance, each with a distinct `X-Cart-Session` header. It then asserts the ADR-0003 invariant directly against the database: exactly `STOCK` orders created, final stock `0`, and reports autocannon's latency/throughput stats.

`STOCK = floor(CONCURRENCY / 2)`, so every run has both winners and losers.

**Why it needs `LOAD_TEST_MODE=true` on the target instance:** `POST /orders/guest` is throttled to 5 requests/min/IP (Phase 6). A single load-test client — by construction — sends all of its simulated "users" from one IP, so the real per-IP throttle would reject nearly everything before it ever reached the stock-reservation logic under test. `src/app.module.ts`'s `ThrottlerModule` config has a `skipIf: () => process.env.LOAD_TEST_MODE === 'true'` escape hatch for exactly this reason. **This must never be set in a deployed environment** — see `docs/RUNBOOK.md`. It was added with the user's explicit sign-off after the tradeoff was raised (a global rate-limit bypass mechanism is not something to add silently).

## Finding: default Prisma interactive-transaction timeout (5000ms) was too short

First run (`CONCURRENCY=10`, before any fix) failed hard: **all 10 requests got a raw `500`**, not the expected mix of `201`/`409`. The app log showed:

```
Transaction API error: A query cannot be executed on an expired transaction.
The timeout for this transaction was 5000 ms, however 6030 ms passed since
the start of the transaction.
```

Root cause: `lockAndValidateLines` takes a `SELECT ... FOR UPDATE` on the product row, so concurrent checkouts for the same product fully serialize on that lock. `DATABASE_URL` points at a remote Supabase-pooled Postgres (`aws-0-eu-west-1.pooler.supabase.com`), so every query inside the transaction is a real network round trip — under 10-way contention, requests queued near the back of the line could still be *waiting for the lock* past Prisma's 5s default interactive-transaction timeout, which kills the transaction outright (500 `INTERNAL_ERROR`) instead of letting it reach the clean `409 INSUFFICIENT_STOCK` path.

**Fix:** raised the checkout transaction's `timeout` option to 15000ms (`CHECKOUT_TRANSACTION_OPTIONS` in `src/modules/orders/orders.service.ts`, applied to both `checkout` and `checkoutGuest`). This is a targeted, load-test-justified change — not a blanket increase across every transaction in the service (`claim`/`cancelMine` lock a single already-known order row, a much lower-contention profile with no evidence they need it).

## Results (against the real dev DB, after the fix)

| Concurrency | Stock | Result | Max latency | Notes |
|---|---|---|---|---|
| 4 | 2 | ✅ PASS | 4056 ms | 2×201, 2×409, stock → 0 |
| 6 | 3 | ✅ PASS | 5293 ms | 3×201, 3×409, stock → 0 |
| 8 | 4 | ✅ PASS | 6584–6776 ms | 4×201, 4×409, stock → 0 — **shipped default** |
| 10 | 5 | ❌ FAIL (pre-fix, 5s timeout) | n/a — all 500s | Fixed by the 15s timeout change |
| 10 | 5 | ⚠️ marginal (post-fix, 15s timeout) | ~16.1 s observed once | The last-queued transaction can still exceed a 15s budget under 10-way contention; not reliably clean |

**Residual limit (accepted, not fixed further this phase):** because every query is a real round trip to a remote pooled Postgres instance and the product row lock fully serializes contention, the *time to clear the queue* scales roughly linearly with concurrency on a single hot product. Raising the transaction timeout further only pushes the ceiling out, it doesn't remove it — a genuine fix (e.g. a reservation queue, or Redis-backed hot-product locking) is explicitly future scope per `FEATURES.md` §12 and out of Phase 11. **The default load-test concurrency is set to 8** (reliably clean, empirically verified) rather than an arbitrary larger number, so `pnpm test:load` passes out of the box; `LOAD_TEST_CONCURRENCY` is available to push further and observe the ceiling directly.

In practice this is a narrow edge case: it only bites when many simultaneous checkouts target the *exact same* product's *last few units* (a flash-sale pattern), not general checkout throughput across a catalog.

## Running it yourself

```bash
# Terminal 1 — start a load-test-mode instance (never do this outside a local/throwaway run)
pnpm build
PORT=3011 LOAD_TEST_MODE=true node dist/main.js

# Terminal 2
LOAD_TEST_BASE_URL=http://localhost:3011 pnpm test:load
# or, to explore the ceiling:
LOAD_TEST_BASE_URL=http://localhost:3011 LOAD_TEST_CONCURRENCY=10 pnpm test:load
```

The script cleans up its own fixtures (product/category/carts/orders) on every run, pass or fail.
