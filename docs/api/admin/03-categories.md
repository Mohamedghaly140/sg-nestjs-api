# Categories & Subcategories API

Covers `features/admin/categories/`.

All endpoints require role **MANAGER or ADMIN**. Conventions: see [00-conventions.md](./00-conventions.md).

---

## GET /api/admin/categories

Paginated category list, each with its nested subcategories.

**Maps from:** `features/admin/categories/services/get-categories.ts → getCategories()`; params from `hooks/use-categories-params.ts → categoriesParserSchema`.

### Query parameters

| Param | Type | Default | Notes |
| --- | --- | --- | --- |
| `page` | int | 1 | |
| `limit` | int | 10 | |
| `search` | string | — | case-insensitive `contains` on `name` OR `slug` |

### Response `data`

```jsonc
{
  "items": [
    {
      "id": "cat…",
      "name": "Dresses",
      "slug": "dresses",
      "imageId": "categories/abc123",   // string or null
      "imageUrl": "https://…",          // string or null
      "createdAt": "2026-05-01T09:00:00.000Z",
      "subCategories": [                 // ordered by name asc
        { "id": "sub…", "name": "Evening", "slug": "evening" }
      ]
    }
  ],
  "total": 8,
  "page": 1,
  "pageCount": 1
}
```

Categories ordered by `createdAt` desc.

---

## POST /api/admin/categories

Create a category.

**Maps from:** `features/admin/categories/actions/createCategory.ts → createCategoryAction`.

### Request body

| Field | Type | Validation |
| --- | --- | --- |
| `name` | string | trimmed, min 2 chars |
| `imageId` | string \| null | optional; empty string → null |
| `imageUrl` | string \| null | optional; empty string → null |

### Business rules

- Slug generated from `name` and de-duplicated server-side.
- `name` and `slug` are unique. On unique violation, the error message distinguishes the field: name → `A category named "<name>" already exists`; slug → `This slug is already taken`.

### Response

`201` — `data: { "id": "<new category id>" }`

**Errors:** 400 `INVALID_INPUT`; 409 `CONFLICT` (duplicate name/slug, message per above).

---

## PUT /api/admin/categories/:id

Update a category (name and/or image).

**Maps from:** `features/admin/categories/actions/updateCategory.ts → updateCategoryAction`.

### Request body

Same fields as create (`name`, optional `imageId`, `imageUrl`).

### Business rules

- Slug regenerated from `name`, uniqueness checked excluding this category.
- If the stored `imageId` existed and differs from the submitted one, destroy the old Cloudinary asset after the update (best-effort). Note: submitting `imageId: null` clears the image and destroys the old asset.

### Response

`200` — `data: { "id": "<category id>" }`

**Errors:** 400 `INVALID_INPUT`; 404 `NOT_FOUND`; 409 `CONFLICT` "A category with this name or slug already exists".

---

## DELETE /api/admin/categories/:id

Delete a category.

**Maps from:** `features/admin/categories/actions/deleteCategory.ts → deleteCategoryAction`.

### Business rules

- Deletion is blocked by FK restriction while the category has subcategories (and products reference categories with `Restrict` too). On that failure return 422 with message `Remove all subcategories before deleting this category`.
- On success, destroy the category's Cloudinary `imageId` (best-effort).

### Response

`200` — `data: { "deleted": true }`

**Errors:** 404 `NOT_FOUND`; 422 `UNPROCESSABLE` (has subcategories / referenced).

---

## POST /api/admin/categories/:id/subcategories

Create a subcategory under a category. (`:id` = category id.)

**Maps from:** `features/admin/categories/actions/createSubcategory.ts → createSubcategoryAction`.

### Request body

| Field | Type | Validation |
| --- | --- | --- |
| `name` | string | trimmed, min 2 chars |

### Business rules

- Slug generated from `name`, de-duplicated across **all** subcategories (slugs are globally unique, not per category).
- `name` is globally unique too. Unique-violation messages mirror categories: name → `A subcategory named "<name>" already exists`; slug → `This slug is already taken`.

### Response

`201` — `data: { "id": "<new subcategory id>" }`

**Errors:** 400 `INVALID_INPUT`; 404 `NOT_FOUND` (category); 409 `CONFLICT`.

---

## PUT /api/admin/subcategories/:id

Rename a subcategory.

**Maps from:** `features/admin/categories/actions/updateSubcategory.ts → updateSubcategoryAction`.

### Request body

| Field | Type | Validation |
| --- | --- | --- |
| `name` | string | trimmed, min 2 chars |

Slug regenerated, uniqueness checked excluding this subcategory. The parent category cannot be changed.

### Response

`200` — `data: { "id": "<subcategory id>" }`

**Errors:** 400 `INVALID_INPUT`; 404 `NOT_FOUND`; 409 `CONFLICT` "A subcategory with this name or slug already exists".

---

## DELETE /api/admin/subcategories/:id

Delete a subcategory.

**Maps from:** `features/admin/categories/actions/deleteSubcategory.ts → deleteSubcategoryAction`.

No pre-checks — product↔subcategory joins cascade-delete with the subcategory.

### Response

`200` — `data: { "deleted": true }`

**Errors:** 404 `NOT_FOUND`.
