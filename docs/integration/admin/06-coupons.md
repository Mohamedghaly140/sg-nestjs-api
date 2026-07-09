# 06 — Coupons

> Role: **MANAGER+** (all endpoints). `discount` is a **string** percent (`"20.00"`).

---

## GET /admin/coupons

Paginated coupon table with a derived lifecycle filter. · **Role: Manager+**

### Query parameters

| Param | Type | Notes |
|---|---|---|
| `page`, `limit` | int | [Pagination](./00-conventions.md#pagination) |
| `search` | string ≤ 30 | Matches code name |
| `status` | `active \| expired \| exhausted \| deactivated` | Derived lifecycle (below); omit for all |

Lifecycle semantics (also use these to render a status badge client-side):

| `status` | Condition |
|---|---|
| `active` | `isActive` AND not expired AND (`maxUsage = 0` OR `usedCount < maxUsage`) |
| `expired` | `expire <= now` |
| `exhausted` | `maxUsage > 0` AND `usedCount >= maxUsage` |
| `deactivated` | `isActive = false` |

### Example success response (200)

```json
{
  "status": "success",
  "message": "OK",
  "data": [
    {
      "id": "ckvcoup123",
      "name": "SAVE20",
      "discount": "20.00",
      "usedCount": 41,
      "maxUsage": 100,
      "perUserLimit": 1,
      "expire": "2026-08-01T00:00:00.000Z",
      "isActive": true,
      "createdAt": "2026-06-01T10:00:00.000Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "totalItems": 9, "totalPages": 1, "hasNext": false, "hasPrev": false }
}
```

Ordered `createdAt` desc. `usedCount` is server-owned (read-only).

---

## POST /admin/coupons

Create a coupon. · **Role: Manager+**

### Request body

| Field | Type | Required | Validation |
|---|---|---|---|
| `name` | string | ✔ | Normalized to UPPERCASE; must then match `^[A-Z0-9_-]{3,30}$` |
| `discount` | number | ✔ | 1–70 (percent, max 2 decimals) |
| `maxUsage` | int | — | ≥ 0 · **`0` = unlimited** |
| `perUserLimit` | int | — | ≥ 0 · **`0` = unlimited** · default `1` |
| `expire` | ISO date | ✔ | **must be in the future** (on create) |
| `isActive` | boolean | — | default `true` |

```json
{ "name": "save20", "discount": 20, "maxUsage": 100, "perUserLimit": 1, "expire": "2026-08-01T00:00:00.000Z" }
```

**Success (201):** the created coupon (list shape above; note `name` comes back uppercased).

### Endpoint-specific errors

| HTTP | `code` | When |
|---|---|---|
| 409 | `DUPLICATE_RESOURCE` | Code already exists (after uppercase normalization) |

---

## PATCH /admin/coupons/:id

Partial update (any subset of the create fields). · **Role: Manager+**

One deliberate difference from create: **`expire` may be set to a past date** — that immediately expires the coupon.

**Success (200):** updated coupon. · Errors: `409 DUPLICATE_RESOURCE` (renamed to an existing code).

---

## PATCH /admin/coupons/:id/deactivate

Soft-disable (`isActive = false`). No body. · **Role: Manager+**

**Success (200):** `{ "id": "ckvcoup123", "isActive": false }`

There is **no reactivate endpoint by design** — create a new coupon instead. Don't build a re-enable toggle.

---

## DELETE /admin/coupons/:id

Hard-delete an **unused** coupon. · **Role: Manager+** · **Success (204)**

### Endpoint-specific errors

| HTTP | `code` | When |
|---|---|---|
| 409 | `COUPON_IN_USE` | `usedCount > 0` — offer "Deactivate instead" in the UI (order history must be preserved) |
