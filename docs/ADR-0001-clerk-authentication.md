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
