# Coupons API

Covers `features/admin/coupons/`.

All endpoints require role **MANAGER or ADMIN**. Conventions: see [00-conventions.md](./00-conventions.md).

Coupon semantics: `discount` is a percentage (Decimal 5,2); `maxUsage = 0` means unlimited; `usedCount` is incremented by checkout.

---

## GET /api/admin/coupons

Paginated coupon list with a lifecycle-status filter.

**Maps from:** `features/admin/coupons/services/get-coupons.ts → getCoupons()`; params from `hooks/use-coupons-params.ts → couponsParserSchema`.

### Query parameters

| Param | Type | Default | Notes |
| --- | --- | --- | --- |
| `page` | int | 1 | |
| `limit` | int | 10 | |
| `search` | string | — | case-insensitive `contains` on `name` |
| `status` | enum | — | `active \| expired \| exhausted \| deactivated` |

### Status filter semantics (must match exactly)

| `status` | Condition |
| --- | --- |
| `active` | `isActive = true` AND `expire > now` AND (`maxUsage = 0` OR `usedCount < maxUsage`) |
| `expired` | `expire <= now` |
| `exhausted` | `maxUsage > 0` AND `usedCount >= maxUsage` |
| `deactivated` | `isActive = false` |
| *(absent)* | no filter |

> `active`/`exhausted` require field-to-field comparison (`usedCount` vs `maxUsage`) — the current implementation uses raw SQL for these branches; any equivalent query is fine.

### Response `data`

```jsonc
{
  "items": [
    {
      "id": "cpn…",
      "name": "SAVE20",
      "discount": "20.00",      // string (Decimal, percent)
      "usedCount": 4,
      "maxUsage": 100,           // 0 = unlimited
      "expire": "2026-12-31T23:59:59.000Z",
      "isActive": true,
      "createdAt": "…"
    }
  ],
  "total": 15,
  "page": 1,
  "pageCount": 2
}
```

Ordered by `createdAt` desc.

---

## POST /api/admin/coupons

Create a coupon.

**Maps from:** `features/admin/coupons/actions/createCoupon.ts → createCouponAction` (`createCouponSchema`).

### Request body

| Field | Type | Validation |
| --- | --- | --- |
| `name` | string | uppercased server-side before validation; 3–20 chars; `/^[A-Z0-9-]+$/` |
| `discount` | number | 1–70 (percent) |
| `expire` | string | required, parseable date, **must be in the future** |
| `maxUsage` | number | integer ≥ 0 (0 = unlimited) |

> In the current form-based code `discount`/`maxUsage` arrive as strings and are coerced with `transform(Number)` — JSON clients should send numbers; the backend may accept numeric strings for compatibility.

### Response

`201` — `data: { "id": "<new coupon id>" }`

**Errors:** 400 `INVALID_INPUT` (+ `fieldErrors`); 409 `CONFLICT` `Coupon code "<NAME>" already exists`.

---

## PUT /api/admin/coupons/:id

Update a coupon.

**Maps from:** `features/admin/coupons/actions/updateCoupon.ts → updateCouponAction` (`updateCouponSchema`).

### Request body

Same fields as create, except `expire` only needs to be a **valid date** (a past date is allowed on update — it effectively expires the coupon).

### Response

`200` — `data: { "id": "<coupon id>" }`

**Errors:** 400 `INVALID_INPUT`; 404 `NOT_FOUND`; 409 `CONFLICT` (duplicate code).

---

## PATCH /api/admin/coupons/:id/deactivate

Soft-disable a coupon (`isActive = false`). There is no reactivate endpoint — reactivation is not part of the current admin surface.

**Maps from:** `features/admin/coupons/actions/deactivateCoupon.ts → deactivateCouponAction`.

### Request body

None.

### Response

`200` — `data: { "id": "<coupon id>", "isActive": false }`

**Errors:** 404 `NOT_FOUND`.

---

## DELETE /api/admin/coupons/:id

Hard-delete an **unused** coupon.

**Maps from:** `features/admin/coupons/actions/deleteCoupon.ts → deleteCouponAction`.

### Business rules

- If `usedCount > 0` → 422 `UNPROCESSABLE` with message `Used coupons cannot be deleted. Deactivate this coupon instead.` (orders reference coupons via `SetNull`, but history must be preserved).

### Response

`200` — `data: { "deleted": true }`

**Errors:** 404 `NOT_FOUND`; 422 `UNPROCESSABLE` (used coupon).
