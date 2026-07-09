# SG Couture — Admin Dashboard API Integration Guide

> **Audience:** frontend developers building the **admin dashboard** (web).
> **Status:** Live contract · Generated from the actual backend code on **2026-07-10**.
> **Base URL:** `https://<api-host>/api/v1`

This folder is the frontend-facing integration guide for every admin API. It describes what to call, what to send, what comes back, and which errors to handle — with real request/response examples.

## Relationship to other docs

| Doc | Role |
|---|---|
| [`../../API_SPECIFICATION.md`](../../API_SPECIFICATION.md) | **Authoritative** backend contract (storefront + admin, backend-maintained). If this guide ever disagrees with it, the spec wins — and please report the drift. |
| Swagger UI at **`/api/docs`** | Interactive, always-current reference generated from code. Raw OpenAPI JSON at `/api/docs-json`. Use it to try requests with a Bearer token. |
| [`../../api/admin/`](../../api/admin/) | ⚠️ **Frozen historical contract** from the old Next.js MVP. Its envelope (`{ success: true }`), pagination, and error codes are **outdated — do not integrate from it.** This folder supersedes it for frontend work. |

## Read this first

**[00-conventions.md](./00-conventions.md)** — authentication (Clerk Bearer token), role tiers, the response envelope, pagination, validation errors, rate limits, and the full error-code table. Everything else assumes you know it.

## Module guide

| Doc | Endpoints | Min. role |
|---|---|---|
| [01-dashboard.md](./01-dashboard.md) | Dashboard home metrics (1) | **ADMIN** |
| [02-analytics.md](./02-analytics.md) | Sales / products / customers / coupons / geography analytics (5) | **ADMIN** |
| [03-products.md](./03-products.md) | Product management: list, forms, CRUD, duplicate, featured/status, gallery (14) | MANAGER+ |
| [04-categories.md](./04-categories.md) | Categories + sub-categories CRUD (7) | MANAGER+ |
| [05-orders.md](./05-orders.md) | Order list/detail, status transitions, mark-paid (4) | MANAGER+ |
| [06-coupons.md](./06-coupons.md) | Coupon list, create, update, deactivate, delete (5) | MANAGER+ |
| [07-shipping-zones.md](./07-shipping-zones.md) | Shipping zones CRUD (4) | MANAGER+ |
| [08-customers.md](./08-customers.md) | Customer accounts: list, detail, activate/deactivate, reset password (4) | MANAGER+ |
| [09-staff-users.md](./09-staff-users.md) | Staff/user account management (4) | **ADMIN** |
| [10-uploads.md](./10-uploads.md) | Cloudinary signed direct-upload (1) | MANAGER+ |
| [11-notifications.md](./11-notifications.md) | ⛔ Broadcast — **not built yet (Phase 9)** | — |

## What is NOT available yet

Do **not** build integration against these — they will 404 today:

- **Card payments / Geidea (Phase 7 — skipped for now):** `POST /admin/orders/:id/verify-payment` does not exist yet. Checkout rejects `paymentMethod: "CARD"` with `422 PAYMENT_METHOD_UNAVAILABLE`, so all orders you see are **CASH**.
- **Notifications (Phase 9 — not started):** `POST /admin/notifications/broadcast` does not exist yet. See [11-notifications.md](./11-notifications.md) for the planned shape.

Both are flagged inline in their module docs and will be activated here when their phase ships.
