# SG Couture — Storefront API Integration Guide

> **Audience:** frontend developers building the SG Couture **web storefront** and future **React Native mobile app**.
> **Status:** Live contract · Generated from the actual backend code on **2026-07-18**.
> **Base URL:** `https://<api-host>/api/v1`

This folder is the frontend-facing integration guide for every storefront API. It describes what to call, what to send, what comes back, and which errors to handle, with request/response examples taken from the live backend contract.

## Relationship to other docs

| Doc | Role |
|---|---|
| [`../../API_SPECIFICATION.md`](../../API_SPECIFICATION.md) | **Authoritative** backend contract (storefront + admin, backend-maintained). If this guide ever disagrees with the implementation, report the drift. |
| Swagger UI at **`/api/docs`** | Interactive OpenAPI reference generated from code. Raw OpenAPI JSON is at `/api/docs-json`. Use it to try requests with a Clerk Bearer token. |
| [`../../FEATURES.md`](../../FEATURES.md) | Business rules behind carts, coupons, checkout, stock, and order lifecycles. |
| [`../admin/`](../admin/) | Separate admin-dashboard integration guide. |

## Read this first

**[00-conventions.md](./00-conventions.md)** — the three authentication modes, guest-cart sessions for web and mobile, the response envelope, pagination, money/date formats, validation, rate limits, enums, and the storefront error-code table. Everything else assumes you know it.

## Module guide

| Doc | Endpoints | Auth |
|---|---|---|
| [01-products.md](./01-products.md) | Product listing and detail (2) | Public |
| [02-categories.md](./02-categories.md) | Category tree and detail (2) | Public |
| [03-reviews.md](./03-reviews.md) | Product review listing and own-review CRUD (4) | Public / Auth |
| [04-wishlist.md](./04-wishlist.md) | Wishlist list, add, and remove (3) | Auth |
| [05-cart.md](./05-cart.md) | Guest/user cart reads and mutations (5) | Optional |
| [06-coupons.md](./06-coupons.md) | Coupon preview (1) | Optional |
| [07-shipping.md](./07-shipping.md) | Shipping-fee estimate (1) | Public |
| [08-addresses.md](./08-addresses.md) | Saved-address CRUD and defaults (6) | Auth |
| [09-checkout.md](./09-checkout.md) | Registered and guest checkout (2) | Auth / Optional |
| [10-orders.md](./10-orders.md) | Order list/detail, guest lookup, claim, and cancel (5) | Public / Auth |
| [11-profile.md](./11-profile.md) | Current-user profile read/update (2) | Auth |

`Auth` means a valid Clerk Bearer token is required. `Optional` means a request may be anonymous or authenticated; see [authentication and cart identity](./00-conventions.md#authentication--three-modes).

### Mobile cart note

React Native clients do not rely on browser cookies. Persist the `sessionToken` returned by the first anonymous `POST /cart/items` in secure storage, then send it as `X-Cart-Session` on later cart-aware calls. See [guest cart identity](./00-conventions.md#guest-cart-identity--web--mobile).

## What is NOT available yet

Do **not** build integration against these; they return 404 or are explicitly rejected today:

- **Card payments / Geidea (Phase 7):** checkout rejects `paymentMethod: "CARD"` with `422 PAYMENT_METHOD_UNAVAILABLE`. `POST /orders/:id/payment-session` does not exist yet. Use `"CASH"` only until Phase 7 ships.
- **User-facing notifications (Phase 9):** no storefront notification list/read endpoints exist yet. Order confirmation and status communication currently use transactional email.

