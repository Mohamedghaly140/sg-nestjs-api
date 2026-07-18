# 03 — Reviews

Public product reviews plus authenticated create/update/delete operations. Ratings are sent as JSON numbers but returned as decimal strings.

---

## GET /products/:id/reviews

Public paginated review list for a product ID, ordered newest first. · **Auth: Public**

### Query parameters

| Param | Default | Constraints |
|---|---|---|
| `page` | `1` | integer ≥ 1 |
| `limit` | `20` | integer 1–100 |

### Example success response (200)

```json
{
  "status": "success",
  "message": "Success",
  "data": [
    {
      "id": "ckvreview123",
      "title": "Beautiful fabric and fit",
      "ratings": "4.5",
      "user": { "id": "user_2abc123", "name": "Mona Ali" },
      "createdAt": "2026-07-18T12:00:00.000Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "totalItems": 1, "totalPages": 1, "hasNext": false, "hasPrev": false }
}
```

An unknown product ID is not validated by this read route; it returns an empty paginated result rather than a 404.

---

## POST /products/:id/reviews

Create the current user's one review for an ACTIVE product. · **Auth: Auth**

### Request body

| Field | Type | Required | Validation |
|---|---|---|---|
| `title` | string | — | trimmed, ≤ 150; defaults to `""` |
| `ratings` | number | ✔ | 1–5 inclusive, max 1 decimal, increments of 0.5 |

```json
{ "title": "Beautiful fabric and fit", "ratings": 4.5 }
```

**Success (201):** the created review in the list shape above. The product's aggregate rating and count are recomputed transactionally.

### Endpoint-specific errors

| HTTP | `code` | When |
|---|---|---|
| 404 | `RESOURCE_NOT_FOUND` | Product is missing, `DRAFT`, or `ARCHIVED` |
| 409 | `REVIEW_EXISTS` | Current user already reviewed this product |

Use the existing review's `id` with `PATCH /reviews/:id`; retrying POST will never create a second review.

---

## PATCH /reviews/:id

Update the current user's own review. · **Auth: Auth (owner)**

### Request body

Send either or both fields with the same validation as create:

```json
{ "title": "Even better after wearing it", "ratings": 5 }
```

**Success (200):** the updated review. The product aggregate is recomputed.

### Endpoint-specific errors

| HTTP | `code` | When |
|---|---|---|
| 403 | `FORBIDDEN` | Review exists but belongs to another user |
| 404 | `RESOURCE_NOT_FOUND` | Review does not exist |

---

## DELETE /reviews/:id

Delete a review. Owners may delete their own; an authenticated `ADMIN` may moderate any review. · **Auth: Auth** · **Success: 204 No Content**

Deleting recomputes the product aggregate; when the last review is removed, `ratingsAverage` becomes `null` and `ratingsQuantity` becomes `0`.

### Endpoint-specific errors

| HTTP | `code` | When |
|---|---|---|
| 403 | `FORBIDDEN` | Caller is neither the owner nor an `ADMIN` |
| 404 | `RESOURCE_NOT_FOUND` | Review does not exist |
