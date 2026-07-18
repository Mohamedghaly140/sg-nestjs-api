# 06 — Coupons

Coupon validation is a **preview** against the current cart. It does not reserve or consume a use; checkout repeats the full validation atomically.

---

## POST /coupons/validate

Validate a code and calculate its prospective discount. · **Auth: Optional** · **Throttle: 10 requests / 60 s per IP**

This route is cart-aware: include the guest cart cookie/header, and include a valid Clerk Bearer token when signed in. An authenticated request carrying an anonymous token may trigger the [cart merge](./00-conventions.md#anonymous--user-cart-merge).

### Request body

| Field | Type | Required | Validation |
|---|---|---|---|
| `code` | string | ✔ | trimmed, uppercased, then `^[A-Z0-9_-]{3,30}$` |
| `email` | email | — | trimmed/lowercased; use for a guest's per-user limit check |

Registered user:

```json
{ "code": "save20" }
```

Guest:

```json
{ "code": "SAVE20", "email": "customer@example.com" }
```

### Example success response — `data` (200)

```json
{
  "valid": true,
  "code": "SAVE20",
  "discountPercent": "20.00",
  "discountApplied": "221.00",
  "itemsSubtotal": "1105.00"
}
```

- `itemsSubtotal` is the cart total **after product discounts** and before the coupon.
- Coupons never discount shipping.
- If there is no cart, an otherwise eligible coupon still returns `valid: true` with `itemsSubtotal: "0.00"` and `discountApplied: "0.00"`.
- If neither an authenticated user nor `email` is available, the per-user limit check is skipped for this preview. Guest checkout always revalidates using `contact.email`.

Do not treat the preview as a guarantee. Stock, expiry, global use, and per-user use can change before checkout commits.

### Endpoint-specific errors

| HTTP | `code` | When |
|---|---|---|
| 404 | `RESOURCE_NOT_FOUND` | Coupon code is unknown |
| 422 | `COUPON_INACTIVE` | Coupon was deactivated |
| 422 | `COUPON_EXPIRED` | Expiry is at or before the current time |
| 409 | `COUPON_EXHAUSTED` | Global `maxUsage` cap was reached |
| 409 | `COUPON_USER_LIMIT` | Current user or supplied guest email reached `perUserLimit` |

Map these codes to distinct copy (invalid, expired, deactivated, exhausted, already used). Never branch on `message`.

