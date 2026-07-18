# 09 — Checkout

Checkout converts the current cart into an order in **one atomic transaction**: the server re-prices every line from the live catalog, resolves the shipping fee, applies the coupon, reserves stock, creates the order, and clears the cart. Client-side totals are display estimates only — the order response is the truth.

> ⛔ **CARD is not orderable yet (Phase 7 — Geidea).** After DTO validation, sending `paymentMethod: "CARD"` returns `422 PAYMENT_METHOD_UNAVAILABLE` before any business checks run (address ownership, cart, shipping, stock, or transaction). If the request body itself is invalid, it returns `422 VALIDATION_ERROR` instead. `POST /orders/:id/payment-session` does not exist. Only offer **CASH** (cash on delivery) until Phase 7 ships.

Both routes are throttled to **5 requests / 60 s per IP** — disable the submit button while a request is in flight instead of letting the customer hammer it.

---

## POST /orders — registered checkout

Create an order from the signed-in user's cart. · **Auth: Auth** · **Throttle: 5 / 60 s**

Because registered checkout loads the cart by user ID only, complete the [anonymous → user cart merge](./00-conventions.md#anonymous--user-cart-merge) first: after sign-in, call `GET /cart` (with the anonymous cookie/header still attached) so any guest cart is folded into the user cart, then check out.

### Request body

| Field | Type | Required | Validation |
|---|---|---|---|
| `shippingAddressId` | string | ✔ | one of the caller's saved address IDs ([§08](./08-addresses.md)) |
| `paymentMethod` | enum | ✔ | `CASH \| CARD` — send `CASH` only for now |
| `couponCode` | string | — | trimmed, uppercased, then `^[A-Z0-9_-]{3,30}$` |
| `notes` | string | — | trimmed, ≤ 1000; fulfillment notes |

```json
{
  "shippingAddressId": "ckvaddr123",
  "paymentMethod": "CASH",
  "couponCode": "SAVE20",
  "notes": "Please call before delivery."
}
```

### Example success response — `data` (201)

```json
{
  "id": "ckvorder123",
  "humanOrderId": "ORD-000042",
  "status": "PENDING",
  "paymentMethod": "CASH",
  "items": [
    {
      "productId": "ckvprod123",
      "name": "Satin Cowl-Neck Dress",
      "imageUrl": "https://res.cloudinary.com/.../satin.jpg",
      "quantity": 2,
      "color": "Black",
      "size": "M",
      "price": "552.50",
      "lineTotal": "1105.00"
    }
  ],
  "itemsSubtotal": "1105.00",
  "discountApplied": "221.00",
  "shippingFees": "65.00",
  "totalOrderPrice": "949.00",
  "isPaid": false,
  "createdAt": "2026-07-18T12:00:00.000Z"
}
```

`totalOrderPrice = itemsSubtotal − discountApplied + shippingFees`. Item `price`/`lineTotal` are permanent snapshots — later product price changes never alter an order. A successful checkout also **clears the cart** and sends a confirmation email.

### Endpoint-specific errors

| HTTP | `code` | When |
|---|---|---|
| 422 | `PAYMENT_METHOD_UNAVAILABLE` | `paymentMethod: "CARD"` (checked first, before the cart) |
| 404 | `RESOURCE_NOT_FOUND` | `shippingAddressId` missing or not owned by the caller; unknown `couponCode` |
| 422 | `CART_EMPTY` | The user cart has no usable lines |
| 422 | `INVALID_VARIANT` | A line's product is no longer ACTIVE or its color/size vanished; `errors[]` lists `{ productId, color, size, code }` per failed line |
| 422 | `SHIPPING_NOT_AVAILABLE` | No active zone covers the address destination |
| 409 | `INSUFFICIENT_STOCK` | Stock reservation failed; `errors[]` lists `{ productId, requested, available }` per failed line |
| 422 | `COUPON_EXPIRED` / `COUPON_INACTIVE` | Coupon no longer redeemable |
| 409 | `COUPON_EXHAUSTED` / `COUPON_USER_LIMIT` | Coupon usage caps hit at commit time |

On `INVALID_VARIANT` or `INSUFFICIENT_STOCK`, re-fetch the cart (`GET /cart` returns current stock/status per line), surface the failed lines using `errors[]`, and let the customer fix or remove them before retrying. Nothing was reserved or charged — the transaction rolled back completely.

---

## POST /orders/guest — guest checkout

Create an order from the **anonymous cart** without an account. · **Auth: Optional (cart identity required)** · **Throttle: 5 / 60 s**

Send the anonymous cart identity exactly as for `/cart`: the `cart_session` cookie (web, credentialed request) or `X-Cart-Session` header (mobile). Without it there is no cart, and the response is `422 CART_EMPTY`.

### Request body

Same as registered checkout **minus** `shippingAddressId`, **plus** two nested objects:

| Field | Type | Required | Validation |
|---|---|---|---|
| `contact.name` | string | ✔ | trimmed, non-empty, ≤ 120 |
| `contact.phone` | string | ✔ | valid Egyptian phone number |
| `contact.email` | email | ✔ | trimmed, lowercased — receives the confirmation + claim link |
| `shipping.country` | string | ✔ | trimmed, non-empty, ≤ 120 |
| `shipping.governorate` | string | ✔ | trimmed, non-empty, ≤ 120 |
| `shipping.city` | string | ✔ | trimmed, non-empty, ≤ 120 |
| `shipping.area` | string | ✔ | trimmed, non-empty, ≤ 120 |
| `shipping.phone` | string | ✔ | valid Egyptian phone number |
| `shipping.addressLine1` | string | ✔ | trimmed, non-empty, ≤ 500 |
| `shipping.details` | string | ✔ | trimmed, non-empty, ≤ 1000 |
| `shipping.postalCode` | int | — | 1–999999 |
| `shipping.latitude` | number | — | −90 – 90 |
| `shipping.longitude` | number | — | −180 – 180 |
| `paymentMethod` | enum | ✔ | `CASH` only for now |
| `couponCode` | string | — | as above; the per-user limit is keyed on `contact.email` |
| `notes` | string | — | trimmed, ≤ 1000 |

```json
{
  "contact": { "name": "Sara Ghaly", "phone": "+201000000001", "email": "sara@example.com" },
  "shipping": {
    "country": "Egypt",
    "governorate": "Cairo",
    "city": "Nasr City",
    "area": "District 7",
    "phone": "+201000000002",
    "addressLine1": "12 Mostafa El Nahas Street",
    "details": "Building 4, floor 3, apartment 8"
  },
  "paymentMethod": "CASH"
}
```

### Success (201)

The order detail shape above plus one marker field:

```json
"claimToken": "sent-by-email"
```

The real claim token is **never returned by the API** — a 64-character token valid for **30 days** is emailed to `contact.email`. It powers guest order tracking and account claiming ([§10](./10-orders.md)). The anonymous cart row is deleted server-side, but the browser keeps its now-stale `cart_session` cookie; this is harmless, because reads treat it as no cart and adding the next item starts a fresh cart. Mobile clients should still drop their stored `sessionToken` after a successful guest checkout.

### Endpoint-specific errors

Same table as registered checkout, except there is no `shippingAddressId` 404; `422 CART_EMPTY` also covers "no anonymous cart identity was sent". `SHIPPING_NOT_AVAILABLE` resolves from `shipping.country/governorate/city` — preview it early with [`GET /shipping/fee`](./07-shipping.md) so customers don't discover it at the last step.
