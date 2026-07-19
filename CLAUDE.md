# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This is the **SG Couture backend**: a standalone NestJS + PostgreSQL + Prisma REST API serving the SG Couture e-commerce storefront (web + future React Native mobile app) and admin dashboard.

**Current state (`docs/DEVELOPMENT_PHASES.md`):** Phases 0–6, 8, and 10 are complete. Phase 7 (Geidea payments) and Phase 9 (in-app notifications) are explicitly deferred/skipped per prior user instruction — CARD checkout is gated with a 422 `PAYMENT_METHOD_UNAVAILABLE` response until Phase 7 ships. Phase 11 (Hardening & Launch) is engineering-complete; only the launch-checklist sign-off remains, which needs deployment-time decisions outside this repo (hosting, production Clerk instance, `CORS_ORIGINS`, DB backups). Always re-check the phase doc before starting new work — do not assume this summary stays current.

## Engineering Approach

- Act as a senior NestJS developer. Always apply NestJS-first patterns and architecture decisions (modules, providers, DI, guards, interceptors, pipes, exception filters) — never fall back to generic Node.js/Express-style approaches when a NestJS-idiomatic one exists.
- When stuck, or before implementing against a library/framework you're unsure about, check your available agents — especially **`docs-explorer`** — to pull fresh documentation rather than relying on possibly stale memory.
- Before committing to any architecture decision, schema migration, or refactor touching 3+ files, consult the **`fable-advisor`** subagent and act on its verdict — treat a `Flag` as blocking until resolved (fix the plan, or explain to the user why the flag doesn't apply) before writing code.

## Documentation Map (READ BEFORE CODING)

| Document | Read it when… |
|---|---|
| `docs/PROJECT_OVERVIEW.md` | You need context on purpose, users, and design principles |
| `docs/ARCHITECTURE.md` | You are creating/modifying modules, guards, interceptors, pipes, filters |
| `docs/DATABASE.md` | You touch the Prisma schema or write any query |
| `docs/API_SPECIFICATION.md` | You create or modify any endpoint (follow the template exactly) |
| `docs/FEATURES.md` | You implement business logic (carts, checkout, stock, coupons…) |
| `docs/DEVELOPMENT_PHASES.md` | You start any task — check current phase and status first |
| `docs/CODING_STANDARDS.md` | Always — naming, DTOs, error handling, folder rules |
| `docs/ADR-000*.md` | You make or question a significant architectural decision |
| `docs/CHANGELOG.md` | After completing any task — record what changed |

## Non-Negotiable Rules

1. **Read `docs/DEVELOPMENT_PHASES.md` before writing any code.** Identify the active phase and its acceptance criteria. Never implement a later phase's feature ahead of time unless explicitly asked.
2. **Never contradict this documentation.** If a request conflicts with a documented decision, stop and ask — do not silently diverge.
3. **Never invent business logic.** If behavior is not documented in `docs/FEATURES.md`, ask for clarification. Add confirmed answers to the docs before implementing.
4. **The server is the source of truth for all prices.** Never trust client-submitted amounts — cart totals, discounts, shipping fees, and order totals are always computed server-side from the database.
5. **Authentication is Clerk.** There are NO register/login/password endpoints in this backend. Do not create them. See `docs/ADR-0001-clerk-authentication.md`.
6. **Payments are Geidea (Egypt).** Payment state changes ONLY via the verified Geidea webhook or explicit admin action for CASH orders. Never mark an order paid based on a client redirect/return URL. See `docs/ADR-0002-geidea-payment-gateway.md`.
7. **Stock is reserved atomically.** All stock mutations go through the conditional-decrement transaction pattern in `docs/ADR-0003-stock-reservation-strategy.md`. Never read-then-write stock.
8. **All endpoints return the global response envelope** (`docs/CODING_STANDARDS.md` §Response Envelope) and follow the endpoint template in `docs/API_SPECIFICATION.md`. Every new/changed endpoint is also documented in Swagger — `@ApiTags`/`@ApiOperation`/`@ApiResponse` on the controller, `@ApiProperty` on its DTOs, applied via the **`nestjs-swagger` skill** — in the same task.
9. **Prisma schema changes** require: updating `docs/DATABASE.md`, creating a migration, and adding a `docs/CHANGELOG.md` entry — in the same task.

## After Completing Any Task (mandatory checklist)

- [ ] Update the checklist + phase status in `docs/DEVELOPMENT_PHASES.md`
- [ ] Update `docs/API_SPECIFICATION.md` if any endpoint was added/changed
- [ ] Document any new/changed endpoint in Swagger using the `nestjs-swagger` skill (`@ApiOperation`/`@ApiResponse` on the controller, `@ApiProperty` on DTOs) and verify it renders in the Swagger UI
- [ ] Update `docs/DATABASE.md` if the schema changed
- [ ] Add a `docs/CHANGELOG.md` entry (date, scope, summary)
- [ ] Add a new ADR in `docs/` if a significant architectural decision was made
- [ ] Run lint + tests; the Definition of Done for the phase applies

## Commands

Package manager is **pnpm** (pnpm-lock.yaml / pnpm-workspace.yaml present — do not use npm/yarn).

```bash
pnpm install                # install deps

pnpm start:dev               # run with watch mode (primary dev loop)
pnpm start:debug             # watch mode + --inspect-brk

pnpm build                   # nest build -> dist/
pnpm start:prod              # run dist/main.js (after build)

pnpm lint                    # eslint --fix over src/apps/libs/test
pnpm format                  # prettier --write src/**/*.ts test/**/*.ts

pnpm test                    # jest unit tests (*.spec.ts under src/)
pnpm test:watch              # jest --watch
pnpm test:cov                # jest --coverage
pnpm test:e2e                # jest -c test/jest-e2e.json (test/**/*.e2e-spec.ts)
pnpm test -- error-codes     # run a single unit test file by name pattern
pnpm test -- -t "test name"  # run tests matching a name
pnpm test:load               # autocannon-based checkout concurrency load test (test/load/checkout-load.ts)

pnpm prisma:migrate          # alias for `prisma migrate dev` (uses DIRECT_URL, or DATABASE_URL as fallback)
pnpm prisma:migrate:reset    # reset the dev database and reseed
pnpm prisma:generate         # regenerate client to src/generated/prisma (schema.prisma output path)
pnpm prisma:push             # `prisma db push` — schema prototyping without a migration
pnpm prisma:studio           # launch Prisma Studio
pnpm prisma:validate         # validate schema.prisma
pnpm seed                    # `prisma db seed` -> prisma/seed.ts
```

Jest config lives inline in `package.json` (`rootDir: src`, matches `*.spec.ts`); e2e specs live under `test/` with their own `test/jest-e2e.json` config.

## Architecture

**Modular monolith**: one NestJS app, one PostgreSQL database, feature modules under `src/modules/*` that only communicate through each other's exported services (never reach into another module's Prisma queries/controllers). Cross-module side effects (e.g. "order paid" → notification + email) go through `@nestjs/event-emitter`, not direct service coupling.

