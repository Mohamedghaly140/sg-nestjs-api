# AGENTS.md

This file provides repository-wide guidance for Codex and other coding agents working in this project.

This is the **SG Couture backend**: a standalone NestJS + PostgreSQL + Prisma REST API serving the SG Couture e-commerce storefront (web + future React Native mobile app) and admin dashboard.

**Current state:** Phase 0 is in progress. Dependencies, validated configuration, PrismaModule, and the initial migrations are implemented; bootstrap wiring, global pipes/interceptors/filters, HealthModule, and seed data remain.

## Instruction Scope

- This file applies to the entire repository.
- More deeply nested `AGENTS.md` files, if added later, override these instructions for files in their directory tree.
- Direct user instructions take precedence over this file. If a user request conflicts with documented project decisions, explain the conflict and ask for direction before changing code.
- Preserve unrelated user changes in the working tree. Do not revert or overwrite them.

## Documentation Map (Read Before Coding)

| Document | Read it when… |
|---|---|
| `docs/PROJECT_OVERVIEW.md` | You need context on purpose, users, and design principles |
| `docs/ARCHITECTURE.md` | You are creating or modifying modules, guards, interceptors, pipes, or filters |
| `docs/DATABASE.md` | You touch the Prisma schema or write any query |
| `docs/API_SPECIFICATION.md` | You create or modify any endpoint; follow its template exactly |
| `docs/FEATURES.md` | You implement business logic such as carts, checkout, stock, or coupons |
| `docs/DEVELOPMENT_PHASES.md` | You start any implementation task; check the current phase and status first |
| `docs/CODING_STANDARDS.md` | Always; it defines naming, DTOs, error handling, and folder rules |
| `docs/ADR-000*.md` | You make or question a significant architectural decision |
| `docs/CHANGELOG.md` | After completing a task; record what changed |

Read only the documentation relevant to the task, except for the mandatory files identified above.

## Non-Negotiable Rules

1. **Read `docs/DEVELOPMENT_PHASES.md` before writing code.** Identify the active phase and its acceptance criteria. Do not implement a later phase early unless the user explicitly asks.
2. **Do not silently contradict project documentation.** Surface conflicts and request direction.
3. **Do not invent business logic.** If behavior is absent from `docs/FEATURES.md`, ask for clarification. Record the confirmed behavior in the documentation before implementing it.
4. **The server is the source of truth for all prices.** Never trust client-submitted amounts. Compute cart totals, discounts, shipping fees, and order totals server-side from database values.
5. **Authentication is Clerk.** Do not create register, login, or password endpoints. See `docs/ADR-0001-clerk-authentication.md`.
6. **Payments are Geidea (Egypt).** Payment state changes only through a verified Geidea webhook or an explicit admin action for CASH orders. Never mark an order paid from a client redirect or return URL. See `docs/ADR-0002-geidea-payment-gateway.md`.
7. **Reserve stock atomically.** All stock mutations must use the conditional-decrement transaction pattern in `docs/ADR-0003-stock-reservation-strategy.md`. Never use a read-then-write stock flow.
8. **Use the global response envelope for every endpoint.** Follow `docs/CODING_STANDARDS.md` and the endpoint template in `docs/API_SPECIFICATION.md`. Document every new or changed endpoint in Swagger in the same task with `@ApiTags`, `@ApiOperation`, and `@ApiResponse` on controllers and `@ApiProperty` on DTOs. If a `nestjs-swagger` skill is available, use it; otherwise follow the repository documentation and existing patterns directly.
9. **Prisma schema changes are atomic project changes.** In the same task, update `docs/DATABASE.md`, create a migration, and add an entry to `docs/CHANGELOG.md`.

## Codex Working Guidelines

- Inspect existing code and relevant documentation before editing.
- Prefer the smallest coherent change that satisfies the request and the active phase.
- Keep controllers limited to routing and I/O. Put business logic and transactions in services.
- Use the generated Prisma client directly through the shared `PrismaService`; do not add a repository layer.
- Keep modules isolated. Communicate through exported services, and use domain events for cross-module side effects.
- Add or update tests for changed behavior.
- Run focused tests while iterating, then run the relevant lint, test, and build checks before handing off.
- Do not run destructive Git commands, discard working-tree changes, expose secrets, or modify generated files manually.
- Use `pnpm`; do not use npm or Yarn.
- Summarize changed files, verification performed, and any remaining risks or blockers in the final response.

## Mandatory Completion Checklist

- [ ] Update the checklist and phase status in `docs/DEVELOPMENT_PHASES.md`.
- [ ] Update `docs/API_SPECIFICATION.md` if an endpoint was added or changed.
- [ ] Add or update Swagger decorators for every changed endpoint and verify the Swagger UI when the application can be run.
- [ ] Update `docs/DATABASE.md` if the schema changed.
- [ ] Add a dated scope-and-summary entry to `docs/CHANGELOG.md`.
- [ ] Add an ADR under `docs/` if a significant architectural decision was made.
- [ ] Run lint and relevant tests; satisfy the phase Definition of Done.

