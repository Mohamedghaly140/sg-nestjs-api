# Admin API — Shared Conventions

This folder specifies the REST API the backend must expose for the **admin dashboard** frontend. Every endpoint replaces an existing Server Action (mutation) or service function (read) that currently runs inside the Next.js app under `features/admin/`. Each feature doc lists, per endpoint, the exact source file it maps from — the backend implementation must reproduce that file's validation, business rules, and response shape.

The spec is tech-agnostic: any stack can implement it as long as the HTTP contract below is honored.

## Base path

All endpoints are prefixed with `/api/admin`. All requests and responses are JSON (`Content-Type: application/json`).

## Authentication & roles

- Auth uses **Clerk-issued Bearer JWTs**: `Authorization: Bearer <token>`. The backend verifies the token and reads the role from `publicMetadata.role` in the session claims (mirrors `lib/require-role.ts`).
- Roles: `USER`, `MANAGER`, `ADMIN`.
- **Default tier — MANAGER or ADMIN**: every admin endpoint requires role `MANAGER` or `ADMIN` unless stated otherwise.
- **ADMIN-only tier**: all `/api/admin/users/*` endpoints (staff management) require role `ADMIN`.
- Missing/invalid token → `401 UNAUTHORIZED`. Valid token but insufficient role → `403 FORBIDDEN`.

## Response envelope

Same envelope as `docs/architecture/06-api-design.md`:

```jsonc
// Success
{ "success": true, "data": { /* endpoint-specific */ } }

// Error
{
  "success": false,
  "error": {
    "code": "INVALID_INPUT",        // machine-readable, see table below
    "message": "Human-readable message",
    "fieldErrors": {                 // optional — present only on validation errors
      "name": ["Name must be at least 2 characters"]
    }
  }
}
```

`fieldErrors` is `Record<string, string[]>` — the flattened Zod field-error map. The frontend maps it 1:1 onto the existing `ActionState.fieldErrors` so form-level error display keeps working unchanged.

## Status codes & error codes

| Outcome | HTTP | `error.code` |
| --- | --- | --- |
| Success (read/update/delete) | 200 | — |
| Created | 201 | — |
| Validation failure (Zod) | 400 | `INVALID_INPUT` (+ `fieldErrors`) |
| Unauthenticated | 401 | `UNAUTHORIZED` |
| Wrong role | 403 | `FORBIDDEN` |
| Resource not found | 404 | `NOT_FOUND` |
| Uniqueness conflict (duplicate slug / name / coupon code) | 409 | `CONFLICT` |
| Business-rule violation (invalid status transition, delete blocked, self-modification, …) | 422 | `UNPROCESSABLE` |
| Unexpected failure | 500 | `INTERNAL_SERVER_ERROR` |

Feature docs call out which rules produce 409 vs 422 per endpoint.

## Pagination

All list endpoints use the same query parameters and response shape (mirrors the nuqs params schemas in `features/admin/*/hooks/`):

- `page` — integer, default `1`
- `limit` — integer, default `10`; allowed values `10, 15, 20, 25, 30, 35, 40, 45, 50` (`PAGE_SIZE_OPTIONS` in `features/admin/shared/utils.ts`)

Response `data`:

```jsonc
{
  "items": [ /* rows */ ],
  "total": 123,          // total matching rows
  "page": 1,
  "pageCount": 13        // max(1, ceil(total / limit))
}
```

`pageCount` is never below 1 (an empty result still reports `pageCount: 1`). All lists are ordered by `createdAt` descending unless a doc states otherwise.

## Search & filters

- `search` params match case-insensitively with `contains` semantics; the fields searched are listed per endpoint.
- Optional filters are omitted (not sent) when unset — an absent param means "no filter". Boolean filters are the literal strings `true` / `false`.

## Data types on the wire

- **Decimals** (`price`, `discount`, `totalOrderPrice`, `ratings`, …): serialized as **strings** with the DB precision, e.g. `"1299.00"`, `"12.5"`. The frontend already types these via `DecimalToString<T, K>` (`types/utils.ts`). Analytics/dashboard aggregate numbers (revenue sums, averages, counts) are plain JSON numbers — each doc marks which.
- **Dates**: ISO 8601 UTC strings, e.g. `"2026-07-07T12:34:56.000Z"`.
- **Enums** (from `prisma/schema.prisma`):
  - `Role`: `USER | MANAGER | ADMIN`
  - `ProductStatus`: `DRAFT | ACTIVE | ARCHIVED`
  - `OrderStatus`: `PENDING | PROCESSING | SHIPPED | DELIVERED | CANCELLED | REFUNDED`
  - `PaymentMethod`: `CASH | CARD`
- IDs are opaque strings (cuid, except `User.id` which is the Clerk user ID, e.g. `user_2abc…`).

## Side effects the backend owns

These currently happen inside Server Actions and move to the backend with the endpoint:

- **Cloudinary cleanup** — deleting/replacing product or category images must destroy the orphaned Cloudinary assets by `imageId` (public ID). Cleanup is best-effort: a Cloudinary failure must not fail the request (log and continue). Uploads themselves stay browser → Cloudinary; the API only ever receives `imageId` + `imageUrl` strings.
- **Clerk sync** — customer/user activation maps to Clerk `banUser`/`unbanUser`; role changes update Clerk `publicMetadata.role`; staff creation/deletion calls Clerk `createUser`/`deleteUser`. Order of operations per endpoint is specified in the customers/users docs (Clerk first, then DB).
- **Slug allocation** — product/category/subcategory slugs are generated server-side from the name (`makeSlug`) and de-duplicated with a numeric suffix (`allocateUniqueSlug` in `lib/slug.ts`). Clients never send slugs.

## Cache invalidation note

The current Server Actions call `revalidatePath(...)` after mutations (e.g. `revalidateProductCaches()` touches `/admin/products`, `/`, `/products`, `/products/[slug]`, `/search`, `/categories/[slug]`). In the split architecture this becomes the **frontend's** concern (refetch / cache invalidation after a successful mutation); the API itself is stateless. The per-endpoint docs do not repeat this.

## Document index

| Doc | Feature area |
| --- | --- |
| [01-dashboard.md](./01-dashboard.md) | Dashboard metrics |
| [02-products.md](./02-products.md) | Products CRUD, images, duplicate, featured/status toggles, form data |
| [03-categories.md](./03-categories.md) | Categories & subcategories |
| [04-orders.md](./04-orders.md) | Orders list/detail, status transitions, paid toggle |
| [05-customers.md](./05-customers.md) | Customers (role `USER`) list/detail, activate/deactivate |
| [06-users.md](./06-users.md) | Staff management (ADMIN-only) |
| [07-coupons.md](./07-coupons.md) | Coupons CRUD & lifecycle |
| [08-analytics.md](./08-analytics.md) | Analytics: sales, products, customers, coupons, geography |
