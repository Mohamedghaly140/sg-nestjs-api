# Users (Staff Management) API

Covers `features/admin/users/` — management of all `User` accounts and their roles (`USER` / `MANAGER` / `ADMIN`).

**All endpoints require role `ADMIN`** (stricter than the rest of the admin API — maps from `requireAdmin()`). Conventions: see [00-conventions.md](./00-conventions.md).

Clerk is the source of truth for roles and bans; every mutation here updates **Clerk first, then mirrors to the DB** so the Clerk webhook cannot overwrite a DB change after a Clerk failure.

---

## GET /api/admin/users

Paginated user list across all roles.

**Maps from:** `features/admin/users/services/get-users.ts → getUsers()`; params from `hooks/use-users-params.ts → usersParserSchema`.

### Query parameters

| Param | Type | Default | Notes |
| --- | --- | --- | --- |
| `page` | int | 1 | |
| `limit` | int | 10 | |
| `search` | string | — | case-insensitive `contains` on `name` OR `email` |
| `role` | `Role` | — | `USER \| MANAGER \| ADMIN` |
| `active` | boolean | — | `true` / `false` |

### Response `data`

```jsonc
{
  "items": [
    {
      "id": "user_2abc…",
      "name": "Mohamed Ghaly",
      "email": "m@example.com",
      "phone": "+2010…",
      "role": "ADMIN",
      "active": true,
      "createdAt": "2026-01-15T09:00:00.000Z"
    }
  ],
  "total": 12,
  "page": 1,
  "pageCount": 2
}
```

Ordered by `createdAt` desc.

---

## POST /api/admin/users

Create a staff or customer account (Clerk + DB).

**Maps from:** `features/admin/users/actions/createUser.ts → createUserAction`.

### Request body

| Field | Type | Validation |
| --- | --- | --- |
| `name` | string | min 2 chars |
| `email` | string | valid email |
| `phone` | string | min 7 chars |
| `password` | string | min 8 chars |
| `role` | `Role` | `USER \| MANAGER \| ADMIN` |

### Business rules

1. Split `name` on spaces → Clerk `firstName` / `lastName` (lastName omitted for single-word names).
2. Derive `username` from the email local part, replacing characters outside `[a-zA-Z0-9_.-]` with `_`.
3. Clerk `createUser({ emailAddress, phoneNumber, password, firstName, lastName, username, publicMetadata: { role } })`.
4. Upsert the DB `User` row immediately with the Clerk-issued id (`create` with `active: true`; empty `update` — the Clerk webhook may lag or race).

Clerk errors (duplicate email/phone, weak password) surface as 422 `UNPROCESSABLE` with Clerk's message (current code passes `longMessage`/`message` through `fromErrorToActionState`).

### Response

`201` — `data: { "id": "<clerk user id>" }`

**Errors:** 400 `INVALID_INPUT`; 422 `UNPROCESSABLE` (Clerk rejection).

---

## PATCH /api/admin/users/:id

Update a user's role and active state (always both fields).

**Maps from:** `features/admin/users/actions/updateUser.ts → updateUserAction` (guards in `assertUserUpdateAllowed`).

### Request body

| Field | Type | Validation |
| --- | --- | --- |
| `role` | `Role` | required |
| `active` | boolean | required |

### Business rules (all → 422 `UNPROCESSABLE`)

- Target must exist (else 404).
- **Self-protection:** the caller cannot change their own role (`You cannot change your own role`) and cannot deactivate themselves (`You cannot deactivate your own account`).
- **Last-admin protection:** if the update would remove an active ADMIN (role change away from ADMIN or deactivation) and no *other* active ADMIN exists → `At least one active admin account is required`.
- **Order of operations:** Clerk `updateUser(publicMetadata.role)` → Clerk `banUser`/`unbanUser` (by `active`) → DB `user.update({ role, active })`.

### Response

`200` — `data: { "id": "<user id>", "role": "MANAGER", "active": true }`

**Errors:** 400 `INVALID_INPUT`; 404 `NOT_FOUND`; 422 `UNPROCESSABLE` (guards above, Clerk failures).

---

## DELETE /api/admin/users/:id

Delete a user from Clerk and the DB.

**Maps from:** `features/admin/users/actions/deleteUser.ts → deleteUserAction`.

### Business rules

- The caller cannot delete their own account → 422 `UNPROCESSABLE` (`You cannot delete your own account`).
- Clerk `deleteUser` first; a Clerk **404 is tolerated** (user missing in Clerk, e.g. seeded test data) and deletion proceeds to the DB. Any other Clerk error fails the request.
- Then `user.delete` in the DB (cascades to addresses, cart, wishlist, reviews, notifications; orders keep a null `userId` via `SetNull`).

### Response

`200` — `data: { "deleted": true }`

**Errors:** 404 `NOT_FOUND` (DB row missing); 422 `UNPROCESSABLE` (self-delete, Clerk failure).
