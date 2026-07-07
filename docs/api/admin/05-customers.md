# Customers API

Covers `features/admin/customers/` (list + activate/deactivate) and `features/admin/customer-detail/`.

"Customers" are `User` rows with `role = USER`. Staff accounts (`MANAGER`/`ADMIN`) are managed by the [Users API](./06-users.md) instead.

All endpoints require role **MANAGER or ADMIN**. Conventions: see [00-conventions.md](./00-conventions.md).

---

## GET /api/admin/customers

Paginated customer list.

**Maps from:** `features/admin/customers/services/get-customers.ts → getCustomers()`; params from `hooks/use-customers-params.ts → customersParserSchema`.

### Query parameters

| Param | Type | Default | Notes |
| --- | --- | --- | --- |
| `page` | int | 1 | |
| `limit` | int | 10 | |
| `search` | string | — | case-insensitive `contains` on `name` OR `email` OR `phone` |
| `active` | boolean | — | `true` / `false`; absent = no filter |

Always implicitly filtered to `role = USER`.

### Response `data`

```jsonc
{
  "items": [
    {
      "id": "user_2abc…",              // Clerk user ID
      "name": "Sara Ahmed",
      "email": "sara@example.com",
      "phone": "+2010…",
      "active": true,
      "createdAt": "2026-03-12T08:00:00.000Z",
      "ordersCount": 5                  // from _count.orders
    }
  ],
  "total": 340,
  "page": 1,
  "pageCount": 34
}
```

Ordered by `createdAt` desc.

---

## GET /api/admin/customers/:id

Customer profile with addresses and full order history.

**Maps from:** `features/admin/customer-detail/services/get-customer.ts → getCustomer(id)`.

### Business rules

- 404 if the user doesn't exist **or is not `role = USER`** (staff accounts are invisible here).

### Response `data` (`CustomerDetail`)

```jsonc
{
  "id": "user_2abc…",
  "name": "Sara Ahmed",
  "email": "sara@example.com",
  "phone": "+2010…",
  "active": true,
  "role": "USER",
  "createdAt": "…",
  "addresses": [                         // full Address rows
    {
      "id": "adr…", "alias": "Home", "country": "Egypt", "governorate": "Cairo",
      "city": "…", "area": "…", "phone": "…", "addressLine1": "…", "details": "…",
      "postalCode": 11765, "latitude": null, "longitude": null,
      "isDefault": true, "userId": "user_2abc…", "createdAt": "…", "updatedAt": "…"
    }
  ],
  "orders": [                            // createdAt desc
    {
      "id": "cko…",
      "humanOrderId": "ORD-000042",
      "status": "DELIVERED",
      "paymentMethod": "CASH",
      "totalOrderPrice": "1348.00",      // string (Decimal) or null
      "isPaid": true,
      "createdAt": "…",
      "itemsCount": 3                    // from _count.items
    }
  ]
}
```

**Errors:** 404 `NOT_FOUND`.

---

## PATCH /api/admin/customers/:id/active

Activate or deactivate (ban) a customer account.

**Maps from:** `features/admin/customers/actions/toggleCustomerActive.ts → toggleCustomerActiveAction`.

### Request body

```jsonc
{ "active": false }   // boolean, required
```

### Business rules

- The caller cannot change **their own** active state → 422 `UNPROCESSABLE` (`You cannot change your own active state`).
- Target must have `role = USER` → otherwise 422 `UNPROCESSABLE` (`Only customer accounts can be activated or deactivated here`).
- **Clerk sync first, then DB:** `active: false` → Clerk `banUser`; `active: true` → Clerk `unbanUser`; then update `user.active`. If the Clerk call fails, the request fails and the DB is not updated.

### Response

`200` — `data: { "id": "<customer id>", "active": false }`

**Errors:** 400 `INVALID_INPUT`; 404 `NOT_FOUND`; 422 `UNPROCESSABLE` (self-change / non-customer target).