Request pipeline (see `docs/ARCHITECTURE.md` §2 for full detail):

```
Middleware (pino logger, raw-body for webhooks)
  → Guards (ThrottlerGuard → ClerkAuthGuard/OptionalAuthGuard → RolesGuard)
  → Pipes (global ValidationPipe → DTO)
  → Controller (routing/I-O only, no Prisma, no business logic)
  → Service (business logic, prisma.$transaction, domain events)
  → PrismaService (single global instance, no repository layer)
  → Interceptors (ResponseEnvelopeInterceptor)
  → Exception filters (PrismaExceptionFilter / AllExceptionsFilter)
```

Key architectural decisions to internalize before touching related code:

- **Two request identities**: `req.user` (Clerk-verified, DB-loaded) and `req.cartIdentity` (`{ userId } | { sessionToken }`, resolved by cart middleware for guest/registered cart parity). See `docs/ARCHITECTURE.md` §6.
- **No repository abstraction over Prisma** — Prisma client (generated to `src/generated/prisma`, gitignored) *is* the data layer; complex queries live as private methods on the owning service. Abstractions are added only when a second real implementation exists (e.g. `PaymentGatewayService` since Bosta is planned).
- **Response envelope is universal**: every success and error response is wrapped (`{ status, message, data, meta }` / `{ status, message, code, errors }`) by `ResponseEnvelopeInterceptor` + the exception filters — controllers just return bare data.
- **Webhooks** (`/webhooks/clerk`, `/webhooks/geidea`) are `@Public()`, signature-verified before any parsing, and idempotent.
- **`User.id` is the Clerk user ID**, not a generated cuid — the `users` table is a Clerk mirror synced via webhook, owning app-level relations and the authoritative `role` (DB is source of truth, mirrored to Clerk `publicMetadata`).
- Full per-module ownership table, folder layout, background jobs (`@nestjs/schedule`), and webhook verification details are in `docs/ARCHITECTURE.md`.

## Database

`prisma/schema.prisma` is the single source of truth for the schema; `docs/DATABASE.md` documents rationale/business rules behind it and must be updated in the same task as any schema change. Conventions: `cuid()` ids (except `User.id`), `Decimal(10,2)` for EGP money, no soft-delete (products use `status = ARCHIVED`, users use `active = false`), `Cascade`/`Restrict`/`SetNull` chosen deliberately per relation (see `docs/DATABASE.md` §1).

## Quick Facts

- **Base path:** `/api/v1` (global prefix + URI versioning)
- **API docs (Swagger UI):** `/api/docs` — generated by `@nestjs/swagger` `SwaggerModule` (wired in `src/main.ts`, Phase 0 task); **disabled when `NODE_ENV=production`**; every endpoint carries Swagger decorators (see `nestjs-swagger` skill)
- **Auth:** Clerk JWT (Bearer) verified by `ClerkAuthGuard`; roles `USER | MANAGER | ADMIN` stored in DB (source of truth) and mirrored to Clerk `publicMetadata`
- **DB:** PostgreSQL via Prisma (`prisma/schema.prisma`, client output `src/generated/prisma`)
- **Images/assets:** Cloudinary (`imageId` = Cloudinary public_id, `imageUrl` = secure URL)
- **Email:** Resend
- **Payments:** Geidea Checkout (hosted payment page, session-based) — CARD; CASH on delivery
- **Notifications:** in-app (DB) now; FCM push planned (see Future Enhancements)
- **Currency:** EGP only, single language for now
