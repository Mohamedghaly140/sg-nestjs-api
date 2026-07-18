# 02 — Categories

> Auth: **Public**. Both endpoints return an unpaginated category tree.

Category and nested sub-category records include counts of **ACTIVE products only**. Counts are navigation/display hints and may change independently of a cached category tree.

---

## GET /categories

Returns every category ordered by name, with each category's sub-categories also ordered by name.

### Example success response — `data` (200)

```json
[
  {
    "id": "ckvcat123",
    "name": "Dresses",
    "slug": "dresses",
    "imageUrl": "https://res.cloudinary.com/.../dresses.jpg",
    "productCount": 12,
    "subCategories": [
      {
        "id": "ckvsub123",
        "name": "Evening Dresses",
        "slug": "evening-dresses",
        "productCount": 4
      }
    ]
  }
]
```

`imageUrl` is nullable. An empty catalog returns `[]`; there is no pagination `meta`.

---

## GET /categories/:slug

Returns one category in the same shape as a list entry, including its full nested sub-category array.

### Example success response — `data` (200)

```json
{
  "id": "ckvcat123",
  "name": "Dresses",
  "slug": "dresses",
  "imageUrl": "https://res.cloudinary.com/.../dresses.jpg",
  "productCount": 12,
  "subCategories": [
    { "id": "ckvsub123", "name": "Evening Dresses", "slug": "evening-dresses", "productCount": 4 }
  ]
}
```

Use category/sub-category `slug`s with the product-list `category` and `subCategory` filters, not their IDs.

### Endpoint-specific errors

| HTTP | `code` | When |
|---|---|---|
| 404 | `RESOURCE_NOT_FOUND` | Category slug does not exist |

