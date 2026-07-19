# SG Couture Backend — Deployment & Operations Runbook

> Phase 11 deliverable. Audience: whoever deploys or operates the API. For
> architecture rationale see [ARCHITECTURE.md](./ARCHITECTURE.md); for security
> policy see [CODING_STANDARDS.md §6](./CODING_STANDARDS.md#security) and
> [SECURITY-REVIEW.md](./SECURITY-REVIEW.md).

## 1. What gets deployed

One NestJS modular monolith (`dist/main.js`) + one PostgreSQL database. No
other runtime services: crons run **in-process** via `@nestjs/schedule`,
events are in-process via `@nestjs/event-emitter`, and there is no Redis or
queue. External SaaS dependencies: Clerk (auth), Cloudinary (images), Resend
(mail, optional), Geidea (payments — Phase 7, not yet wired).

**Run exactly one instance.** The checkout/stock paths are safe under
concurrency by design (ADR-0003 conditional decrements + row locks, and the
order-expiry cron re-checks `status` under its lock, so overlapping replicas
won't corrupt data) — but the crons and in-process event listeners are not
deduplicated across replicas: N replicas means N cron firings and N copies of
each transactional email. Scale vertically until that changes.

## 2. Environment variables

Validated at boot by `src/config/env.validation.ts` — the process refuses to
start if a required var is missing or malformed (fail-fast, no partial boot).

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV` | ✅ | `production` on deployed instances |
| `PORT` | default `3000` | |
| `DATABASE_URL` | ✅ | **Pooled** connection string (e.g. Supabase pooler) used at runtime |
| `DIRECT_URL` | optional | Non-pooled connection for `prisma migrate`; falls back to `DATABASE_URL` |
| `CORS_ORIGINS` | ✅ | Comma-separated `scheme://host[:port]` origins — no paths/queries (validated by `IsCorsOriginList`) |
| `CLERK_SECRET_KEY` | ✅ | Use the **production** Clerk instance key in prod |
| `CLERK_WEBHOOK_SECRET` | ✅ | Svix signing secret for `/api/v1/webhooks/clerk` |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | ✅ | |
| `RESEND_API_KEY`, `MAIL_FROM` | optional | Without them, mail sending is a logged no-op (orders still work); admin password-reset notice returns 503 |
| `STOREFRONT_URL` | optional | Base URL for links in transactional emails |
| `GEIDEA_*` (4 vars) | Phase 7 | Leave unset until Geidea ships; separate sandbox/production credentials |
| `CARD_ORDER_EXPIRY_MINUTES` | default `60` | Unpaid CARD orders auto-cancel after this |
| `GUEST_TOKEN_TTL_DAYS` | default `30` | Guest order claim-token lifetime |
| `ANON_CART_TTL_DAYS` | default `7` | Anonymous cart lifetime |
| `LOAD_TEST_MODE` | **never in prod** | See §7 |

Secrets live in the platform's secret store only — never in the repo, never in
images. A hook in this repo intentionally blocks tooling from writing `.env*`
files; create/edit them manually.

## 3. Build & start

```bash
pnpm install --frozen-lockfile   # postinstall runs `prisma generate` (skips cleanly if CLI absent)
pnpm build                       # tsc --noEmit type-check, then nest build -> dist/
pnpm exec prisma migrate deploy  # apply pending migrations (uses DIRECT_URL if set)
pnpm start:prod                  # node dist/main
```

Order matters: **migrate before starting the new code**. Migrations are
forward-only in production — never `prisma migrate dev` or `migrate reset`
against a production database (`dev` can drop/reset the schema).

The Prisma client is generated to `src/generated/prisma` (gitignored), so the
build machine must run `pnpm install` (which triggers generation) before
`pnpm build`.

## 4. Post-deploy verification

1. `GET {host}/api/v1/health` → `200 { app: "up", database: "up" }` (public,
   throttle-exempt; DB ping via Terminus). `503` means the database is
   unreachable — check `DATABASE_URL`/pooler first.
2. Swagger UI (`GET {host}/api/docs`) is **disabled in production**
   (`NODE_ENV=production`) — expect `404`. In non-production it renders and
   `GET {host}/api/docs-json` returns the OpenAPI document.
3. Logs (pino, JSON in production) show no boot errors; startup fails loudly
   on env problems, so a running process means env validated.
4. Clerk webhook: in the Clerk dashboard the endpoint must point at
   `{host}/api/v1/webhooks/clerk` with the same signing secret as
   `CLERK_WEBHOOK_SECRET`. Send a test `user.updated` event → expect `200`
   and an updated `users` row. A `401` means secret mismatch.
5. Smoke: `POST /api/v1/orders/guest` with a seeded cart on staging, or at
   minimum `GET /api/v1/products` returns the envelope shape.

## 5. Scheduled jobs (in-process)

| Job | Schedule | What it does | Failure mode |
|---|---|---|---|
| `OrderExpiryCron.expireUnpaidCardOrders` | every 5 min | Cancels unpaid CARD orders older than `CARD_ORDER_EXPIRY_MINUTES`, restoring stock + coupon under a row lock with a post-lock `status` re-check (idempotent) | Missed runs self-heal on the next tick; orders just expire late |
| `OrderExpiryCron.clearExpiredGuestTokens` | hourly | Nulls expired guest claim tokens | Self-healing, cosmetic |
| `CartCleanupCron.purgeExpiredCarts` | daily 04:00 | Deletes expired **anonymous** carts only | Self-healing; table grows until next run |

No external cron infrastructure: if the process is up, the jobs run.

## 6. Operational notes

- **Response envelope**: every response (success and error) is wrapped by the
  global interceptor/filters — monitoring should parse `status`/`code`, not
  raw HTTP bodies.
- **Logging**: pino with redaction of `authorization`, cookies, `guestToken`,
  `sessionToken`. Admin mutations and webhook syncs carry `audit: true` —
  filter on that for the audit trail.
- **Rate limits**: global 100/min/IP; checkout 5/min, coupon validate 10/min,
  claim 5/min, guest-order fetch 10/min. Webhooks and `/health` are
  signature-gated/`@SkipThrottle()`-exempt. Behind a proxy/CDN, make sure the
  platform passes the real client IP (throttling keys on it).
- **Payments**: CARD checkout is rejected with 422 `PAYMENT_METHOD_UNAVAILABLE`
  until Phase 7 (Geidea) ships. Orders can only be marked paid via admin
  action (CASH) — see Non-Negotiable Rule 6.
- **Stock**: all mutations go through conditional decrements (ADR-0003).
  Never "fix" stock with raw SQL while the app is serving traffic; use the
  admin endpoints.
- **DB backups/restore**: managed by the database provider (e.g. Supabase
  PITR). Restore = restore the DB, then redeploy the matching app version —
  the app itself is stateless.

## 7. ⚠️ LOAD_TEST_MODE

`LOAD_TEST_MODE=true` disables **all** rate limiting
(`ThrottlerModule.skipIf` in `src/app.module.ts`). It exists solely so
`pnpm test:load` (`test/load/checkout-load.ts`, see
[testing/phase-11-load-test.md](./testing/phase-11-load-test.md)) can drive
real checkout concurrency from a single client IP against a **local/staging**
instance.

**Never set it on a deployed instance.** Deploy checklists must verify it is
absent from production env. If it is ever found set in production: unset it
and restart immediately, then review access logs for abuse during the window.

## 8. Rollback

App: redeploy the previous build (stateless — safe at any time).
Migrations: forward-only; if a migration must be undone, write a new
counter-migration rather than editing history. Down-migrations are not
maintained.

## 9. Launch checklist

- [ ] `NODE_ENV=production`, all required env vars set, `LOAD_TEST_MODE` absent
- [ ] Production Clerk instance (not dev keys); webhook endpoint + secret configured and test event passes
- [ ] `CORS_ORIGINS` lists exactly the storefront + admin dashboard origins
- [ ] `prisma migrate deploy` ran cleanly; `migrate status` shows no pending migrations
- [ ] `/api/v1/health` returns 200 with `database: "up"`
- [ ] `/api/docs` returns 404 in production (Swagger disabled); spec audit passed (see CHANGELOG Phase 11 entries)
- [ ] Single instance running; platform passes real client IPs
- [ ] Resend configured (or the mail no-op tradeoff explicitly accepted)
- [ ] DB backups enabled at the provider
- [ ] `pnpm lint` / `pnpm test` / `pnpm test:e2e` green on the deployed commit
