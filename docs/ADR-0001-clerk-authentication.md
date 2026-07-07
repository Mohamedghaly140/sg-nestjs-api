# ADR-0001: Clerk as the Identity Provider (no custom auth)

**Status:** Accepted · **Date:** 2026-07-03 · **Deciders:** Mohamed Ghaly

## Context
The Prisma schema declares `User.id` = Clerk user ID and describes the users table as a Clerk mirror synced by webhooks. The storefront (Next.js, later Expo) already uses Clerk SDKs. The alternative — custom JWT auth in NestJS — would require password storage, refresh-token/session tables, email verification, and reset flows, none of which exist in the schema.

## Decision
Clerk owns identity end-to-end (sign-up, sign-in, sessions, passwords, verification, resets). The backend:
1. Verifies Clerk Bearer JWTs per request (`@clerk/backend`, cached JWKS) via `ClerkAuthGuard`.
2. Mirrors users locally through the Svix-verified `POST /webhooks/clerk` (idempotent), with just-in-time sync on webhook lag.
3. Keeps `role` authoritative in Postgres and mirrors it to Clerk `publicMetadata.role` on change so frontends can gate UI.
4. Implements **zero** register/login/password/refresh endpoints. Administrative password-reset handling is clarified by the 2026-07-06 addendum below.

## Options Considered

**A — Clerk (chosen):** Complexity Low · Cost per-MAU pricing · Security burden externalized · Matches schema and existing frontend. Cons: vendor dependency, webhook-lag edge cases, per-request verification dependency on JWKS.

**B — Custom NestJS JWT auth:** Complexity High · Cost dev-time + ongoing security ownership · Full control. Cons: contradicts schema, duplicates what Clerk already does for the frontends, large attack surface (password storage, token rotation, resets).

## Consequences
- Easier: no credential storage, no auth phase beyond guards + sync; SOC2-grade identity for free.
- Harder: local features needing fields Clerk doesn't collect (unique `phone`) require a profile-completion step; tests must mock Clerk verification.
- Revisit if: Clerk pricing/regional availability becomes a problem — the `users` mirror means migration is possible without data loss.

## Action Items
1. [x] Phase 1 tasks in DEVELOPMENT_PHASES.md
2. [x] Confirm phone-collection strategy — resolved by the sentinel/profile-completion approach in DATABASE.md Assumptions §2.

## Addendum — 2026-07-06: Administrative password resets

Clerk's Backend API has no operation that triggers Clerk's own password-reset email; that flow belongs to Clerk's frontend `SignIn` resource. For the Manager+ `POST /admin/users/:id/reset-password` support action, the backend therefore generates a strong random password in memory, sets it with `users.updateUser(id, { password, signOutOfOtherSessions: true })`, and sends SG Couture's own one-off Resend notice. The target must have role `USER` regardless of whether the actor is a MANAGER or ADMIN. The generated password is never stored by this backend, and a mail failure is returned as an error rather than reporting a false `{ sent: true }`.

## Addendum — 2026-07-07: Admin-driven account management (dashboard-contract merge)

Merging the admin-dashboard API contract (`docs/api/admin/`, from the split-off Next.js MVP) adds ADMIN-only staff management: `POST /admin/users` (Clerk `createUser` with password, name split, derived username, `publicMetadata.role`) and `DELETE /admin/users/:id` (Clerk `deleteUser`, Clerk 404 tolerated). This **does not weaken this ADR's "zero register/login/password/refresh endpoints" decision**: those exclusions target self-serve credential flows; here an authenticated ADMIN provisions accounts through Clerk's Backend API, Clerk still owns the credentials end-to-end, and nothing password-related is ever persisted by this backend.

Two clarifications adopted with the same merge:
- **Write ordering for identity mutations is always Clerk first, then DB.** A Clerk failure aborts the request with no DB change, so a subsequent Clerk webhook can never overwrite a half-applied mutation. Postgres remains the authoritative role source on reads (unchanged from Decision §3).
- **Compensation when the DB write fails after Clerk succeeded** (the request returns 500 either way — the client must treat the mutation as not applied):
  - *Delete:* self-healing — the `user.deleted` webhook deletes the DB row idempotently; no compensation needed.
  - *Create:* best-effort compensating Clerk `deleteUser` of the just-created account (otherwise the `user.created` webhook would materialize a row that never got its intended role/active state).
  - *Role / ban updates:* best-effort compensating revert of Clerk `publicMetadata.role` and ban state to their previous values (the lifecycle webhook cannot fix this drift itself — it deliberately never overwrites authoritative `role`/`active`).
  - If a compensating call also fails, log a `CRITICAL` audit entry with both intended and actual Clerk/DB states for manual reconciliation. No retry queue at MVP; the admin simply retries the action.
- The administrative password reset (2026-07-06 addendum) moved with the customers/users split to `POST /admin/customers/:id/reset-password`; behavior is unchanged.
