# 01 — Products

> Auth: **Public**. Storefront routes expose **ACTIVE products only**.

Product listing, filters, sorting, and full product detail. Record money and ratings are strings; `quantity` is advisory UX data because stock is reserved only at checkout.

---

## GET /products

Paginated product-card listing. Filters combine with AND; `sizes` and `colors` each match when the product contains **any** supplied value.

### Query parameters

| Param | Type | Default | Validation / behavior |
|---|---|---|---|
| `page` | int | `1` | ≥ 1 |
| `limit` | int | `20` | 1–100 |
| `search` | string | — | trimmed, ≤ 100; case-insensitive name or description match |
| `category` | string | — | category **slug** |
| `subCategory` | string | — | sub-category **slug** |
| `minPrice` | number | — | ≥ 0, max 2 decimals; applies to `priceAfterDiscount` |
| `maxPrice` | number | — | ≥ 0, max 2 decimals; applies to `priceAfterDiscount` |
| `sizes` | CSV string | — | for example `S,M`; whitespace trimmed, empty entries removed |
| `colors` | CSV string | — | for example `Black,Emerald` |
| `featured` | boolean | — | `true` or `false` |
| `sort` | enum | `newest` | `newest \| price_asc \| price_desc \| best_selling \| top_rated` |

Example:

```
GET /api/v1/products?category=dresses&sizes=S,M&colors=Black&minPrice=500&maxPrice=2500&sort=top_rated&page=1&limit=20
```

### Example success response (200)

```json
{
  "status": "success",
  "message": "Success",
  "data": [
    {
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
      "colors": ["Black", "Emerald"],
      "quantity": 8
    }
  ],
  "meta": { "page": 1, "limit": 20, "totalItems": 1, "totalPages": 1, "hasNext": false, "hasPrev": false }
}
```

`ratingsAverage` is `null` when the product has no reviews. `top_rated` places unrated products last. All sorts use newest-first as the tie-breaker.

Treat `quantity` as a low-stock/sold-out display hint, not a reservation. Another checkout may take stock after this response.

---

## GET /products/:slug

Full product detail by slug, including taxonomy and the sorted gallery.

### Example success response — `data` (200)

```json
{
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
  "colors": ["Black", "Emerald"],
  "quantity": 8,
  "description": "Floor-length satin evening dress.",
  "category": { "id": "ckvcat123", "name": "Dresses", "slug": "dresses" },
  "subCategories": [
    { "id": "ckvsub123", "name": "Evening Dresses", "slug": "evening-dresses" }
  ],
  "images": [
    {
      "id": "ckvimage123",
      "imageId": "products/satin/front",
      "imageUrl": "https://res.cloudinary.com/.../front.jpg",
      "sortOrder": 0
    }
  ]
}
```

`subCategories` are ordered by name; `images` are ordered by `sortOrder` ascending. Gallery `imageId`/`imageUrl` may be null, although normal managed catalog data supplies them.

### Endpoint-specific errors

| HTTP | `code` | When |
|---|---|---|
| 404 | `RESOURCE_NOT_FOUND` | Slug is unknown, or the product is `DRAFT`/`ARCHIVED` |

Do not use the 404 to distinguish an unpublished product from a missing one. Remove stale product routes/cards from client caches when this occurs.
