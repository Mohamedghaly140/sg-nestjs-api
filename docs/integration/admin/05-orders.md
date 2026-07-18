# 05 — Orders

> Role: **MANAGER+** (all endpoints). Money fields are **strings** (`"949.00"`).

Order management: table, detail, status transitions, and marking CASH orders paid.

> **Phase 7 note:** card payments (Geidea) are not built yet — every order today is `paymentMethod: "CASH"`. `POST /admin/orders/:id/verify-payment` is planned for Phase 7 and **does not exist yet** (returns 404). Don't build against it.

---

## GET /admin/orders

Paginated order table, all orders (registered + guest). · **Role: Manager+**

### Query parameters

| Param | Type | Notes |
|---|---|---|
| `page`, `limit` | int | [Pagination](./00-conventions.md#pagination) |
| `status` | `OrderStatus` | `PENDING \| PROCESSING \| SHIPPED \| DELIVERED \| CANCELLED \| REFUNDED` |
| `paymentMethod` | `CASH \| CARD` | |
| `isPaid` | boolean | |
| `search` | string ≤ 100 | Order number, customer name, email, or phone (registered **and** guest fields) |
| `from`, `to` | ISO date | `createdAt` range (inclusive) |

### Example request

```
GET /api/v1/admin/orders?status=PENDING&isPaid=false&search=ORD-0000
```

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
      "createdAt": "2026-07-09T12:00:00.000Z",
      "customerName": "Sara Ghaly",
      "itemsCount": 2
    }
  ],
  "meta": { "page": 1, "limit": 20, "totalItems": 102, "totalPages": 6, "hasNext": true, "hasPrev": false }
}
```

`customerName` = registered user's name, else the guest contact name, else `"Guest"`. Ordered `createdAt` desc.

---

## GET /admin/orders/:id

Full order detail. · **Role: Manager+**

An order is **either** registered (`user` + `shippingAddress` set, `anon*` all null) **or** guest (`user`/`shippingAddress` null, `anon*` contact/shipping snapshot set). Render the customer panel from whichever side is present.

### Example success response — `data` (200) — registered order

```json
{
  "id": "ckvorder123",
  "humanOrderId": "ORD-000042",
  "status": "PROCESSING",
  "paymentMethod": "CASH",
  "items": [
    {
      "productId": "ckvprod123",
      "name": "Black Evening Dress",
      "imageUrl": "https://res.cloudinary.com/.../dress.jpg",
      "quantity": 2,
      "color": "Black",
      "size": "M",
      "price": "552.50",
      "lineTotal": "1105.00",
      "product": { "id": "ckvprod123", "name": "Black Evening Dress", "slug": "black-evening-dress", "imageUrl": "https://res.cloudinary.com/.../dress.jpg" }
    }
  ],
  "itemsSubtotal": "1105.00",
  "discountApplied": "221.00",
  "shippingFees": "65.00",
  "totalOrderPrice": "949.00",
  "isPaid": false,
  "createdAt": "2026-07-09T12:00:00.000Z",
  "user": { "id": "user_2abc123", "name": "Sara Ghaly", "email": "sara@example.com", "phone": "+201000000001" },
  "shippingAddress": { "id": "ckvaddr123", "alias": "Home", "country": "Egypt", "governorate": "Cairo", "city": "Nasr City", "area": "District 7", "phone": "+201000000001", "addressLine1": "12 Mostafa El Nahas St", "details": "Building 4, floor 3", "postalCode": 11765, "latitude": 30.0444, "longitude": 31.2357, "isDefault": true },
  "anonName": null, "anonPhone": null, "anonEmail": null,
  "anonCountry": null, "anonGovernorate": null, "anonCity": null, "anonArea": null,
  "anonShippingPhone": null, "anonAddressLine1": null, "anonDetails": null,
  "anonPostalCode": null, "anonLatitude": null, "anonLongitude": null,
  "coupon": { "name": "SAVE20", "discount": "20.00" },
  "geideaSessionId": null,
  "geideaOrderId": null
}
```

For guest orders the `anon*` fields carry the contact (`anonName`, `anonPhone`, `anonEmail`) and shipping snapshot (`anonCountry` … `anonLongitude`), and `user`/`shippingAddress` are `null`. `coupon` is `null` when none was used. Each line item keeps its **price snapshot** (`price`, `lineTotal`) plus a `product` card for linking to the current product.

---

## PATCH /admin/orders/:id/status

Transition the order through the state machine. · **Role: Manager+**

### Request body

| Field | Type | Required | Validation |
|---|---|---|---|
| `status` | `OrderStatus` | ✔ | must be a legal transition (below) |
| `notes` | string | — | ≤ 1000 — **overwrites** the order's notes when present |

```json
{ "status": "SHIPPED", "notes": "Handed to courier" }
```

**Success (200):** the updated order (summary shape: id, humanOrderId, status, paymentMethod, items, totals, isPaid, createdAt).

### State machine — the only legal transitions

```
PENDING ──► PROCESSING ──► SHIPPED ──► DELIVERED ──► REFUNDED
   │             │
   └────────► CANCELLED ◄┘   (only while unpaid)
```

| From | To | Extra condition | Side effects |
|---|---|---|---|
| `PENDING` | `PROCESSING` | — | — |
| `PENDING` / `PROCESSING` | `CANCELLED` | order must be **unpaid** (paid → refund path) | stock restored, coupon usage released |
| `PROCESSING` | `SHIPPED` | — | — |
| `SHIPPED` | `DELIVERED` | **CASH order must be paid first** (mark-paid below) | `isDelivered`/`deliveredAt` set |
| `DELIVERED` | `REFUNDED` | — | stock restored, `sold` decremented |

Anything else — including re-sending the current status — returns **`409 INVALID_STATUS_TRANSITION`** with an explanatory `message`. Drive the UI from this table: only offer the legal next statuses for the order's current state (and disable "Delivered" on unpaid CASH orders until it's marked paid).

### Endpoint-specific errors

| HTTP | `code` | When |
|---|---|---|
| 409 | `INVALID_STATUS_TRANSITION` | Illegal transition, same-status request, cancelling a paid order, or delivering an unpaid CASH order |

Notes: transitions are transactional and audit-logged; a status-change email is sent to the customer automatically.

---

## PATCH /admin/orders/:id/mark-paid

Mark a CASH order as paid (cash collected on delivery). No body. · **Role: Manager+**

**Success (200):** the order with `isPaid: true` (and `paidAt` set internally).

### Endpoint-specific errors

| HTTP | `code` | When |
|---|---|---|
| 409 | `INVALID_STATUS_TRANSITION` | Order is CARD (webhook-only), already paid, or CANCELLED/REFUNDED |

Notes: **one-way** — there is no un-mark; warn before confirming. Increments product `sold` counters; audit-logged. Required before a CASH order can transition `SHIPPED → DELIVERED`.

---

## ⛔ POST /admin/orders/:id/verify-payment — Not yet available (Phase 7)

Planned support tool (Admin-only): query Geidea for an order's real payment state and reconcile. Planned response: `{ "geideaStatus": "…", "reconciled": boolean }`. **Does not exist yet — do not integrate.**
