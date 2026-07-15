# Backend Issue — Staff user creation fails with Clerk `last_name` error

**Endpoint:** `POST /admin/users`
**Reported from:** admin dashboard, Staff Users → Create user
**Severity:** blocks user creation
**Status:** Resolved 2026-07-15

---

## Symptom

Creating a staff user returns a `422 VALIDATION_ERROR` and the operator sees a toast:

```
["last_name"] data doesn't match user requirements set for this instance
```

This is a **Clerk** error string (`data doesn't match user requirements set for this instance`), surfaced through the backend as documented in `docs/integration/admin/09-staff-users.md` (the 422 `message` carries Clerk's reason).

---

## Confirmed: not a frontend misalignment

The admin frontend follows the documented contract exactly. It sends a **single `name` field** — no `first_name` / `last_name`:

```json
{
  "name": "Omar Farouk",
  "email": "omar@sgcouture.com",
  "phone": "+201000000009",
  "password": "s3cure-Pass!",
  "role": "MANAGER"
}
```

Matches `POST /admin/users` request body in the contract. The frontend has no control over Clerk instance config or the name-splitting logic — both live in the backend + Clerk dashboard.

---

## Root cause (backend side)

The backend splits the incoming `name` into `first_name` / `last_name` before calling Clerk. The rejection means one of:

1. **Last name is disabled** in the Clerk instance
   (Dashboard → User & Authentication → Personal information → Name → Last name = off),
   but the backend still sends a `last_name` field → Clerk rejects the unknown/disallowed param.

2. **Last name is required** in the Clerk instance, but the operator entered a
   **single-token name** (e.g. `"Omar"`), so the split produced an **empty `last_name`** → Clerk rejects it.

---

## Resolution — 2026-07-15

- Confirmed the Clerk instance requires a last name.
- `POST /admin/users` now requires explicit, trimmed, non-empty `firstName` and `lastName` fields and passes them directly to Clerk without splitting.
- The unchanged DB `name` column stores the composed first + last display value.
- The same brittle split was removed from `PATCH /users/me`; self-profile name changes require both components as an atomic optional pair.
- No Prisma schema change or backfill was required. Existing single-token local names remain valid for reads and phone-only updates; changing such a name requires entering both components.

## Acceptance

- Creating a user with explicit `firstName: "Omar"` and `lastName: "Farouk"` succeeds.
- Multi-token components such as `firstName: "Mary Anne"` pass to Clerk unchanged.
- Omitting `lastName`, sending it empty/whitespace-only, or sending the legacy single `name` field returns `422 VALIDATION_ERROR` before Clerk is called.
- `PATCH /users/me` accepts both name fields or neither; one-sided name updates return 422 and phone-only updates preserve the current name.
- Any remaining Clerk rejection still returns `422 VALIDATION_ERROR` with a human-readable `message`.
