# 04 — Wishlist

> Auth: **Auth** for every endpoint. Anonymous wishlists are client-side by design.

Wishlist add/remove operations are idempotent, so optimistic UI and safe retries are straightforward.

---

## GET /wishlist

Returns the complete wishlist, newest additions first. The array is not paginated.

### Example success response — `data` (200)

```json
[
  {
    "product": {
      "id": "ckvprod123",
      "name": "Satin Cowl-Neck Dress",
      "slug": "satin-cowl-neck-dress",
      "imageUrl": "https://res.cloudinary.com/.../satin.jpg",
      "price": "2400.00",
      "discount": "15.00",
      "priceAfterDiscount": "2040.00",
      "ratingsAverage": "4.5",
      "ratingsQuantity": 12,
      "featured": true,
      "sizes": ["S", "M"],
      "colors": ["Black"],
      "quantity": 8
    },
    "addedAt": "2026-07-18T12:00:00.000Z",
    "available": true
  }
]
```

`available` is true exactly when the product is currently `ACTIVE`. A `DRAFT` or `ARCHIVED` product remains in the wishlist with `available: false`; render it disabled and do not link it to a public product page. Stock quantity is separate—an ACTIVE product with zero stock still has `available: true`.

---

## PUT /wishlist/:productId

Add a product. No body. The product may be in any status; availability is reported when listing. 

**Success (200):**

```json
{ "added": true }
```

The same 200 response is returned when the product was already present.

### Endpoint-specific errors

| HTTP | `code` | When |
|---|---|---|
| 404 | `RESOURCE_NOT_FOUND` | Product ID does not exist |

---

## DELETE /wishlist/:productId

Remove a product. · **Success: 204 No Content**

This is idempotent: removing a product that is not present still returns 204. It also does not require the product row itself to exist.

