# 08 — Addresses

> Auth: **Auth** for every endpoint. Every lookup is owner-scoped; another user's valid address ID is indistinguishable from a missing ID and returns 404.

Registered checkout requires one of the current user's saved address IDs.

## Address fields

The create DTO is:

| Field | Type | Required | Validation |
|---|---|---|---|
| `alias` | string | ✔ | trimmed, non-empty, ≤ 120 |
| `country` | string | ✔ | trimmed, non-empty, ≤ 120 |
| `governorate` | string | ✔ | trimmed, non-empty, ≤ 120 |
| `city` | string | ✔ | trimmed, non-empty, ≤ 120 |
| `area` | string | ✔ | trimmed, non-empty, ≤ 120 |
| `phone` | string | ✔ | valid Egyptian phone number |
| `addressLine1` | string | ✔ | trimmed, non-empty, ≤ 500 |
| `details` | string | ✔ | trimmed, non-empty, ≤ 1000 |
| `postalCode` | int | — | 1–999999 |
| `latitude` | number | — | -90–90 |
| `longitude` | number | — | -180–180 |
| `isDefault` | boolean | — | default `false`; first address is forced to true |

Address responses add `id` and `createdAt`; optional postal/coordinate fields are returned as `null` when absent.

### Example address — `data`

```json
{
  "id": "ckvaddr123",
  "alias": "Home",
  "country": "Egypt",
  "governorate": "Cairo",
  "city": "Nasr City",
  "area": "District 7",
  "phone": "+201000000002",
  "addressLine1": "12 Mostafa El Nahas Street",
  "details": "Building 4, floor 3, apartment 8",
  "postalCode": 11765,
  "latitude": 30.0444,
  "longitude": 31.2357,
  "isDefault": true,
  "createdAt": "2026-07-18T12:00:00.000Z"
}
```

---

## GET /addresses

Returns the complete address array. Default address comes first; remaining addresses are newest first.

**Success (200):** `data: [address…]`. No addresses returns `[]`; there is no pagination `meta`.

---

## POST /addresses

Create an address using the full field table above.

```json
{
  "alias": "Home",
  "country": "Egypt",
  "governorate": "Cairo",
  "city": "Nasr City",
  "area": "District 7",
  "phone": "+201000000002",
  "addressLine1": "12 Mostafa El Nahas Street",
  "details": "Building 4, floor 3, apartment 8",
  "postalCode": 11765,
  "latitude": 30.0444,
  "longitude": 31.2357,
  "isDefault": true
}
```

**Success (201):** the created address.

- The user's first address becomes default even if `isDefault` is omitted/false.
- Creating with `isDefault: true` unsets the previous default in the same transaction.

---

## GET /addresses/:id

Return one owned address. · **Success (200):** address.

### Endpoint-specific errors

| HTTP | `code` | When |
|---|---|---|
| 404 | `RESOURCE_NOT_FOUND` | Missing address or address belongs to another user |

---

## PATCH /addresses/:id

Partial update. Send any subset of the create fields with the same validation.

```json
{ "alias": "Work", "details": "Reception desk", "isDefault": true }
```

**Success (200):** updated address.

`isDefault: true` transactionally unsets other defaults. `isDefault: false` is accepted as a literal update and can leave the user with no default, so normal clients should use `PATCH /addresses/:id/default` to change the default instead of exposing a free-form default checkbox on edit.

### Endpoint-specific errors

| HTTP | `code` | When |
|---|---|---|
| 404 | `RESOURCE_NOT_FOUND` | Missing address or address belongs to another user |

---

## DELETE /addresses/:id

Delete an owned address. · **Success: 204 No Content**

If it was the default, the most recently created remaining address is promoted automatically. If no addresses remain, there is no default. Existing orders survive deletion because the saved-address relation is cleared without deleting the order.

### Endpoint-specific errors

| HTTP | `code` | When |
|---|---|---|
| 404 | `RESOURCE_NOT_FOUND` | Missing address or address belongs to another user |

---

## PATCH /addresses/:id/default

Make an owned address the sole default. No body. · **Success (200):** updated address with `isDefault: true`.

This operation is safe to repeat on the already-default address.

### Endpoint-specific errors

| HTTP | `code` | When |
|---|---|---|
| 404 | `RESOURCE_NOT_FOUND` | Missing address or address belongs to another user |

