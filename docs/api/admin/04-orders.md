# Orders API

Covers `features/admin/orders/` (list) and `features/admin/order-detail/` (detail + mutations).

All endpoints require role **MANAGER or ADMIN**. Conventions: see [00-conventions.md](./00-conventions.md).

---

## GET /api/admin/orders

Paginated order list.

**Maps from:** `features/admin/orders/services/get-orders.ts → getOrders()`; params from `hooks/use-orders-params.ts → ordersParserSchema`.

### Query parameters

| Param | Type | Default | Notes |
| --- | --- | --- | --- |
| `page` | int | 1 | |
| `limit` | int | 10 | |
| `search` | string | — | case-insensitive `contains` on `humanOrderId` OR `user.name` OR `anonName` OR `anonEmail` |
| `status` | `OrderStatus` | — | `PENDING \| PROCESSING \| SHIPPED \| DELIVERED \| CANCELLED \| REFUNDED` |

### Response `data`

```jsonc
{
  "items": [
    {
      "id": "cko…",
      "humanOrderId": "ORD-000042",
      "status": "PROCESSING",
      "paymentMethod": "CASH",
      "isPaid": false,
      "totalOrderPrice": "1348.00",           // string (Decimal) or null
      "createdAt": "2026-07-01T14:00:00.000Z",
      "customerName": "Sara Ahmed",           // user.name ?? anonName ?? "Guest"
      "itemsCount": 3
    }
  ],
  "total": 214,
  "page": 1,
  "pageCount": 22
}
```

Ordered by `createdAt` desc.

> The current web service converts `totalOrderPrice` to a JS number; the API standardizes on the decimal-as-string convention — the frontend adapts when switching over.

---

## GET /api/admin/orders/:id

Full order detail: customer, shipping address, line items with product snapshots, coupon.

**Maps from:** `features/admin/order-detail/services/get-order.ts → getOrder(id)`.

### Response `data` (`OrderDetail`)

The full `Order` row plus relations. Decimals as strings; nullable fields explicitly null.

```jsonc
{
  "id": "cko…",
  "humanOrderId": "ORD-000042",
  "status": "PROCESSING",
  "paymentMethod": "CASH",
  "shippingFees": "50.00",
  "totalOrderPrice": "1348.00",        // or null
  "isPaid": false,
  "paidAt": null,                       // ISO date or null
  "isDelivered": false,
  "deliveredAt": null,
  "notes": null,
  "stripePaymentIntentId": null,
  "createdAt": "…",
  "updatedAt": "…",

  // Registered customer (null for guest orders)
  "userId": "user_2abc…",
  "user": { "id": "user_2abc…", "name": "Sara Ahmed", "email": "sara@…", "phone": "+20…" },

  // Registered shipping address (null for guest orders) — full Address row
  "shippingAddressId": "adr…",
  "shippingAddress": {
    "id": "adr…", "alias": "Home", "country": "Egypt", "governorate": "Cairo",
    "city": "Nasr City", "area": "…", "phone": "+20…", "addressLine1": "…",
    "details": "…", "postalCode": 11765, "latitude": null, "longitude": null,
    "isDefault": true, "userId": "user_2abc…", "createdAt": "…", "updatedAt": "…"
  },

  // Coupon (null when none)
  "couponId": "cpn…",
  "coupon": { "name": "SAVE20", "discount": "20.00" },
  "discountApplied": "269.60",          // string or null

  // Anonymous order fields (all null for registered orders)
  "anonName": null, "anonPhone": null, "anonEmail": null,
  "anonCountry": null, "anonGovernorate": null, "anonCity": null, "anonArea": null,
  "anonShippingPhone": null, "anonAddressLine1": null, "anonDetails": null,
  "anonPostalCode": null, "anonLatitude": null, "anonLongitude": null,
  "guestToken": null, "guestTokenExpiresAt": null, "claimedByUserId": null,

  "items": [
    {
      "id": "itm…",
      "quantity": 2,
      "color": "black",                 // or null
      "size": "M",                      // or null
      "price": "649.00",                // snapshot at order time, string or null
      "orderId": "cko…",
      "productId": "cku…",
      "product": { "id": "cku…", "name": "Silk Dress", "imageUrl": "https://…", "slug": "silk-dress" }
    }
  ]
}
```

**Errors:** 404 `NOT_FOUND`.

---

## PATCH /api/admin/orders/:id/status

Transition an order's status (with optional admin notes).

**Maps from:** `features/admin/order-detail/actions/updateOrderStatus.ts → updateOrderStatusAction`.

### Request body

| Field | Type | Validation |
| --- | --- | --- |
| `status` | `OrderStatus` | required |
| `notes` | string | optional; when present, overwrites the order's `notes` |

### Business rules — status state machine

Transitions are validated against the **current** status:

| From | Allowed to |
| --- | --- |
| `PENDING` | `PROCESSING`, `CANCELLED` |
| `PROCESSING` | `SHIPPED`, `CANCELLED` |
| `SHIPPED` | `DELIVERED`, `CANCELLED`, `REFUNDED` |
| `DELIVERED` | `REFUNDED` |
| `CANCELLED` | — (terminal) |
| `REFUNDED` | — (terminal) |

- Same-status request → **no-op success** (`200`, nothing written).
- Invalid transition → 422 `UNPROCESSABLE` with message `Cannot move order from <current> to <requested>`.
- Transition to `DELIVERED` additionally sets `isDelivered = true` and `deliveredAt = now`.

### Response

`200` — `data: { "id": "<order id>", "status": "SHIPPED" }`

**Errors:** 400 `INVALID_INPUT`; 404 `NOT_FOUND`; 422 `UNPROCESSABLE` (invalid transition).

---

## PATCH /api/admin/orders/:id/paid

Toggle the paid flag on a cash order (manual mark-paid on delivery).

**Maps from:** `features/admin/order-detail/actions/togglePaid.ts → togglePaidAction`.

### Request body

None (empty body). The endpoint **flips** the current `isPaid` value.

### Business rules

- Only allowed when `paymentMethod === CASH`. Card orders are paid via the Stripe webhook — attempting this on a `CARD` order → 422 `UNPROCESSABLE` with message `Cannot manually toggle payment for card orders`.
- Marking paid sets `paidAt = now`; marking unpaid clears `paidAt` to null.

### Response

`200` — `data: { "id": "<order id>", "isPaid": true, "paidAt": "2026-07-07T…" }`

**Errors:** 404 `NOT_FOUND`; 422 `UNPROCESSABLE` (card order).
