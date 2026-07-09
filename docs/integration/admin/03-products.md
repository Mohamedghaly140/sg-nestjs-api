# 03 — Products

> Role: **MANAGER+** (all endpoints). Money/percent fields are **strings** (`"2400.00"`).

Everything the product management screens need: list + filters, form reference data, CRUD, duplicate, featured/status toggles, and gallery image management.

**Image workflow:** images are uploaded by the dashboard **directly to Cloudinary** using a signature from [`POST /admin/uploads/signature`](./10-uploads.md), then referenced here by `imageId` (Cloudinary public ID) + `imageUrl` (secure URL). See the [workflow section](#image-upload-workflow) at the bottom.

---

## GET /admin/products

Paginated product table, all statuses. · **Role: Manager+**

### Query parameters

| Param | Type | Notes |
|---|---|---|
| `page`, `limit` | int | [Pagination](./00-conventions.md#pagination) |
| `search` | string ≤ 100 | Matches name/slug, case-insensitive |
| `status` | `DRAFT \| ACTIVE \| ARCHIVED` | |
| `categoryId` | string | |
| `featured` | boolean | `true`/`false` |

### Example request

```
GET /api/v1/admin/products?page=1&limit=20&status=ACTIVE&search=satin
```

### Example success response (200)

```json
{
  "status": "success",
  "message": "OK",
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
      "ratingsQuantity": 2,
      "featured": true,
      "sizes": ["S", "M"],
      "colors": ["Black"],
      "quantity": 12,
      "sold": 3,
      "status": "ACTIVE",
      "createdAt": "2026-07-08T12:00:00.000Z",
      "category": { "id": "ckvcat123", "name": "Dresses" }
    }
  ],
  "meta": { "page": 1, "limit": 20, "totalItems": 58, "totalPages": 3, "hasNext": true, "hasPrev": false }
}
```

Ordered `createdAt` desc.

---

## GET /admin/products/filter-options

Category options for the list-page filter dropdown. · **Role: Manager+**

### Example success response — `data` (200)

```json
{ "categories": [ { "id": "ckvcat123", "name": "Dresses" } ] }
```

---

## GET /admin/products/form-data

Reference data for the create/edit form (category + sub-category selects). · **Role: Manager+**

### Example success response — `data` (200)

```json
{
  "categories":    [ { "id": "ckvcat123", "name": "Dresses" } ],
  "subCategories": [ { "id": "ckvsub123", "name": "Evening Dresses", "categoryId": "ckvcat123" } ]
}
```

Filter the sub-category select client-side by the chosen `categoryId`.

---

## GET /admin/products/:id

Full product detail (any status) — for a read-only detail view. · **Role: Manager+**

### Example success response — `data` (200)

```json
{
  "id": "ckvprod123",
  "name": "Satin Cowl-Neck Dress",
  "slug": "satin-cowl-neck-dress",
  "description": "Floor-length satin evening dress.",
  "imageId": "products/satin/cover",
  "imageUrl": "https://res.cloudinary.com/.../satin.jpg",
  "price": "2400.00",
  "discount": "15.00",
  "priceAfterDiscount": "2040.00",
  "ratingsAverage": "4.5",
  "ratingsQuantity": 2,
  "featured": true,
  "sizes": ["S", "M"],
  "colors": ["Black"],
  "quantity": 12,
  "sold": 3,
  "status": "ACTIVE",
  "createdAt": "2026-07-08T12:00:00.000Z",
  "updatedAt": "2026-07-08T12:30:00.000Z",
  "category": { "id": "ckvcat123", "name": "Dresses", "slug": "dresses" },
  "subCategories": [ { "id": "ckvsub123", "name": "Evening Dresses" } ],
  "images": [
    { "id": "ckvimage123", "imageId": "products/satin/front", "imageUrl": "https://res.cloudinary.com/.../front.jpg", "sortOrder": 0 }
  ]
}
```

---

## GET /admin/products/:id/form

The same product in **edit-form shape** — raw `categoryId`/`subCategoryIds` and Cloudinary `imageId`s, ready to hydrate the form. · **Role: Manager+**

### Example success response — `data` (200)

```json
{
  "id": "ckvprod123",
  "name": "Satin Cowl-Neck Dress",
  "slug": "satin-cowl-neck-dress",
  "description": "Floor-length satin evening dress.",
  "price": "2400.00",
  "discount": "15.00",
  "priceAfterDiscount": "2040.00",
  "quantity": 12,
  "sizes": ["S", "M"],
  "colors": ["Black"],
  "imageId": "products/satin/cover",
  "imageUrl": "https://res.cloudinary.com/.../satin.jpg",
  "status": "ACTIVE",
  "featured": true,
  "categoryId": "ckvcat123",
  "subCategoryIds": ["ckvsub123"],
  "images": [
    { "id": "ckvimage123", "imageId": "products/satin/front", "imageUrl": "https://res.cloudinary.com/.../front.jpg", "sortOrder": 0 }
  ]
}
```

---

## POST /admin/products

Create a product. · **Role: Manager+**

### Request body

| Field | Type | Required | Validation |
|---|---|---|---|
| `name` | string | ✔ | ≤ 120, trimmed |
| `description` | string | ✔ | ≤ 5000 |
| `quantity` | int | ✔ | ≥ 0 |
| `price` | number | ✔ | ≥ 0.01, max 2 decimals |
| `discount` | number | — | 0–70 (percent) |
| `sizes` | string[] | ✔ | may be `[]` |
| `colors` | string[] | ✔ | may be `[]` |
| `imageId` | string | ✔ | Cloudinary public ID (cover) |
| `imageUrl` | string | ✔ | Cloudinary secure URL (cover) |
| `status` | `ProductStatus` | — | default `DRAFT` |
| `featured` | boolean | — | default `false` |
| `categoryId` | string | ✔ | must exist |
| `subCategoryIds` | string[] | — | each must belong to `categoryId` |

`slug` and `priceAfterDiscount` are computed server-side — never send them.

### Example request

```json
{
  "name": "Satin Cowl-Neck Dress",
  "description": "Floor-length satin evening dress.",
  "quantity": 12,
  "price": 2400,
  "discount": 15,
  "sizes": ["S", "M"],
  "colors": ["Black"],
  "imageId": "products/abc123",
  "imageUrl": "https://res.cloudinary.com/.../abc123.jpg",
  "status": "DRAFT",
  "categoryId": "ckvcat123",
  "subCategoryIds": ["ckvsub123"]
}
```

**Success (201):** the created product (admin detail shape above).

### Endpoint-specific errors

| HTTP | `code` | When |
|---|---|---|
| 422 | `SUBCATEGORY_CATEGORY_MISMATCH` | A `subCategoryIds` entry belongs to a different category |
| 404 | `RESOURCE_NOT_FOUND` | Unknown `categoryId` |

---

## PATCH /admin/products/:id

Partial update — send any subset of the create fields, plus optionally the **complete desired gallery**. · **Role: Manager+**

### Request body

Any subset of the `POST` fields, plus:

| Field | Type | Notes |
|---|---|---|
| `images` | `[{ imageId, imageUrl, sortOrder? }]` | **The full desired gallery set.** The server diffs by Cloudinary `imageId`: rows missing from the payload are deleted (and their Cloudinary assets destroyed), matching rows are updated, new ones created. |

- Changing `price`/`discount` recomputes `priceAfterDiscount` server-side; existing carts/orders keep their price snapshots.
- Sending `subCategoryIds` **replaces** the whole sub-category set.
- Replacing the cover `imageId` destroys the old Cloudinary asset (server-side, best-effort).

**Success (200):** the updated product.

Same endpoint-specific errors as create.

---

## DELETE /admin/products/:id

Delete — or auto-archive when the product is referenced by any order/cart. · **Role: Manager+**

**Success (200)** — note: not 204; check the flags:

```json
{ "deleted": true,  "archived": false }
```
```json
{ "deleted": false, "archived": true }
```

When referenced, the product is **not** deleted — it becomes `status = ARCHIVED`, `featured = false`. Show the right toast for each case. Hard deletes also destroy all Cloudinary assets. Idempotent — never returns 409.

---

## POST /admin/products/:id/duplicate

Duplicate as a draft. No body. · **Role: Manager+**

**Success (201):** the new product. Name becomes `"<source name> (copy)"`, slug de-duplicated, `status = DRAFT`, `featured = false`, and **images are blank** — the user must upload new ones. Copies description, price, discount, quantity, sizes, colors, category and sub-categories.

---

## PATCH /admin/products/:id/featured

Toggle the featured flag. · **Role: Manager+**

Request: `{ "featured": true }` → **Success (200):** `{ "id": "ckvprod123", "featured": true }`

---

## PATCH /admin/products/:id/status

Set the status directly (no transition restrictions). · **Role: Manager+**

Request: `{ "status": "ACTIVE" }` → **Success (200):** `{ "id": "ckvprod123", "status": "ACTIVE" }`

---

## Gallery image endpoints

### POST /admin/products/:id/images

Add one gallery image. · **Role: Manager+**

Request: `{ "imageId": "products/xyz789", "imageUrl": "https://res.cloudinary.com/.../xyz789.jpg", "sortOrder": 2 }` (`sortOrder` optional, int ≥ 0)

**Success (201):** the created image row `{ id, imageId, imageUrl, sortOrder }`.

### PATCH /admin/products/:id/images/reorder

Reorder the gallery. · **Role: Manager+**

Request: `{ "order": ["ckvimage456", "ckvimage123"] }` — an **exact permutation** of the product's image **row IDs** (every existing ID exactly once, no extras) or `422 VALIDATION_ERROR`.

**Success (200):** the reordered `images[]`.

### DELETE /admin/products/:id/images/:imageId

Remove one gallery image. · **Role: Manager+** · **Success (204)**

⚠️ `:imageId` here is the **image row ID** (`images[].id`, a cuid) — **not** the Cloudinary public ID. The Cloudinary asset is destroyed server-side.

---

## Image upload workflow

The dashboard uploads straight to Cloudinary — image binaries never pass through this API:

1. **Get signed params:** `POST /admin/uploads/signature` with `{ "folder": "products" }` → `{ signature, timestamp, apiKey, cloudName, folder, allowedFormats }` ([details](./10-uploads.md)).
2. **Upload to Cloudinary** (`https://api.cloudinary.com/v1_1/<cloudName>/image/upload`) as `multipart/form-data` with `file`, `api_key`, `timestamp`, `signature`, `folder`, `allowed_formats`. Allowed formats: `jpg,jpeg,png,webp`; keep files ≤ 5 MB (enforced dashboard-side).
3. **Use the response:** Cloudinary returns `public_id` and `secure_url` → send them to this API as `imageId` / `imageUrl` (cover fields or gallery entries).

Cleanup is server-owned: when you replace/remove images through the endpoints above, the backend destroys the old Cloudinary assets. The frontend never deletes from Cloudinary directly. (One edge you own: if a user uploads to Cloudinary but abandons the form without saving, that asset is orphaned — keep uploads close to save time.)
