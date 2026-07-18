# 08 — Customers

> Role: **MANAGER+** (all endpoints).

Customer administration covers accounts with **`role = USER` only**. Staff accounts (MANAGER/ADMIN) are invisible here — they live under [Staff Users (§09)](./09-staff-users.md). User IDs are Clerk IDs (`user_…`).

---

## GET /admin/customers

Paginated customer table. · **Role: Manager+**

### Query parameters

| Param | Type | Notes |
|---|---|---|
| `page`, `limit` | int | [Pagination](./00-conventions.md#pagination) |
| `search` | string ≤ 100 | Matches name/email/phone |
| `active` | boolean | |

### Example success response (200)

```json
{
  "status": "success",
  "message": "Success",
  "data": [
    {
      "id": "user_2abc123",
      "name": "Mariam Hassan",
      "email": "mariam@example.com",
      "phone": "+201000000002",
      "active": true,
      "createdAt": "2026-07-06T12:00:00.000Z",
      "ordersCount": 6
    }
  ],
  "meta": { "page": 1, "limit": 20, "totalItems": 812, "totalPages": 41, "hasNext": true, "hasPrev": false }
}
```

Ordered `createdAt` desc.

---

## GET /admin/customers/:id

Customer detail: profile + saved addresses + order history. · **Role: Manager+**

### Example success response — `data` (200)

```json
{
  "id": "user_2abc123",
  "name": "Mariam Hassan",
  "email": "mariam@example.com",
  "phone": "+201000000002",
  "active": true,
  "role": "USER",
  "createdAt": "2026-07-06T12:00:00.000Z",
  "addresses": [
    {
      "id": "ckvaddr123",
      "alias": "Home",
      "country": "Egypt",
      "governorate": "Cairo",
      "city": "Nasr City",
      "area": "District 7",
      "phone": "+201000000002",
      "details": "Building 4, floor 3, apartment 8",
      "postalCode": 11765,
      "latitude": 30.0444,
      "longitude": 31.2357,
      "isDefault": true,
      "createdAt": "2026-07-06T12:05:00.000Z"
    }
  ],
  "orders": [
    {
      "id": "ckvorder123",
      "humanOrderId": "ORD-000042",
      "status": "DELIVERED",
      "paymentMethod": "CASH",
      "totalOrderPrice": "949.00",
      "isPaid": true,
      "createdAt": "2026-07-09T12:00:00.000Z",
      "itemsCount": 2
    }
  ]
}
```

Orders ordered `createdAt` desc — link each to the order detail (§05).

### Endpoint-specific errors

| HTTP | `code` | When |
|---|---|---|
| 404 | `RESOURCE_NOT_FOUND` | Unknown ID — **or the ID belongs to a staff account** (staff are deliberately invisible here) |

---

## PATCH /admin/customers/:id/active

Activate or deactivate (ban) a customer. · **Role: Manager+**

### Request body

```json
{ "active": false }
```

**Success (200):** `{ "id": "user_2abc123", "active": false }`

### Endpoint-specific errors

| HTTP | `code` | When |
|---|---|---|
| 409 | `SELF_MODIFICATION_FORBIDDEN` | Acting on your own account |
| 409 | `FORBIDDEN_TARGET` | Target is not a `USER` (staff account) |

Notes: the backend bans/unbans in Clerk first, then updates the DB — a Clerk failure aborts with no change. A deactivated customer gets `403 ACCOUNT_DISABLED` on every API call (storefront included). Audit-logged.

---

## POST /admin/customers/:id/reset-password

Reset a customer's password and email them a notice. No body. · **Role: Manager+**

**Success (200):** `{ "sent": true }`

### Endpoint-specific errors

| HTTP | `code` | When |
|---|---|---|
| 409 | `FORBIDDEN_TARGET` | Target is not a `USER` — applies to **every** actor, including ADMIN |
| 503 | `SERVICE_UNAVAILABLE` | Mail not configured or delivery failed — **the password was still changed** (Clerk step already ran); tell the operator to retry or contact the customer |

Notes: generates a strong random password, sets it in Clerk with all other sessions signed out, then sends the notice email. The password is never returned to the frontend or stored. Use a confirm dialog — this signs the customer out everywhere.
