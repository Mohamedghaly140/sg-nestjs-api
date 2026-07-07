# Products API

Covers the admin features `features/admin/products/`, `features/admin/product-form/`, and `features/admin/product-detail/`.

All endpoints require role **MANAGER or ADMIN**. Conventions (envelope, pagination, decimals-as-strings, error codes): see [00-conventions.md](./00-conventions.md).

---

## GET /api/admin/products

Paginated product list with filters.

**Maps from:** `features/admin/products/services/get-products.ts → getProducts()`; params from `hooks/use-products-params.ts → productsParserSchema`.

### Query parameters

| Param | Type | Default | Notes |
| --- | --- | --- | --- |
| `page` | int | 1 | |
| `limit` | int | 10 | see PAGE_SIZE_OPTIONS |
| `search` | string | — | case-insensitive `contains` on `name` OR `slug` |
| `status` | `ProductStatus` | — | `DRAFT \| ACTIVE \| ARCHIVED` |
| `categoryId` | string | — | exact match |
| `featured` | boolean | — | `true` / `false`; absent = no filter |

### Response `data`

```jsonc
{
  "items": [
    {
      "id": "cku…",
      "name": "Silk Dress",
      "slug": "silk-dress",
      "price": "1299.00",              // string (Decimal)
      "priceAfterDiscount": "1169.10", // string (Decimal)
      "discount": "10.00",             // string (Decimal, percent)
      "quantity": 42,
      "sold": 7,
      "imageUrl": "https://res.cloudinary.com/…",
      "status": "ACTIVE",
      "featured": true,
      "createdAt": "2026-06-01T10:00:00.000Z",
      "category": { "id": "cat…", "name": "Dresses" }
    }
  ],
  "total": 128,
  "page": 1,
  "pageCount": 13
}
```

Ordered by `createdAt` desc.

---

## GET /api/admin/products/filter-options

Category options for the list-page filter dropdown.

**Maps from:** `features/admin/products/services/get-product-filter-options.ts → getProductFilterOptions()`.

### Response `data`

```jsonc
{ "categories": [ { "id": "cat…", "name": "Dresses" } ] }  // ordered by name asc
```

---

## GET /api/admin/products/form-data

Categories + subcategories needed to render the create/edit product form.

**Maps from:** `features/admin/product-form/services/get-product-form-data.ts → getProductFormData()`.

### Response `data`

```jsonc
{
  "categories":    [ { "id": "cat…", "name": "Dresses" } ],                       // name asc
  "subCategories": [ { "id": "sub…", "name": "Evening", "categoryId": "cat…" } ]  // name asc
}
```

---

## GET /api/admin/products/:id

Full product detail (admin product-detail page).

**Maps from:** `features/admin/product-detail/services/get-product-detail.ts → getProductDetail(id)`.

### Response `data` (`ProductDetail`)

```jsonc
{
  "id": "cku…",
  "name": "Silk Dress",
  "slug": "silk-dress",
  "description": "…",
  "price": "1299.00",
  "discount": "10.00",
  "priceAfterDiscount": "1169.10",
  "quantity": 42,
  "sold": 7,
  "sizes": ["S", "M", "L"],
  "colors": ["black", "ivory"],
  "imageUrl": "https://…",
  "status": "ACTIVE",
  "featured": true,
  "ratingsAverage": "4.5",     // string (Decimal) or null
  "ratingsQuantity": 12,
  "createdAt": "…",
  "updatedAt": "…",
  "category": { "id": "cat…", "name": "Dresses", "slug": "dresses" },
  "subCategories": [ { "id": "sub…", "name": "Evening" } ],
  "images": [ { "id": "img…", "imageUrl": "https://…" } ]   // sortOrder asc, rows without imageUrl omitted
}
```

**Errors:** 404 `NOT_FOUND` if the product doesn't exist.

---

## GET /api/admin/products/:id/form

Product in the shape the edit form consumes (includes `imageId`s and `subCategoryIds`).

**Maps from:** `features/admin/product-form/services/get-product-by-id.ts → getProductById(id)`.

### Response `data` (`ProductForForm`)

```jsonc
{
  "id": "cku…",
  "name": "Silk Dress",
  "slug": "silk-dress",
  "description": "…",
  "price": "1299.00",
  "discount": "10.00",
  "priceAfterDiscount": "1169.10",
  "quantity": 42,
  "sizes": ["S", "M"],
  "colors": ["black"],
  "imageId": "products/abc123",       // Cloudinary public ID of main image
  "imageUrl": "https://…",
  "status": "ACTIVE",
  "featured": true,
  "categoryId": "cat…",
  "images": [                          // sortOrder asc; rows missing imageId or imageUrl omitted
    { "id": "img…", "imageId": "products/def456", "imageUrl": "https://…", "sortOrder": 0 }
  ],
  "subCategoryIds": ["sub…"]
}
```

**Errors:** 404 `NOT_FOUND`.

---

## POST /api/admin/products

Create a product.

**Maps from:** `features/admin/products/actions/createProduct.ts → createProductAction` (validation: `productFormSchema` in `features/admin/product-form/schemas/product-schema.ts`).

### Request body

