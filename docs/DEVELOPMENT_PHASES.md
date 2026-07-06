# SG Couture — Development Phases

> **Status:** Living document · **Last updated:** 2026-07-06
>
> 🤖 **Claude Code:** read this file **first** on every task. Work only within the active phase unless told otherwise. Update statuses and checklists immediately after completing work.

**Legend:** ⬜ Not Started · 🟨 In Progress · ✅ Completed

**Current state:** Active phase: **Phase 0** (in progress — dependencies, validated `ConfigModule`, and hardened PrismaModule/migrations are done; bootstrap wiring, interceptors/filters, and HealthModule remain outstanding).

**Global Definition of Done (applies to every phase):** code passes lint + typecheck; unit tests for services + e2e happy-path per endpoint; all endpoints follow the envelope + API_SPECIFICATION.md template; every new/changed endpoint and its DTOs carry `@nestjs/swagger` decorators (applied via the `nestjs-swagger` skill) and render correctly in the Swagger UI at `/api/docs`; docs updated (API/DATABASE/CHANGELOG/this file); no TODOs referencing undecided business logic (ask instead).

---

## Phase 0 — Project Foundation 🟨

**Purpose:** a running skeleton every later phase plugs into.
**Dependencies:** none.

**Features / tasks**
- [ ] NestJS scaffold, strict TS config, ESLint + Prettier
- [x] `ConfigModule` with env validation (fail-fast on boot) — full list in [CODING_STANDARDS.md §Environment Variables](./CODING_STANDARDS.md#environment-variables). Required now: `NODE_ENV`, `PORT`, `DATABASE_URL`, `CORS_ORIGINS`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`; `DIRECT_URL` is optional and CLI-only; other vars are typed/defaulted but optional until their phase lands.
- [x] `PrismaModule` + provided schema + **Migration 001** ([DATABASE.md §4](./DATABASE.md#4-required-schema-changes-migration-001--before-phase-67): Geidea fields, Coupon.perUserLimit + CouponUsage, ShippingZone, order sequence, extra indexes) — applied via `prisma/migrations/20260704231931_init`; `src/prisma/{prisma.module.ts,prisma.service.ts}` use `@prisma/adapter-pg` and validated injected database config; client generation targets `src/generated/prisma`; the shipping-zone partial unique index is schema-declared.
- [x] Phase 0 Prisma review hardening — fresh/no-env generation, production-only install-safe postinstall, Jest generated-client mapping, normal `dist/main.js` output, and build/lint coverage for `prisma.config.ts`.
- [ ] Global prefix `/api` + URI versioning `v1`; helmet; CORS allow-list from env
- [ ] Global ValidationPipe, ResponseEnvelopeInterceptor, PrismaExceptionFilter, AllExceptionsFilter, error-code constants
- [ ] `SwaggerModule` setup in `src/main.ts` (`@nestjs/swagger`, already installed) — OpenAPI doc + Swagger UI served at `/api/docs`; Bearer auth scheme registered
- [ ] Pino structured logging with request ids
- [ ] `@nestjs/throttler` global default (100 req/min/IP)
- [ ] HealthModule (`GET /api/v1/health`, Terminus + Prisma ping)
- [ ] `prisma/seed.ts` (dev data), npm scripts, README quick start

**Acceptance criteria:** app boots with validated env; `/health` returns envelope; a deliberately bad DTO on a sample route returns the documented 422 shape; migrations apply cleanly on an empty DB; Swagger UI serves the OpenAPI spec at `/api/docs`.

---

## Phase 1 — Identity Sync & Authorization (Clerk) ⬜

**Purpose:** authenticated identity + roles for everything that follows. **This is the auth phase — note there are no register/login/password endpoints; Clerk owns those flows** ([ADR-0001](./ADR/ADR-0001-clerk-authentication.md)).
**Dependencies:** Phase 0. **DB:** `users`.

**Features / tasks**
- [ ] `ClerkAuthGuard` (JWT verify via `@clerk/backend`, JWKS cache, DB user load, `active` check, JIT sync on webhook lag)
- [ ] `OptionalAuthGuard`
- [ ] `RolesGuard` + `@Roles()` + `@CurrentUser()` + `@Public()`
- [ ] `POST /webhooks/clerk` — Svix verification, raw body, idempotent upsert/delete for `user.created|updated|deleted`
- [ ] Role mirror → Clerk `publicMetadata.role` on change
- [ ] `GET/PATCH /users/me`
- [ ] Admin users API: list/get, `PATCH /admin/users/:id/role` (ADMIN), `PATCH /admin/users/:id/status` (ADMIN), `POST /admin/users/:id/reset-password` (MANAGER+, Clerk-triggered, USER targets only)
- [ ] Self-modification protection (409)

**Endpoints:** see [API_SPECIFICATION.md §2–3](./API_SPECIFICATION.md).
**Acceptance criteria:** webhook replay-safe; deactivated user gets 403 everywhere; MANAGER cannot change roles; role change visible in Clerk metadata.

---

## Phase 2 — Catalog ⬜

**Purpose:** categories, sub-categories, products, images — the storefront's read model and the dashboard's first write surface.
**Dependencies:** Phase 1 (role guards), Cloudinary account. **DB:** `categories`, `subCategories`, `products`, `productImages`, `productSubCategories`.

**Features / tasks**
- [ ] UploadsModule (Cloudinary signed upload, destroy by `imageId`)
- [ ] Categories + SubCategories CRUD (MANAGER+), public listing/detail by slug
- [ ] Products CRUD (MANAGER+): slug generation, `priceAfterDiscount` computation, sub-category↔category validation, archive-instead-of-delete on 409
- [ ] Product gallery endpoints (add, delete, reorder)
- [ ] Public product listing with full filter/sort/pagination set (FEATURES.md §2) + product detail by slug
- [ ] Seed data expansion

**Acceptance criteria:** DRAFT/ARCHIVED invisible on storefront routes; filters combine correctly (e2e matrix); deleting referenced category/product returns documented 409s; Cloudinary assets destroyed on replace.

---

## Phase 3 — Reviews & Wishlist ⬜

**Purpose:** social proof + saved items.
**Dependencies:** Phase 2. **DB:** `reviews`, `UserWishlist`.

**Features / tasks**
- [ ] Reviews CRUD (own) + ADMIN moderation delete; one-per-user-per-product 409
- [ ] Transactional rating aggregate recompute (avg rounded to 1 dp, null at zero)
- [ ] Public review listing per product (paginated)
- [ ] Wishlist: idempotent add/remove, listing with `available` flag

**Acceptance criteria:** aggregates correct after create/update/delete sequences (unit-tested math); duplicate review → 409 `REVIEW_EXISTS`; wishlist ops idempotent.

---

## Phase 4 — Cart ⬜

**Purpose:** the server-owned cart both storefronts share; anonymous support + merge ([ADR-0004](./ADR/ADR-0004-anonymous-cart-and-merge.md)).
**Dependencies:** Phase 2. **DB:** `carts`, `cartItems`.

**Features / tasks**
- [ ] Cart identity middleware (JWT → user cart; `cart_session` cookie / `X-Cart-Session` header → anonymous)
- [ ] Anonymous cart creation: UUID token, cookie for web + body echo for mobile, sliding 7-day `expiresAt`
- [ ] Get cart (virtual empty when none), add/update/remove item, clear
- [ ] Line validation: ACTIVE product, color/size membership, advisory stock cap with `available` in errors
- [ ] Server-side totals recompute on every mutation
- [ ] Auto-merge on first authenticated request with anonymous token (idempotent; cookie cleared)
- [ ] Cron: purge expired carts

**Acceptance criteria:** concurrency-safe totals (mutations transactional); merge scenarios covered by e2e (no user cart / both carts / replay); mobile header flow works without cookies.

---

## Phase 5 — Coupons & Shipping Zones ⬜

**Purpose:** pricing modifiers checkout depends on.
**Dependencies:** Phase 1 (roles). **DB:** `coupons`, `couponUsages`, `shippingZones`.

**Features / tasks**
- [ ] Coupons CRUD (MANAGER+; uppercase normalization; deactivate instead of delete when referenced)
- [ ] `POST /coupons/validate` public preview (auth optional; per-user check uses userId or provided email)
- [ ] Race-safe consumption + release primitives (used by Phase 6)
- [ ] Shipping zones CRUD (MANAGER+) + public fee lookup endpoint
- [ ] Most-specific-match fee resolution

**Acceptance criteria:** exhausted/expired/inactive/per-user-limit cases each return documented 409/422 codes; concurrent consumption of last global use → exactly one winner (test with parallel transactions); fee lookup city > governorate precedence verified.

---

## Phase 6 — Checkout & Orders ⬜

**Purpose:** the core money path — registered + anonymous checkout, atomic stock, order lifecycle, guest claiming ([ADR-0003](./ADR/ADR-0003-stock-reservation-strategy.md)).
**Dependencies:** Phases 4 & 5. **DB:** `orders`, `orderItems`, sequence.

**Features / tasks**
- [ ] Checkout transaction (FEATURES.md §6): cart load → line validation → shipping fee → coupon consume → **conditional stock decrement** → order + items + humanOrderId → cart clear
- [ ] Anonymous checkout variant (anon fields DTO, guestToken generation)
- [ ] `order.created` event (email hookup lands in Phase 8; event emitted now)
- [ ] My orders: list + detail; guest order fetch by token
- [ ] User self-cancel (PENDING + unpaid)
- [ ] Admin orders: list/filter, detail, status transitions with full state machine + stock/coupon restoration, mark CASH paid (ADMIN)
- [ ] Guest claiming endpoint (auth required; sets userId + audit; nulls token)
- [ ] Cron: expire unpaid CARD orders (60 min) with restoration; guest-token cleanup

**Acceptance criteria (must-pass concurrency test):** two parallel checkouts for the same last unit → exactly one 201, one 409 `INSUFFICIENT_STOCK`, stock ends at 0, no money implications for the loser. Full transition matrix e2e-tested incl. restoration side effects; totals verified against seeded fixtures to the piaster.

---

## Phase 7 — Payments (Geidea) ⬜

**Purpose:** card payments via Geidea Checkout ([ADR-0002](./ADR/ADR-0002-geidea-payment-gateway.md)).
**Dependencies:** Phase 6, Geidea merchant sandbox credentials. **DB:** `geideaSessionId`, `geideaOrderId` (Migration 001).

**Features / tasks**
- [ ] `GeideaService`: signed create-session, session reuse (idempotent), config from env
- [ ] `POST /orders/:id/payment-session` (owner or guest-token; CARD, PENDING, unpaid)
- [ ] `POST /webhooks/geidea`: signature verification, amount/currency match, idempotent paid-flip, `sold` increment, `order.paid` event
- [ ] Admin re-verify endpoint (query Geidea for support cases)
- [ ] Sandbox e2e using Geidea test cards

**Acceptance criteria:** unsigned/tampered callbacks rejected (401) and logged; amount mismatch never marks paid + CRITICAL log; duplicate callbacks no-op; expiry cron releases a session-created-but-never-paid order cleanly.

---

## Phase 8 — Emails (Resend) ⬜

**Purpose:** transactional email on the events emitted by Phases 6–7.
**Dependencies:** Phases 6–7, Resend API key + verified domain.

**Features / tasks**
- [ ] MailModule + templates: order confirmation (registered/guest+claim link), payment receipt, status updates
- [ ] Event listeners (`order.created`, `order.paid`, `order.status_changed`) — post-commit, non-blocking, 3-retry backoff
- [ ] Failure logging that never breaks the originating flow

**Acceptance criteria:** email failure ≠ request failure (fault-injection test); guest confirmation contains a working claim link; templates render with seeded orders.

---

## Phase 9 — Notifications (in-app) ⬜

**Purpose:** dashboard/storefront bell. **Dependencies:** Phase 6. **DB:** `notifications`.

**Features / tasks**
- [ ] Listeners: `order.paid`, `order.status_changed` → user notification (skip unclaimed guest orders)
- [ ] List (paginated, `read` filter, unread count in meta), mark read, mark all read
- [ ] ADMIN `PROMO` broadcast (batched)

**Acceptance criteria:** unread-count query uses the `[userId, read]` index; broadcast to N users batched (no N sequential inserts).

---

## Phase 10 — Analytics & Dashboard ⬜ · Phase 11 — Hardening & Launch ⬜

**Phase 10 (ADMIN):** overview endpoint(s) — revenue by period (paid orders), orders by status, top sellers, low stock, new customers. Acceptance: numbers reconcile with seeded fixtures; MANAGER gets 403.

**Phase 11:** stricter per-route throttles (checkout, coupon validate, webhooks); security review pass ([CODING_STANDARDS.md §Security](./CODING_STANDARDS.md#security)); load test on checkout concurrency; coverage targets met (services ≥ 80%, money paths ≥ 95%); deployment config + runbook; final docs audit (incl. OpenAPI spec complete and accurate for all endpoints). Acceptance: launch checklist signed off.

---

## Master Implementation Progress

> 🤖 Claude Code: tick items and update phase statuses above **in the same task** that completes them.

- [ ] Phase 0 — Foundation
- [ ] Phase 1 — Identity & Authorization (Clerk)
- [ ] Phase 2 — Catalog
- [ ] Phase 3 — Reviews & Wishlist
- [ ] Phase 4 — Cart
- [ ] Phase 5 — Coupons & Shipping
- [ ] Phase 6 — Checkout & Orders
- [ ] Phase 7 — Payments (Geidea)
- [ ] Phase 8 — Emails (Resend)
- [ ] Phase 9 — Notifications
- [ ] Phase 10 — Analytics
- [ ] Phase 11 — Hardening & Launch

**Future (explicitly out of scope now):** Bosta, FCM push, automated Geidea refunds, verified-purchase reviews, address snapshots, SKU variants, Redis, AR/EN content, invoice PDFs, search engine. See [FEATURES.md §12](./FEATURES.md#12-future-enhancements-out-of-current-scope).
