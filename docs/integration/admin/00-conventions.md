# 00 — Conventions (read first)

Everything in this guide assumes the conventions on this page.

## Base URL & versioning

All endpoints are prefixed with **`/api/v1`**. Paths in the module docs are written relative to that prefix (e.g. `GET /admin/products` means `GET https://<api-host>/api/v1/admin/products`).

## Authentication — Clerk Bearer token

This backend issues **no tokens of its own**. Authentication is a Clerk session JWT sent on every request:

```
Authorization: Bearer <clerk-session-token>
```

In a Clerk-integrated frontend, get the token from the active session and attach it per request (Clerk tokens are short-lived — fetch a fresh one per request rather than caching):

```ts
// e.g. Next.js (client): const { getToken } = useAuth();
const res = await fetch(`${API_URL}/api/v1/admin/products`, {
  headers: { Authorization: `Bearer ${await getToken()}` },
});
```

No cookies are needed for admin APIs (the only cookie this backend uses is `cart_session` for the storefront guest cart).

### Auth failures

| HTTP | `code` | Meaning | Frontend handling |
|---|---|---|---|
| 401 | `UNAUTHENTICATED` | Missing/invalid/expired token | Re-authenticate via Clerk, retry |
| 403 | `FORBIDDEN` | Valid user, insufficient role | Hide/disable the feature; show "no access" |
| 403 | `ACCOUNT_DISABLED` | The signed-in account was deactivated | Sign out; account is banned |

## Roles

Roles live in the backend DB (source of truth, mirrored to Clerk `publicMetadata.role`): `USER` · `MANAGER` · `ADMIN`.

- **Manager+** endpoints accept `MANAGER` and `ADMIN`.
- **Admin** endpoints accept `ADMIN` only — a `MANAGER` gets `403 FORBIDDEN`. This applies to **staff user management (§09), the dashboard (§01), and all analytics (§02)** by design.

Build the dashboard navigation around this: a MANAGER should not see the Dashboard-home KPIs, Analytics, or Staff Users sections.

## Response envelope

**Every** response is wrapped. Success:

```json
{
  "status": "success",
  "message": "Success",
  "data": { "...payload..." },
  "meta": { "...pagination, only on list endpoints..." }
}
```

DTO/query validation error:

```json
{
  "status": "error",
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "errors": [
    {
      "field": "price",
      "constraints": { "min": "price must not be less than 0.01" }
    }
  ]
}
```

- `code` is a **stable machine code** (table below) — branch on it, never on `message`.
- `errors` is optional. DTO/query validation entries use `{ field, constraints }`; business errors can use their own documented structured context (e.g. stock conflicts).
- `DELETE` endpoints that succeed return **`204 No Content` with an empty body** — don't try to parse JSON.

In the module docs, example responses show **the `data` payload only** unless the envelope or `meta` matters.

## Pagination

All list endpoints accept:

| Query param | Default | Constraints |
|---|---|---|
| `page` | `1` | integer ≥ 1 |
| `limit` | `20` | integer 1–100 |

and return `meta` alongside `data`:

```json
"meta": { "page": 1, "limit": 20, "totalItems": 143, "totalPages": 8, "hasNext": true, "hasPrev": false }
```

## Data formats

- **Money & record decimals are JSON *strings***, but their scale varies by endpoint. Product, coupon, and shipping-zone records can omit trailing zeros (for example, `"2400"` or `"15"`), while order monetary fields use two decimal places (for example, `"949.00"`). Parse them with a decimal-safe approach, format them for display in the client, and don't assume or validate a fixed scale.
  - **Exception:** the Dashboard (§01) and Analytics (§02) endpoints return plain JSON **numbers** — they are chart/KPI inputs, not editable records.
- **Dates** are ISO 8601 UTC strings: `"2026-07-09T12:00:00.000Z"`. Date-only analytics buckets are `"YYYY-MM-DD"`.
- **IDs** are cuid strings (`"ckvprod123…"`) except user IDs, which are Clerk IDs (`"user_2abc…"`).
- **Enums** used across the admin API:
  - `ProductStatus`: `DRAFT | ACTIVE | ARCHIVED`
  - `OrderStatus`: `PENDING | PROCESSING | SHIPPED | DELIVERED | CANCELLED | REFUNDED`
  - `PaymentMethod`: `CASH | CARD` (CARD not orderable until Phase 7)
  - `Role`: `USER | MANAGER | ADMIN`

## Validation behavior

Request bodies are validated strictly:

- Unknown/extra body fields are **rejected** (`422 VALIDATION_ERROR`) — send exactly the documented fields.
- Field-level failures come back in `errors[]` as `{ field, constraints }`. `field` is the property path (nested DTO paths use dotted names such as `contact.email`), and `constraints` maps validator rule names to messages.
- Query params are type-coerced (`?featured=true`, `?page=2` as strings are fine).

## Rate limiting

Global limit: **100 requests / 60 s per IP** across all endpoints. Exceeding it returns `429 RATE_LIMITED`. Normal dashboard usage won't hit this, but avoid unbounded polling loops (e.g. poll dashboard metrics no faster than ~1/min).

## Error codes used by admin endpoints

Always handle the generic ones (first block) globally; the specific ones (second block) are called out per endpoint in the module docs.

| HTTP | `code` | When |
|---|---|---|
| 401 | `UNAUTHENTICATED` | No/invalid Bearer token |
| 403 | `FORBIDDEN` | Insufficient role |
| 403 | `ACCOUNT_DISABLED` | Acting account deactivated |
| 404 | `RESOURCE_NOT_FOUND` | Unknown `:id` on any route |
| 422 | `VALIDATION_ERROR` | DTO validation failed (details in `errors[]`) |
| 429 | `RATE_LIMITED` | Throttle exceeded |
| 500 | `INTERNAL_ERROR` | Unexpected server error |
| 503 | `SERVICE_UNAVAILABLE` | Dependency down (DB, mail) |

| HTTP | `code` | Where |
|---|---|---|
| 409 | `DUPLICATE_RESOURCE` | Create/update collides with a unique value (category name, coupon code, shipping zone, phone) |
| 409 | `FOREIGN_KEY_CONSTRAINT` | Delete blocked because the row is referenced (category with products/sub-categories, sub-category with products) |
| 409 | `INVALID_STATUS_TRANSITION` | Order status change not allowed by the state machine (§05) |
| 409 | `SELF_MODIFICATION_FORBIDDEN` | Admin/manager acting on their **own** account (§08, §09) |
| 409 | `LAST_ADMIN_REQUIRED` | Change would leave no active ADMIN (§09) |
| 409 | `FORBIDDEN_TARGET` | Customer action on a non-`USER` account (§08) |
| 409 | `COUPON_IN_USE` | Deleting a coupon that has redemptions (§06) |
| 422 | `SUBCATEGORY_CATEGORY_MISMATCH` | Product `subCategoryIds` don't belong to `categoryId` (§03) |

## Server-side truths (never send these)

The server computes and owns: `slug`, `priceAfterDiscount`, `sold`, `ratingsAverage`/`ratingsQuantity`, order totals, `usedCount`. Requests that include them are rejected as unknown fields.