| Field | Type | Validation |
| --- | --- | --- |
| `name` | string | trimmed, min 2 chars |
| `description` | string | trimmed, min 10 chars |
| `price` | string | required, `/^\d+(\.\d{1,2})?$/` (positive, ≤ 2 decimals) |
| `discount` | string | optional; `""`/absent → `"0"`; same decimal regex; percent |
| `quantity` | string | required, `/^\d+$/`, integer ≥ 0 |
| `sizes` | string[] | default `[]`; each entry non-empty trimmed |
| `colors` | string[] | default `[]`; each entry non-empty trimmed |
| `imageId` | string | required non-empty (main image Cloudinary public ID) |
| `imageUrl` | string | required, valid URL |
| `images` | array | default `[]`; each `{ imageId: non-empty string, imageUrl: valid URL, sortOrder: int ≥ 0 (default 0) }` |
| `status` | `ProductStatus` | default `DRAFT` |
| `featured` | boolean | default `false` |
| `categoryId` | string | required non-empty |
| `subCategoryIds` | string[] | default `[]` |

> Note: `price`, `discount`, `quantity` are **strings** on the wire (form-originated), validated by regex as above — keep this to avoid float precision issues.

### Business rules

- Slug: generated from `name` (`makeSlug`), de-duplicated (`allocateUniqueSlug`) — never client-supplied.
- `priceAfterDiscount = (price − price × discount / 100)` rounded to 2 decimal places — computed server-side (`computePriceAfterDiscount`).
- Product + gallery images + subcategory joins created atomically (single transaction).
- Gallery image `sortOrder` falls back to array index when not finite.

### Response

`201` — `data: { "id": "<new product id>" }`

**Errors:** 400 `INVALID_INPUT` (+ `fieldErrors`); 409 `CONFLICT` "A product with this slug already exists" (unique violation).

---

## PUT /api/admin/products/:id

Full update of a product (same body as create).

**Maps from:** `features/admin/products/actions/updateProduct.ts → updateProductAction`.

### Request body

Identical to `POST /api/admin/products`.

### Business rules

- Slug regenerated from `name`, uniqueness checked **excluding this product**.
- **Gallery diffing** by Cloudinary `imageId`:
  - existing gallery rows whose `imageId` is not in the submitted `images` → deleted;
  - submitted images matching an existing row's `imageId` → row updated (`imageUrl`, `sortOrder`);
  - new `imageId`s → rows created.
- Subcategory joins are **reset**: delete all, then recreate from `subCategoryIds`.
- All DB writes in one transaction; recompute `priceAfterDiscount` server-side.
- **Cloudinary cleanup (after commit, best-effort):** destroy removed gallery `imageId`s and the old main `imageId` if it changed.

### Response

`200` — `data: { "id": "<product id>" }`

**Errors:** 400 `INVALID_INPUT`; 404 `NOT_FOUND`; 409 `CONFLICT` (duplicate slug).

---

## DELETE /api/admin/products/:id

Delete a product — or archive it when it is referenced.

**Maps from:** `features/admin/products/actions/deleteProduct.ts → deleteProductAction`.

### Business rules

- If the product has any `orderItems` or `cartItems` (checked up-front, and also on FK-restriction failure as a fallback): **do not delete** — set `status = ARCHIVED`, `featured = false`, and report that in the response.
- Otherwise hard-delete, then destroy the main image + all gallery `imageId`s in Cloudinary (best-effort).

### Response

`200` — `data`:

```jsonc
{ "deleted": true,  "archived": false }                       // hard-deleted
{ "deleted": false, "archived": true,
  "message": "Product is referenced by orders or carts, so it was archived instead" }
```

**Errors:** 404 `NOT_FOUND`.

---

## DELETE /api/admin/products/:id/images/:productImageId

Remove one gallery image.

**Maps from:** `features/admin/products/actions/deleteProductImage.ts → deleteProductImageAction`.

### Business rules

- `productImageId` is the **ProductImage row id** (not the Cloudinary public ID).
- Delete the row, then destroy its Cloudinary asset by `imageId` (best-effort).

### Response

`200` — `data: { "id": "<productImageId>" }`

**Errors:** 404 `NOT_FOUND` (image row doesn't exist).

---

## POST /api/admin/products/:id/duplicate

Duplicate a product as a draft.

**Maps from:** `features/admin/products/actions/duplicateProduct.ts → duplicateProductAction`.

### Business rules

- Copies `description`, `price`, `discount`, `priceAfterDiscount`, `quantity`, `sizes`, `colors`, `categoryId`, and subcategory joins from the source.
- New name = `"<source name> (copy)"`; slug from `"<source name>-copy"`, de-duplicated.
- Forces `status = DRAFT`, `featured = false`, and **blank images** (`imageId = ""`, `imageUrl = ""`, no gallery rows).
- Runs in a transaction.

### Response

`201` — `data: { "id": "<new product id>" }`

**Errors:** 404 `NOT_FOUND` (source missing).

---

## PATCH /api/admin/products/:id/featured

Toggle the featured flag.

**Maps from:** `features/admin/products/actions/toggleFeatured.ts → toggleFeaturedAction`.

### Request body

```jsonc
{ "featured": true }   // boolean, required
```

### Response

`200` — `data: { "id": "<product id>", "featured": true }`

**Errors:** 400 `INVALID_INPUT`; 404 `NOT_FOUND`.

---

## PATCH /api/admin/products/:id/status

Set the product status.

**Maps from:** `features/admin/products/actions/updateProductStatus.ts → updateProductStatusAction`.

### Request body

```jsonc
{ "status": "ACTIVE" }   // ProductStatus enum, required
```

No transition restrictions — any status can be set directly.

### Response

`200` — `data: { "id": "<product id>", "status": "ACTIVE" }`

**Errors:** 400 `INVALID_INPUT`; 404 `NOT_FOUND`.
