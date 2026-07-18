# 05 — Cart

> Auth: **Optional**. The same endpoints serve guests and signed-in users.

Read [guest cart identity and merge behavior](./00-conventions.md#guest-cart-identity--web--mobile) before integrating. Web clients must send credentialed requests; mobile clients attach `X-Cart-Session` after the first anonymous mutation.

Cart stock checks improve UX but do not reserve inventory. Checkout performs the authoritative atomic reservation.

## Cart response shape

Every successful cart read/mutation except clear returns this shape:

```json
{
  "id": "ckvcart123",
  "items": [
    {
      "id": "ckvcartitem123",
      "product": {
        "id": "ckvprod123",
        "name": "Satin Cowl-Neck Dress",
        "slug": "satin-cowl-neck-dress",
        "imageUrl": "https://res.cloudinary.com/.../satin.jpg",
        "priceAfterDiscount": "2040.00",
        "quantity": 8,
        "status": "ACTIVE"
      },
      "quantity": 2,
      "color": "Black",
      "size": "M",
      "price": "2040.00",
      "lineTotal": "4080.00"
    }
  ],
  "totalCartPrice": "4800.00",
  "totalPriceAfterDiscount": "4080.00",
  "expiresAt": "2026-07-25T12:00:00.000Z"
}
```

- `expiresAt` is an ISO timestamp for anonymous carts and `null` for user carts.
- `product.priceAfterDiscount`, stock, and status are current product values.
- Line `price` is the price snapshot stored when the line was created; checkout re-prices from the live product value and never trusts client totals.
- `totalCartPrice` and `totalPriceAfterDiscount` are recomputed from live product prices on every mutation.
- `color` and `size` are nullable.

---

## GET /cart

Returns the current cart. If the identity has no cart, the backend returns a virtual empty cart rather than creating a database row:

```json
{
  "id": null,
  "items": [],
  "totalCartPrice": "0.00",
  "totalPriceAfterDiscount": "0.00",
  "expiresAt": null
}
```

When both a valid Clerk token and an anonymous token are present, this call triggers the [automatic merge](./00-conventions.md#anonymous--user-cart-merge) and returns the merged user cart.

---

## POST /cart/items

Add a line, or increment the existing line with the same `(productId, color, size)`. Creates a cart lazily when needed.

### Request body

| Field | Type | Required | Validation |
|---|---|---|---|
| `productId` | string | ✔ | non-empty; product must exist and be `ACTIVE` |
| `quantity` | int | ✔ | ≥ 1; existing line quantity + new quantity must not exceed stock |
| `color` | string | — | when supplied, exact member of the product's `colors` array |
| `size` | string | — | when supplied, exact member of the product's `sizes` array |

```json
{ "productId": "ckvprod123", "quantity": 2, "color": "Black", "size": "M" }
```

**Success (201):** the complete updated cart.

On the **first anonymous mutation only**, `data` also contains:

```json
"sessionToken": "550e8400-e29b-41d4-a716-446655440000"
```

The same response sets the web `cart_session` cookie. Mobile must persist this returned token before navigating away.

### Endpoint-specific errors

| HTTP | `code` | When |
|---|---|---|
| 404 | `RESOURCE_NOT_FOUND` | Product does not exist or is not ACTIVE |
| 422 | `INVALID_VARIANT` | Supplied color or size is not in the product's current arrays |
| 409 | `INSUFFICIENT_STOCK` | Resulting line quantity exceeds stock; inspect `errors[]` |

`INSUFFICIENT_STOCK.errors[]` is `[{ productId, requested, available }]`. Show the available value on the matching line instead of parsing the human message.

---

## PATCH /cart/items/:itemId

Replace a cart line's quantity. Use the cart item `id`, not the product ID.

### Request body

| Field | Type | Required | Validation |
|---|---|---|---|
| `quantity` | int | ✔ | ≥ 1 and ≤ current product stock |

```json
{ "quantity": 3 }
```

**Success (200):** the complete updated cart. Anonymous-cart expiry slides forward seven days.

### Endpoint-specific errors

| HTTP | `code` | When |
|---|---|---|
| 404 | `RESOURCE_NOT_FOUND` | Cart/item is missing for this cart, or its product was deleted |
| 409 | `INSUFFICIENT_STOCK` | Replacement quantity exceeds stock; inspect `errors[]` |

Sending zero is `422 VALIDATION_ERROR`; use the delete route.

---

## DELETE /cart/items/:itemId

Remove one line. · **Success (200):** the complete updated cart.

### Endpoint-specific errors

| HTTP | `code` | When |
|---|---|---|
| 404 | `RESOURCE_NOT_FOUND` | Cart or item is missing for the current cart identity |

This route is not idempotent: replaying after a successful removal returns 404.

---

## DELETE /cart

Clear the current cart. · **Success: 204 No Content**

- User cart: deletes all lines and resets totals; the cart row remains.
- Anonymous cart: deletes the cart row and clears the web cookie.
- No current cart: still returns 204.

For mobile, also delete the stored session token after a successful anonymous clear.

