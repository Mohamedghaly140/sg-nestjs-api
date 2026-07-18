# 07 — Shipping Zones

> Role: **MANAGER+** (all endpoints). `fee` is a **string** (`"65.00"`, EGP).

A zone is `(country, governorate, city?)` → flat fee. **`city` omitted/null means the fee covers the whole governorate**; a row with a `city` is a more specific override. At checkout the backend picks the most-specific active match.

---

## GET /admin/shipping-zones

Paginated zone table. · **Role: Manager+**

### Query parameters

| Param | Type | Notes |
|---|---|---|
| `page`, `limit` | int | [Pagination](./00-conventions.md#pagination) |
| `search` | string ≤ 100 | Matches country/governorate/city |

### Example success response (200)

```json
{
  "status": "success",
  "message": "Success",
  "data": [
    {
      "id": "ckvzone123",
      "country": "Egypt",
      "governorate": "Cairo",
      "city": null,
      "fee": "65.00",
      "isActive": true,
      "createdAt": "2026-06-01T10:00:00.000Z",
      "updatedAt": "2026-06-01T10:00:00.000Z"
    },
    {
      "id": "ckvzone456",
      "country": "Egypt",
      "governorate": "Cairo",
      "city": "New Cairo",
      "fee": "85.00",
      "isActive": true,
      "createdAt": "2026-06-02T10:00:00.000Z",
      "updatedAt": "2026-06-02T10:00:00.000Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "totalItems": 27, "totalPages": 2, "hasNext": true, "hasPrev": false }
}
```

Render `city: null` as e.g. "All cities (governorate-wide)".

---

## POST /admin/shipping-zones

Create a zone. · **Role: Manager+**

### Request body

| Field | Type | Required | Validation |
|---|---|---|---|
| `country` | string | ✔ | trimmed, non-empty |
| `governorate` | string | ✔ | trimmed, non-empty |
| `city` | string | — | omit for governorate-wide |
| `fee` | number | ✔ | ≥ 0, max 2 decimals |
| `isActive` | boolean | — | default `true` |

```json
{ "country": "Egypt", "governorate": "Giza", "fee": 70 }
```

**Success (201):** the created zone.

### Endpoint-specific errors

| HTTP | `code` | When |
|---|---|---|
| 409 | `DUPLICATE_RESOURCE` | A zone with the same `(country, governorate, city)` already exists |

---

## PATCH /admin/shipping-zones/:id

Partial update (any subset of the create fields — including toggling `isActive`). · **Role: Manager+**

**Success (200):** updated zone. · Errors: `409 DUPLICATE_RESOURCE` (update collides with an existing combination).

---

## DELETE /admin/shipping-zones/:id

Hard delete. · **Role: Manager+** · **Success (204)**

No referential block — past orders keep their fee snapshot. But note: deleting or deactivating the only zone covering an area makes that area **un-checkout-able** (customers there get `SHIPPING_NOT_AVAILABLE`) — prefer `isActive: false` for temporary suspensions.
