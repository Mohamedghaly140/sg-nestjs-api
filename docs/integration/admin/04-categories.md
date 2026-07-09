# 04 — Categories & Sub-Categories

> Role: **MANAGER+** (all endpoints).

Categories can carry an optional Cloudinary image (uploaded via the [signature flow](./10-uploads.md) with `folder: "categories"`). Sub-categories are plain named children of a category. `slug`s are always server-generated.

---

## GET /admin/categories

Paginated category table with nested sub-categories. · **Role: Manager+**

### Query parameters

| Param | Type | Notes |
|---|---|---|
| `page`, `limit` | int | [Pagination](./00-conventions.md#pagination) |
| `search` | string ≤ 100 | Matches name/slug |

### Example success response (200)

```json
{
  "status": "success",
  "message": "OK",
  "data": [
    {
      "id": "ckvcat123",
      "name": "Dresses",
      "slug": "dresses",
      "imageId": "categories/dresses",
      "imageUrl": "https://res.cloudinary.com/.../dresses.jpg",
      "createdAt": "2026-07-01T10:00:00.000Z",
      "subCategories": [
        { "id": "ckvsub123", "name": "Evening Dresses", "slug": "evening-dresses" }
      ]
    }
  ],
  "meta": { "page": 1, "limit": 20, "totalItems": 6, "totalPages": 1, "hasNext": false, "hasPrev": false }
}
```

Ordered `createdAt` desc; `subCategories` name asc. `imageId`/`imageUrl` are nullable.

---

## POST /admin/categories

Create a category. · **Role: Manager+**

### Request body

| Field | Type | Required | Validation |
|---|---|---|---|
| `name` | string | ✔ | ≤ 120, trimmed |
| `imageId` | string | — | Cloudinary public ID |
| `imageUrl` | string | — | Cloudinary secure URL |

```json
{ "name": "Dresses", "imageId": "categories/dresses", "imageUrl": "https://res.cloudinary.com/.../dresses.jpg" }
```

**Success (201):** the created category (shape above, `subCategories: []`).

### Endpoint-specific errors

| HTTP | `code` | When |
|---|---|---|
| 409 | `DUPLICATE_RESOURCE` | Name (or generated slug) already exists |

---

## PATCH /admin/categories/:id

Partial update (any subset of the create fields). · **Role: Manager+**

**Success (200):** updated category. Replacing the image destroys the old Cloudinary asset server-side.

Errors: `409 DUPLICATE_RESOURCE` as above.

---

## DELETE /admin/categories/:id

Delete a category. · **Role: Manager+** · **Success (204)**

### Endpoint-specific errors

| HTTP | `code` | When |
|---|---|---|
| 409 | `FOREIGN_KEY_CONSTRAINT` | Category still has sub-categories or products — surface "move or delete its contents first" |

---

## Sub-categories

### POST /admin/sub-categories

| Field | Type | Required | Validation |
|---|---|---|---|
| `name` | string | ✔ | ≤ 120, trimmed |
| `categoryId` | string | ✔ | must exist |

```json
{ "name": "Evening Dresses", "categoryId": "ckvcat123" }
```

**Success (201):** `{ "id": "ckvsub123", "name": "Evening Dresses", "slug": "evening-dresses" }`

Errors: `409 DUPLICATE_RESOURCE` (name/slug exists).

### PATCH /admin/sub-categories/:id

Partial update (`name` and/or `categoryId`). · **Success (200):** updated sub-category. · Errors: `409 DUPLICATE_RESOURCE`.

### DELETE /admin/sub-categories/:id

**Success (204)** · Errors: `409 FOREIGN_KEY_CONSTRAINT` when products still reference it.

---

## Notes

- There is no dedicated "list sub-categories" endpoint — they always arrive nested in `GET /admin/categories` (and in the product form data, [§03](./03-products.md#get-adminproductsform-data)).
- Deleting either entity is hard-blocked while referenced (409), so no confirmation-with-cascade UI is needed — just explain the block.
