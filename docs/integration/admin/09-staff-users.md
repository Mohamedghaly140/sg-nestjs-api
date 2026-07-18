# 09 — Staff Users

> Role: **ADMIN only** (all endpoints — a MANAGER gets `403 FORBIDDEN`). Hide this whole section from managers.

Full account management across **all roles** (`USER | MANAGER | ADMIN`). Accounts are created and mutated **through Clerk** (the backend orchestrates Clerk + its own DB), so Clerk-side rules (duplicate email, compromised password) surface as validation errors here. User IDs are Clerk IDs.

---

## GET /admin/users

Paginated user table across all roles. · **Role: Admin**

### Query parameters

| Param | Type | Notes |
|---|---|---|
| `page`, `limit` | int | [Pagination](./00-conventions.md#pagination) |
| `search` | string ≤ 100 | Matches name/email |
| `role` | `USER \| MANAGER \| ADMIN` | |
| `active` | boolean | |

### Example success response (200)

```json
{
  "status": "success",
  "message": "Success",
  "data": [
    {
      "id": "user_2mgr456",
      "name": "Omar Farouk",
      "email": "omar@sgcouture.com",
      "phone": "+201000000009",
      "role": "MANAGER",
      "active": true,
      "createdAt": "2026-06-15T09:00:00.000Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "totalItems": 5, "totalPages": 1, "hasNext": false, "hasPrev": false }
}
```

Ordered `createdAt` desc.

---

## POST /admin/users

Create an account (staff or customer) via Clerk. · **Role: Admin**

### Request body

| Field | Type | Required | Validation |
|---|---|---|---|
| `firstName` | string | ✔ | trimmed, non-empty; composed full name ≤ 120 |
| `lastName` | string | ✔ | trimmed, non-empty; composed full name ≤ 120 |
| `email` | string | ✔ | valid email (lowercased) |
| `phone` | string | ✔ | Egyptian format (`+2010…`) |
| `password` | string | ✔ | ≥ 8 chars (Clerk may reject weak/compromised ones) |
| `role` | `Role` | ✔ | `USER \| MANAGER \| ADMIN` |

```json
{
  "firstName": "Omar",
  "lastName": "Farouk",
  "email": "omar@sgcouture.com",
  "phone": "+201000000009",
  "password": "s3cure-Pass!",
  "role": "MANAGER"
}
```

Render separate first-name and last-name inputs. Both are required; do not send the former single `name` field. Multi-token values are passed to Clerk as entered after outer trimming, so the backend never guesses which tokens belong to which component.

**Success (201):** the created user (list shape above). The password is never persisted by this backend or echoed back.

### Endpoint-specific errors

| HTTP | `code` | When |
|---|---|---|
| 422 | `VALIDATION_ERROR` | Local name/field validation failed, or Clerk rejected the account. For Clerk rejections the `message` carries its reason (duplicate email/phone, weak or breached password). Show it to the operator. |

---

## PATCH /admin/users/:id

Update role and activation **together** (both fields required). · **Role: Admin**

### Request body

```json
{ "role": "ADMIN", "active": true }
```

**Success (200):** the updated user.

### Endpoint-specific errors

| HTTP | `code` | When |
|---|---|---|
| 409 | `SELF_MODIFICATION_FORBIDDEN` | Changing your own role, or deactivating yourself |
| 409 | `LAST_ADMIN_REQUIRED` | The change would leave no other active ADMIN |

Notes: since both fields are required, send the current value of whichever one the operator didn't touch. Clerk is updated first (role metadata + ban state), then the DB — audit-logged.

---

## DELETE /admin/users/:id

Delete a user from Clerk and the database. · **Role: Admin** · **Success (204)**

### Endpoint-specific errors

| HTTP | `code` | When |
|---|---|---|
| 409 | `SELF_MODIFICATION_FORBIDDEN` | Deleting your own account |
| 409 | `LAST_ADMIN_REQUIRED` | Target is the last active ADMIN |

Notes: **destructive and irreversible** — the account's addresses, cart, wishlist, and reviews are removed; their orders survive with the customer link cleared. Use a strong confirm dialog (type-to-confirm recommended).

---

## UI guardrails worth building

- Disable role/active/delete controls on the operator's **own row** (the API will 409, but don't let them try).
- When only one active ADMIN exists, disable demote/deactivate/delete on that row and explain why.
