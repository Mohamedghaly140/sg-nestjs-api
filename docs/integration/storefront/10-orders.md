# 10 — Orders

Order history, order detail, guest order tracking, claiming a guest order into an account, and customer self-cancel. Response shapes are shared with [checkout](./09-checkout.md): the **detail** shape (with `items[]`) and the lighter **summary** shape (with `itemsCount`).

## Order lifecycle

`OrderStatus` values as the storefront should present them:

| Status | Meaning for the customer | Self-cancel? |
|---|---|---|
| `PENDING` | Placed, awaiting processing | ✔ (while unpaid) |
| `PROCESSING` | Being prepared | — |
| `SHIPPED` | Handed to delivery | — |
| `DELIVERED` | Received | — |
| `CANCELLED` | Cancelled (by the customer or the store) | — |
| `REFUNDED` | Money returned after payment | — |

Status only moves via admin action (or customer cancel). There is no storefront polling contract — refresh on screen entry rather than polling in a loop.

---

## GET /orders

The signed-in user's order history, newest first. · **Auth: Auth**

### Query parameters

| Param | Type | Notes |
|---|---|---|
| `page`, `limit` | int | [Pagination](./00-conventions.md#pagination) |
| `status` | enum | optional `OrderStatus` filter |

### Example success response (200)

```json
{
  "status": "success",
  "message": "Success",
  "data": [
    {
      "id": "ckvorder123",
      "humanOrderId": "ORD-000042",
      "status": "PENDING",
      "paymentMethod": "CASH",
      "isPaid": false,
      "totalOrderPrice": "949.00",
      "shippingFees": "65.00",
      "discountApplied": "221.00",
      "createdAt": "2026-07-18T12:00:00.000Z",
      "itemsCount": 1
    }
  ],
  "meta": { "page": 1, "limit": 20, "totalItems": 1, "totalPages": 1, "hasNext": false, "hasPrev": false }
}
```

`itemsCount` is the number of distinct order lines, not the sum of their quantities; one line with `quantity: 2` therefore has `itemsCount: 1`. Claimed guest orders appear here like any other order. Display `humanOrderId` to customers; use `id` in URLs and API calls.

---

## GET /orders/:id

One owned order in the full detail shape ([§09 example](./09-checkout.md#example-success-response--data-201)). · **Auth: Auth**

### Endpoint-specific errors

| HTTP | `code` | When |
|---|---|---|
| 404 | `RESOURCE_NOT_FOUND` | Order does not exist **or belongs to someone else** — the two cases are indistinguishable by design |

---

## GET /orders/guest/:token

Track a guest order with the 64-character token from the confirmation email. · **Auth: Public** · **Throttle: 10 / 60 s**

**Success (200):** the full order detail shape. Use this for a "track your order" page opened from the email link — no account needed.

### Endpoint-specific errors

| HTTP | `code` | When |
|---|---|---|
| 404 | `CLAIM_TOKEN_INVALID` | Token is unknown, expired (30 days), or already consumed by a claim |

The API deliberately does not distinguish these cases. Show one message: "This tracking link is invalid or has expired."

---

## POST /orders/claim

Attach a guest order to the signed-in account. · **Auth: Auth** · **Throttle: 5 / 60 s** · **Success: 200**

### Request body

| Field | Type | Required | Validation |
|---|---|---|---|
| `token` | string | ✔ | exactly 64 characters |

```json
{ "token": "3f0e…64-char hex…9a1b" }
```

**Success (200):** the claimed order in the detail shape. The order now belongs to the user and appears in `GET /orders`; the token is consumed and **cannot be used again** — subsequent `GET /orders/guest/:token` or re-claims return 404.

Typical flow: guest checks out → email link opens the storefront with the token → customer signs up / signs in (Clerk) → client calls `POST /orders/claim` with the token.

### Endpoint-specific errors

| HTTP | `code` | When |
|---|---|---|
| 404 | `CLAIM_TOKEN_INVALID` | Token is unknown, expired, or was already claimed (even by this same user) |
| 422 | `VALIDATION_ERROR` | Token is not exactly 64 characters |

Claiming is one-shot but safe to retry on network failure: if the first attempt actually committed, the retry returns 404 `CLAIM_TOKEN_INVALID` — treat that as "already claimed, refresh my orders" when it directly follows a timeout.

---

## POST /orders/:id/cancel

Customer self-cancel. Allowed only while the order is **`PENDING` and unpaid**. · **Auth: Auth (owner)** · **Success: 200** · Global rate limit (no per-route throttle).

**Success (200):** the updated order with `status: "CANCELLED"`. Stock returns to the catalog and any coupon redemption is released.

### Endpoint-specific errors

| HTTP | `code` | When |
|---|---|---|
| 404 | `RESOURCE_NOT_FOUND` | Order does not exist or is not the caller's |
| 409 | `INVALID_STATUS_TRANSITION` | Order already left `PENDING`, or has been paid |

Only render the cancel button when `status === "PENDING" && !isPaid`, and still handle the 409 — an admin may have started processing between render and click. On 409, re-fetch the order and show its current state.