Apply checklist items only when they are relevant to the task, but always update the phase status and changelog after a completed implementation task as required by the project documentation.

## Commands

The package manager is **pnpm** (`pnpm-lock.yaml` and `pnpm-workspace.yaml` are present).

```bash
pnpm install                # Install dependencies

pnpm start:dev              # Run in watch mode (primary development loop)
pnpm start:debug            # Run in watch mode with --inspect-brk

pnpm build                  # Build with Nest into dist/
pnpm start:prod             # Run dist/main.js after building

pnpm lint                   # Run ESLint with fixes over src/apps/libs/test
pnpm format                 # Run Prettier over TypeScript sources and tests

pnpm test                   # Run Jest unit tests (*.spec.ts under src/)
pnpm test:watch             # Run Jest in watch mode
pnpm test:cov               # Run Jest with coverage
pnpm test:e2e               # Run test/**/*.e2e-spec.ts
pnpm test -- app.controller # Run one unit test file by name pattern
pnpm test -- -t "test name" # Run tests matching a name

pnpm exec prisma migrate dev # Create/apply a migration using DATABASE_URL
pnpm exec prisma generate    # Generate the client into src/generated/prisma
```

Jest configuration is inline in `package.json` (`rootDir: src`, matching `*.spec.ts`). End-to-end tests live under `test/` and use `test/jest-e2e.json`.

## Architecture

The application is a **modular monolith**: one NestJS application and one PostgreSQL database. Feature modules live under `src/modules/*` and communicate only through exported services. A module must not access another module's controllers or Prisma queries. Cross-module side effects such as “order paid → notification + email” use `@nestjs/event-emitter`, not direct service coupling.

Request pipeline:

```text
Middleware (pino logger, raw body for webhooks)
  → Guards (ThrottlerGuard → ClerkAuthGuard/OptionalAuthGuard → RolesGuard)
  → Pipes (global ValidationPipe → DTO)
  → Controller (routing and I/O only)
  → Service (business logic, prisma.$transaction, domain events)
  → PrismaService (single global instance, no repository layer)
  → Interceptors (ResponseEnvelopeInterceptor)
  → Exception filters (PrismaExceptionFilter / AllExceptionsFilter)
```

Before changing related code, internalize these decisions:

- There are two request identities: `req.user` (Clerk-verified and database-loaded) and `req.cartIdentity` (`{ userId } | { sessionToken }`, resolved by cart middleware). See `docs/ARCHITECTURE.md` §6.
- Prisma is the data layer. Put complex queries in private methods on the owning service. Add abstractions only when a second real implementation exists, such as `PaymentGatewayService` for planned gateway alternatives.
- Every success and error response uses the universal envelope: `{ status, message, data, meta }` or `{ status, message, code, errors }`. Interceptors and filters wrap responses; controllers return bare data.
- `/webhooks/clerk` and `/webhooks/geidea` are `@Public()`, signature-verified before parsing, and idempotent.
- `User.id` is the Clerk user ID, not a generated cuid. The `users` table mirrors Clerk, owns application relations, and is authoritative for `role`; the role is mirrored to Clerk `publicMetadata`.
- See `docs/ARCHITECTURE.md` for module ownership, folder layout, background jobs, and webhook verification details.

## Database

`prisma/schema.prisma` is the schema source of truth. `docs/DATABASE.md` records its rationale and business rules and must change in the same task as the schema.

Conventions:

- Use `cuid()` identifiers except for `User.id`.
- Use `Decimal(10,2)` for EGP money.
- Do not use soft delete. Products use `status = ARCHIVED`; users use `active = false`.
- Choose `Cascade`, `Restrict`, and `SetNull` deliberately according to `docs/DATABASE.md` §1.

## Quick Facts

- **Base path:** `/api/v1` using a global prefix and URI versioning
- **Swagger UI:** `/api/docs`, generated by `@nestjs/swagger`
- **Authentication:** Clerk JWT Bearer tokens through `ClerkAuthGuard`
- **Roles:** `USER | MANAGER | ADMIN`; database is authoritative and Clerk `publicMetadata` mirrors it
- **Database:** PostgreSQL through Prisma; schema at `prisma/schema.prisma`, generated client at `src/generated/prisma`
- **Images/assets:** Cloudinary (`imageId` is the public ID; `imageUrl` is the secure URL)
- **Email:** Resend
- **Payments:** Geidea Checkout for CARD; cash on delivery for CASH
- **Notifications:** In-app database notifications; FCM push is planned
- **Currency/language:** EGP only and one language for now
