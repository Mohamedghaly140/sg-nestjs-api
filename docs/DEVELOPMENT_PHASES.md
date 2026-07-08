# SG Couture — Development Phases

> **Status:** Living document · **Last updated:** 2026-07-08
>
> 🤖 **Claude Code:** read this file **first** on every task. Work only within the active phase unless told otherwise. Update statuses and checklists immediately after completing work.

**Legend:** ⬜ Not Started · 🟨 In Progress · ✅ Completed

**Current state:** **Phases 0–3 are complete.** Active phase: **Phase 4** (Cart).

**Global Definition of Done (applies to every phase):** code passes lint + typecheck; unit tests for services + e2e happy-path per endpoint; all endpoints follow the envelope + API_SPECIFICATION.md template; every new/changed endpoint and its DTOs carry `@nestjs/swagger` decorators (applied via the `nestjs-swagger` skill) and render correctly in the Swagger UI at `/api/docs`; docs updated (API/DATABASE/CHANGELOG/this file); no TODOs referencing undecided business logic (ask instead).

---

## Phase 0 — Project Foundation ✅

**Purpose:** a running skeleton every later phase plugs into.
**Dependencies:** none.

**Features / tasks**
- [x] NestJS scaffold, strict TS config, ESLint + Prettier
- [x] `ConfigModule` with env validation (fail-fast on boot) — full list in [CODING_STANDARDS.md §Environment Variables](./CODING_STANDARDS.md#environment-variables). Required now: `NODE_ENV`, `PORT`, `DATABASE_URL`, `CORS_ORIGINS`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`, and Phase 2 `CLOUDINARY_*`; `DIRECT_URL` is optional and CLI-only; other vars are typed/defaulted but optional until their phase lands.
- [x] `PrismaModule` + provided schema + **Migration 001** ([DATABASE.md §4](./DATABASE.md#4-required-schema-changes-migration-001--before-phase-67): Geidea fields, Coupon.perUserLimit + CouponUsage, ShippingZone, order sequence, extra indexes) — applied via `prisma/migrations/20260704231931_init`; `src/prisma/{prisma.module.ts,prisma.service.ts}` use `@prisma/adapter-pg` and validated injected database config; client generation targets `src/generated/prisma`; the shipping-zone partial unique index is schema-declared.
- [x] Phase 0 Prisma review hardening — fresh/no-env generation, production-only install-safe postinstall, Jest generated-client mapping, normal `dist/main.js` output, and build/lint coverage for `prisma.config.ts`.
- [x] Global prefix `/api` + URI versioning `v1`; helmet; CORS allow-list from env
- [x] Global ValidationPipe, ResponseEnvelopeInterceptor, PrismaExceptionFilter, AllExceptionsFilter, error-code constants
- [x] `SwaggerModule` setup in `src/main.ts` (`@nestjs/swagger`, already installed) — OpenAPI doc + Swagger UI served at `/api/docs`; Bearer auth scheme registered
- [x] Pino structured logging with request ids
- [x] `@nestjs/throttler` global default (100 req/min/IP)
- [x] HealthModule (`GET /api/v1/health`, Terminus + Prisma ping)
- [x] `prisma/seed.ts` (dev data), npm scripts, README quick start

**Acceptance criteria:** app boots with validated env; `/health` returns envelope; a deliberately bad DTO on a sample route returns the documented 422 shape; migrations apply cleanly on an empty DB; Swagger UI serves the OpenAPI spec at `/api/docs`.

---

## Phase 1 — Identity Sync & Authorization (Clerk) ✅

**Purpose:** authenticated identity + roles for everything that follows. **This is the auth phase — note there are no register/login/password endpoints; Clerk owns those flows** ([ADR-0001](./ADR-0001-clerk-authentication.md)).
**Dependencies:** Phase 0. **DB:** `users`.

**Features / tasks**
- [x] `ClerkAuthGuard` (JWT verify via `@clerk/backend`, JWKS cache, DB user load, `active` check, JIT sync on webhook lag)
- [x] `OptionalAuthGuard`
- [x] `RolesGuard` + `@Roles()` + `@CurrentUser()` + `@Public()`
- [x] `POST /webhooks/clerk` — Svix verification, raw body, idempotent upsert/delete for `user.created|updated|deleted`
- [x] Role mirror → Clerk `publicMetadata.role` on change
- [x] `GET/PATCH /users/me`
- [x] Admin users API: list/get, `PATCH /admin/users/:id/role` (ADMIN), `PATCH /admin/users/:id/status` (ADMIN), `POST /admin/users/:id/reset-password` (MANAGER+, random Clerk password + first-party notice, USER targets only) — *this surface is superseded by the Phase 1.5 customers/users split below*
- [x] Self-modification protection (409)

**Endpoints:** see [API_SPECIFICATION.md §2–3](./API_SPECIFICATION.md).
**Acceptance criteria:** webhook replay-safe; deactivated user gets 403 everywhere; MANAGER cannot change roles; role change visible in Clerk metadata.

---

## Phase 1.5 — Admin Identity Rework (dashboard-contract merge) ✅

**Purpose:** restructure the Phase-1 admin user surface into the customers/users split required by the admin dashboard ([API_SPECIFICATION.md §3](./API_SPECIFICATION.md#3-users)).
**Dependencies:** Phase 1. **DB:** none (Clerk + existing `users`).

**Features / tasks**
- [x] `/admin/customers` module: paginated list (`search`, `active?`, implicit `role = USER`, `ordersCount`), detail (profile + addresses + order history), `PATCH :id/active` (Clerk ban/unban first, then DB; `SELF_MODIFICATION_FORBIDDEN` / `FORBIDDEN_TARGET`)
- [x] Move reset-password route to `POST /admin/customers/:id/reset-password` (behavior unchanged)
- [x] `/admin/users` (ADMIN): list all roles (`search`, `role?`, `active?`); replace the separate `/role` + `/status` patches with combined `PATCH /admin/users/:id { role, active }`
- [x] `POST /admin/users` — create account via Clerk (`createUser` first, then idempotent DB upsert; Clerk rejections → 422 with Clerk message)
- [x] `DELETE /admin/users/:id` — Clerk `deleteUser` first (Clerk 404 tolerated), then DB delete
- [x] Last-active-admin protection (409 `LAST_ADMIN_REQUIRED`) on staff update/delete; self-modification guards on all mutations
- [x] New error codes `LAST_ADMIN_REQUIRED`, `FORBIDDEN_TARGET` in `constants/error-codes.ts` (if missing)

**Acceptance criteria:** staff accounts invisible on `/admin/customers/:id` (404); the last active ADMIN cannot be demoted/deactivated/deleted; a Clerk failure leaves the DB untouched (fault-injection test); MANAGER gets 403 on every `/admin/users` route.

---

## Phase 2 — Catalog ✅

**Purpose:** categories, sub-categories, products, images — the storefront's read model and the dashboard's first write surface.
**Dependencies:** Phase 1 (role guards), Cloudinary account. **DB:** `categories`, `subCategories`, `products`, `productImages`, `productSubCategories`.

**Features / tasks**
- [x] UploadsModule (Cloudinary signed upload, destroy by `imageId`)
- [x] Categories + SubCategories CRUD (MANAGER+), public listing/detail by slug + paginated `GET /admin/categories` (search, nested sub-categories)
- [x] Products CRUD (MANAGER+): slug generation, `priceAfterDiscount` computation, sub-category↔category validation, **auto-archive on referenced delete** (200 `{ deleted, archived }`), gallery diff + sub-category reset on update
- [x] Admin product reads: `GET /admin/products` (search/status/categoryId/featured), `filter-options`, `form-data`, `GET /admin/products/:id` (detail) + `:id/form` (edit-form shape)
- [x] Product actions: `POST :id/duplicate` (DRAFT copy, blank images), `PATCH :id/featured`, `PATCH :id/status`
- [x] Product gallery endpoints (add, delete, reorder)
- [x] Public product listing with full filter/sort/pagination set (FEATURES.md §2) + product detail by slug
- [x] Seed data expansion

**Acceptance criteria:** DRAFT/ARCHIVED invisible on storefront routes; filters combine correctly (e2e matrix); deleting a referenced category returns the documented 409 while a referenced product auto-archives; duplicate produces a DRAFT with de-duplicated slug and no images; Cloudinary assets destroyed on replace (best-effort, never failing the request).

---

## Phase 3 — Reviews & Wishlist ✅

**Purpose:** social proof + saved items.
**Dependencies:** Phase 2. **DB:** `reviews`, `UserWishlist`.

**Features / tasks**
- [x] Reviews CRUD (own) + ADMIN moderation delete; one-per-user-per-product 409
- [x] Transactional rating aggregate recompute (avg rounded to 1 dp, null at zero)
- [x] Public review listing per product (paginated)
- [x] Wishlist: idempotent add/remove, listing with `available` flag

**Acceptance criteria:** aggregates correct after create/update/delete sequences (unit-tested math); duplicate review → 409 `REVIEW_EXISTS`; wishlist ops idempotent.

---

## Phase 4 — Cart ⬜

**Purpose:** the server-owned cart both storefronts share; anonymous support + merge ([ADR-0004](./ADR-0004-anonymous-cart-and-merge.md)).
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
- [ ] Coupons CRUD (MANAGER+; uppercase normalization; `expire` future-only on create; delete blocked once used → 409 `COUPON_IN_USE`)
- [ ] Admin coupon list: `search` + derived lifecycle `status` filter (`active|expired|exhausted|deactivated`) + `PATCH /admin/coupons/:id/deactivate` (one-way)
- [ ] `POST /coupons/validate` public preview (auth optional; per-user check uses userId or provided email)
- [ ] Race-safe consumption + release primitives (used by Phase 6)
- [ ] Shipping zones CRUD (MANAGER+) + public fee lookup endpoint
- [ ] Most-specific-match fee resolution

**Acceptance criteria:** exhausted/expired/inactive/per-user-limit cases each return documented 409/422 codes; concurrent consumption of last global use → exactly one winner (test with parallel transactions); fee lookup city > governorate precedence verified.

---

## Phase 6 — Checkout & Orders ⬜

**Purpose:** the core money path — registered + anonymous checkout, atomic stock, order lifecycle, guest claiming ([ADR-0003](./ADR-0003-stock-reservation-strategy.md)).
**Dependencies:** Phases 4 & 5. **DB:** `orders`, `orderItems`, sequence.

**Features / tasks**
- [ ] Checkout transaction (FEATURES.md §6): cart load → line validation → shipping fee → coupon consume → **conditional stock decrement** → order + items + humanOrderId → cart clear
- [ ] Anonymous checkout variant (anon fields DTO, guestToken generation)
- [ ] `order.created` event (email hookup lands in Phase 8; event emitted now)
- [ ] My orders: list + detail; guest order fetch by token
- [ ] User self-cancel (PENDING + unpaid)
- [ ] Admin orders (MANAGER+): list/filter (merged search over humanOrderId/customer name/email/phone; `customerName` + `itemsCount` in rows), full detail (user/address/anon fields/coupon/payment refs), status transitions with full state machine + optional `notes` + stock/coupon restoration, one-way mark CASH paid
- [ ] Guest claiming endpoint (auth required; sets userId + audit; nulls token)
- [ ] Cron: expire unpaid CARD orders (60 min) with restoration; guest-token cleanup

**Acceptance criteria (must-pass concurrency test):** two parallel checkouts for the same last unit → exactly one 201, one 409 `INSUFFICIENT_STOCK`, stock ends at 0, no money implications for the loser. Full transition matrix e2e-tested incl. restoration side effects; totals verified against seeded fixtures to the piaster.

---

## Phase 7 — Payments (Geidea) ⬜

**Purpose:** card payments via Geidea Checkout ([ADR-0002](./ADR-0002-geidea-payment-gateway.md)).
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

**Phase 10 (ADMIN):** `GET /admin/dashboard/metrics` (single aggregate call: month-over-month KPIs, pending/low-stock/active-coupon counts, orders-by-status, trailing-30-day revenue series, recent orders, top products) + the five analytics endpoints (`/admin/analytics/sales|products|customers|coupons|geography`) with shared `from`/`to` range and day/week/month bucket grouping — see [API_SPECIFICATION.md §14](./API_SPECIFICATION.md#14-dashboard--analytics-all-auth-admin--manager--403-by-design). Acceptance: numbers reconcile with seeded fixtures (revenue excludes CANCELLED/REFUNDED, counts don't); MANAGER gets 403 on all of them.

**Phase 11:** stricter per-route throttles (checkout, coupon validate, webhooks); security review pass ([CODING_STANDARDS.md §Security](./CODING_STANDARDS.md#security)); load test on checkout concurrency; coverage targets met (services ≥ 80%, money paths ≥ 95%); deployment config + runbook; final docs audit (incl. OpenAPI spec complete and accurate for all endpoints). Acceptance: launch checklist signed off.

---

## Master Implementation Progress

> 🤖 Claude Code: tick items and update phase statuses above **in the same task** that completes them.

- [x] Phase 0 — Foundation
- [x] Phase 1 — Identity & Authorization (Clerk)
- [x] Phase 1.5 — Admin Identity Rework (customers/users split)
- [x] Phase 2 — Catalog
- [x] Phase 3 — Reviews & Wishlist
- [ ] Phase 4 — Cart
- [ ] Phase 5 — Coupons & Shipping
- [ ] Phase 6 — Checkout & Orders
- [ ] Phase 7 — Payments (Geidea)
- [ ] Phase 8 — Emails (Resend)
- [ ] Phase 9 — Notifications
- [ ] Phase 10 — Analytics
- [ ] Phase 11 — Hardening & Launch

**Future (explicitly out of scope now):** Bosta, FCM push, automated Geidea refunds, verified-purchase reviews, address snapshots, SKU variants, Redis, AR/EN content, invoice PDFs, search engine. See [FEATURES.md §12](./FEATURES.md#12-future-enhancements-out-of-current-scope).
