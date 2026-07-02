# SG Couture — Project Overview

> **Status:** Living document · **Last updated:** 2026-07-03 · **Related:** [ARCHITECTURE.md](./ARCHITECTURE.md), [DEVELOPMENT_PHASES.md](./DEVELOPMENT_PHASES.md)

## 1. Purpose

SG Couture is a fashion e-commerce platform for the Egyptian market. This repository is its **dedicated backend**: a standalone NestJS REST API that is the single source of truth for catalog, pricing, carts, orders, payments, and users' app-level data.

The backend serves two client families:

1. **Storefront** — the customer-facing web app (Next.js) and a future React Native (Expo) mobile app.
2. **Admin Dashboard** — internal tool used by MANAGER and ADMIN roles to operate the store.

## 2. Goals

- Provide a clean, versioned REST API (`/api/v1`) consumable identically by web and mobile.
- Guarantee **price integrity**: every monetary value (cart totals, discounts, shipping, order totals) is computed server-side from the database. Clients never submit amounts.
- Guarantee **stock integrity**: an item with quantity 1 can never be sold twice, even under concurrent checkouts.
- Support **anonymous commerce**: guests can build carts and complete checkout without an account, then later claim orders after registering.
- Keep the system operable by a small team: boring technology, strong conventions, exhaustive documentation.

## 3. Target Users

| Role | Description | Access |
|---|---|---|
| **Guest** | Unauthenticated visitor | Storefront: browse, anonymous cart, anonymous checkout |
| **USER** | Registered customer (via Clerk) | Storefront: everything a guest can + addresses, wishlist, reviews, order history, order claiming |
| **MANAGER** | Store operator | Dashboard: catalog, orders (read-only status), coupons, shipping zones, customer table (view + trigger password reset only). **No** analytics/revenue overview, **no** user/role editing |
| **ADMIN** | Owner/superuser | Full dashboard: everything MANAGER has + analytics/revenue, user management, role changes, order status transitions, marking CASH orders paid |

## 4. High-Level Architecture

```
┌─────────────┐   ┌──────────────┐
│  Next.js    │   │ React Native │        Clients (Clerk SDK for auth)
│  Storefront │   │  (future)    │
└──────┬──────┘   └──────┬───────┘
       │  HTTPS / JSON / Bearer (Clerk JWT)
       ▼                 ▼
┌─────────────────────────────────────────┐
│         NestJS API  (/api/v1)           │
│  Guards → Controllers → Services →      │
│  Prisma → PostgreSQL                    │
└──┬─────────┬─────────┬─────────┬────────┘
   │         │         │         │
   ▼         ▼         ▼         ▼
 Clerk     Geidea   Cloudinary  Resend
(identity) (payments) (assets)  (email)
   ▲         ▲
   └─webhooks┘  (Svix-signed / HMAC-signed callbacks)
```

- **Clerk** owns identity (sign-up, sign-in, sessions, passwords, email verification). The local `users` table is a mirror synced via webhooks; it owns app-level relations and the authoritative `role`.
- **Geidea** handles card payments (hosted Geidea Checkout). The backend creates payment sessions and consumes signed webhooks.
- **Cloudinary** stores product/category images and generated assets (e.g., invoices).
- **Resend** delivers transactional email (order confirmation, guest order claim links).

## 5. Backend Responsibilities

- Catalog management (categories, sub-categories, products, images)
- Server-owned carts (registered + anonymous) with automatic merge on login
- Checkout for registered and anonymous customers
- Atomic stock reservation and restoration
- Coupon validation with global and per-user usage limits
- Shipping fee computation from DB-configured zones (Bosta integration later)
- Order lifecycle and admin-controlled status transitions
- Payment session creation + webhook-driven payment confirmation (Geidea)
- Clerk user sync + role-based authorization
- Reviews with denormalized rating aggregates
- Wishlist
- In-app notifications
- Transactional emails
- Dashboard analytics (ADMIN)

**Not backend responsibilities:** rendering, session cookies for Clerk auth (Clerk SDK handles that client-side), password storage of any kind, card data handling (never touches our servers — Geidea hosted page).

## 6. API Philosophy

- **REST, resource-oriented, versioned** at the URI (`/api/v1/...`). Breaking changes require `/api/v2`.
- **Uniform envelope** for every response — see [CODING_STANDARDS.md §Response Envelope](./CODING_STANDARDS.md#response-envelope).
- **Explicit over clever**: predictable status codes, documented error codes, no hidden side effects.
- **Server-authoritative**: clients send intents (product id + quantity), never derived values (prices, totals).
- **Idempotent where money is involved**: payment webhooks and stock mutations are safe under retries/duplicates.

## 7. Design Principles

1. **Single source of truth per concern** — Clerk for identity, Postgres for everything app-level, docs/ for behavior.
2. **Modular monolith** — one deployable NestJS app, strict module boundaries (see ARCHITECTURE.md). Extraction to services is a future option, not a current cost.
3. **Fail loudly, degrade gracefully** — validation rejects bad input at the edge; external-service failures (Resend, Cloudinary) never corrupt order/payment state.
4. **Simplicity over abstraction** — no generic repository layer over Prisma; Prisma *is* the data layer. Abstractions are introduced only when a second implementation exists (e.g., `PaymentGatewayService` interface, because Bosta/other gateways are planned).
5. **Everything observable** — structured logs, audited money/state transitions.
