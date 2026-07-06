# SG Couture Backend — Changelog

> 🤖 **Claude Code:** append an entry after **every** completed task. Format: date · scope · summary · docs touched. Newest first.

## 2026-07-06 — Phase 0 · Typed response envelope interfaces

- Added `src/common/interfaces/api-response.ts` with shared `ApiSuccessResponse<T>`, `ApiErrorResponse`, and `ApiResponse<T>` types matching the documented envelope shape (`CODING_STANDARDS.md §2`). Type-only refactor with no behavior change: `ResponseEnvelopeInterceptor` now implements `NestInterceptor<unknown, ApiSuccessResponse<unknown>>`, and both exception filters annotate their JSON payloads with `satisfies ApiErrorResponse`. `ApiErrorResponse.code` is `string` (not narrowed to `ErrorCode`) since filters pass through unchecked codes from arbitrary thrown `HttpException` bodies.
- No endpoint, schema, or wire-format changes; existing unit specs pass unchanged.

## 2026-07-06 — Phase 0 · HTTP-layer skeleton and health endpoint

- Replaced the bare bootstrap with the `/api/v1` global route configuration, URI versioning, Helmet, environment-driven credentialed CORS, global DTO validation, and Swagger UI/OpenAPI setup at `/api/docs` with Bearer authentication metadata.
- Added the universal success envelope, stable error-code catalog, recursive validation-error formatting, Prisma known-error mapping, and the final safe exception filter. `AllExceptionsFilter` (catch-all) is registered ahead of `PrismaExceptionFilter` in `CommonModule`, since Nest reverses the global-filter array before matching first-to-last — registering the catch-all first means the specific Prisma filter is checked first at runtime. Unknown server errors never expose internal messages or stacks.
- Added structured Pino request logging with correlation IDs and sensitive-field redaction, development-only pretty output, and the global 100-request-per-minute throttler guard.
- Added the throttler-exempt `GET /api/v1/health` endpoint using Terminus's `HealthCheckService` and its built-in `PrismaHealthIndicator.pingCheck` (`SELECT 1`, 1000ms timeout), including the documented success payload and normalized `SERVICE_UNAVAILABLE` response.
- Removed the untouched Nest CLI controller/service and sample tests. Added focused unit coverage for constants, validation, envelopes, filters, and health behavior plus e2e coverage for healthy/unhealthy health checks and the documented 422 DTO response.
- Updated `DEVELOPMENT_PHASES.md` to mark this Phase 0 slice complete and expanded the health contract in `API_SPECIFICATION.md`. Phase 0 remains in progress because seed data and quick-start work are still outstanding.

## 2026-07-06 — Phase 0 · Prisma review hardening

- Made `prisma.config.ts` safe to load without `.env`: `DIRECT_URL` is optional and preferred for database CLI commands, `DATABASE_URL` is its fallback, and client generation needs neither. Runtime configuration now exposes only `database.url`; `PrismaService` receives that validated namespace through Nest dependency injection instead of reading `process.env` or falling back implicitly.
- Replaced the unconditional Prisma postinstall command with a Node wrapper that generates the client when the development-only Prisma CLI is installed and cleanly skips generation during production-only dependency installs.
- Moved generated Prisma output to `src/generated/prisma`, restored the normal `dist/main.js` application layout, and split build type-check/emission configs so root `prisma.config.ts` is type-checked while application emission remains rooted at `src/`. Added root-config lint coverage and focused config tests.
- Enabled Prisma's `partialIndexes` preview feature and declared the governorate-wide ShippingZone uniqueness rule in `schema.prisma`; aligned the existing migration comment so future migration diffs retain the PostgreSQL partial unique index.
- Added the generated-client `.js` import mapper to both unit and e2e Jest configurations and enabled Jest VM modules for Prisma's runtime WASM import. Added explicit tests that missing `DIRECT_URL` is accepted, malformed provided `DIRECT_URL` is rejected, and Prisma config URL selection/no-env generation behavior is correct.
- Expanded `DATABASE.md` model documentation for Coupon, CouponUsage, ShippingZone, and Order and removed obsolete “Schema change required” placeholders. Updated `DEVELOPMENT_PHASES.md`, `CODING_STANDARDS.md`, `ARCHITECTURE.md`, `CLAUDE.md`, and `AGENTS.md` for the corrected paths and configuration behavior.

## 2026-07-05 — Phase 0 · fixes from Codex review of the PrismaModule work

- Added `"postinstall": "prisma generate"` to `package.json` — `generated/` is (correctly) gitignored, but nothing regenerated it on a fresh `pnpm install`, so a clean checkout couldn't build.
- Fixed `ShippingZone`'s uniqueness gap: `@@unique([country, governorate, city])` doesn't stop duplicate governorate-wide rows because Postgres treats each `NULL` `city` as distinct. Prisma's schema DSL can't express a partial unique index, so added one via raw SQL (`prisma/migrations/20260704234353_shipping_zone_null_city_unique`): `UNIQUE (country, governorate) WHERE city IS NULL` — same pattern as `order_number_seq`. Verified via the actual Prisma client that a second governorate-wide zone for the same (country, governorate) is now rejected (`P2002`).

## 2026-07-05 — Phase 0 · PrismaModule + Migration 001

- Applied the first migration (`prisma/migrations/20260704231931_init`) against the project's Supabase Postgres database — since no prior migration history existed, this single migration establishes the baseline schema *and* the Migration 001 changes required by `docs/DATABASE.md §4`: `Order.stripePaymentIntentId` replaced with `geideaSessionId`/`geideaOrderId`; `Coupon.perUserLimit` + new `CouponUsage` model; new `ShippingZone` model; `order_number_seq` Postgres sequence (raw SQL, hand-appended to the generated migration); indexes on `products`, `orders`, `reviews` per §5.
- The target database already had tables from an earlier untracked schema sync (1 user, 2 products, 1 category, 1 cart, 1 coupon — confirmed disposable test data). Reset via `prisma migrate reset` with explicit user consent (Prisma's CLI blocks this specific operation for AI agents without it) to establish clean migration history.
- Added `prisma.config.ts` (Prisma 7's CLI config; `datasource.url = env('DIRECT_URL')`, direct/non-pooled connection for `migrate`/`generate`/`studio`). Added `dotenv` (devDependency) since Prisma 7 no longer auto-loads `.env` and `prisma.config.ts` needs its own `import 'dotenv/config'`.
- Added `src/prisma/prisma.service.ts` (extends the generated `PrismaClient`, `@prisma/adapter-pg` adapter constructed with the pooled `DATABASE_URL`, `OnModuleInit`/`OnModuleDestroy` connect/disconnect) and `src/prisma/prisma.module.ts` (`@Global`), wired into `src/app.module.ts`.
- **Correction to the previous entry below:** `@prisma/client` *is* required even with the new `provider = "prisma-client"` generator and custom `output` — the generated code imports runtime helpers from `@prisma/client/runtime/*`. Installed it.
- Set `moduleFormat = "cjs"` explicitly on the `generator client` block in `schema.prisma`. Without it, the generator inferred ESM (emitting `import.meta.url`) since this project has no `"type": "module"` in `package.json`, which crashed at runtime (`exports is not defined in ES module scope`) once compiled.
- `prisma.config.ts` and the Prisma-generated `generated/` output sit outside `src/`, which changed tsc's inferred build root — compiled output is now `dist/src/**` instead of `dist/**`. Updated `tsconfig.build.json` (exclude `prisma.config.ts`) and `package.json`'s `start:prod` script (`node dist/src/main`). Added `/generated` to `.gitignore` (previously missing, despite `CLAUDE.md` documenting it as gitignored).
- Added `DIRECT_URL` to the required-at-boot env vars (`src/config/env.validation.ts`, `configuration.ts`'s `database` namespace) and to `docs/CODING_STANDARDS.md §7`'s env var table (it wasn't previously documented).
- Verified: `pnpm build`/`lint`/`test` pass; `prisma migrate status` shows the migration applied; a direct query through the compiled `PrismaService` path succeeds against the real database; boot fails fast with a clear message when `DIRECT_URL` is missing/invalid (extends the prior step's env-validation tests).
- `docs/DATABASE.md`: Migration 001 marked applied. `docs/DEVELOPMENT_PHASES.md`: Phase 0's `PrismaModule` checklist line checked off. `CLAUDE.md`: "Current state" updated to reflect Phase 0 progress.

## 2026-07-05 — Phase 0 · dependencies + ConfigModule with fail-fast env validation

- Installed Phase 0 dependencies in one pass: `@nestjs/config`, `helmet`, `@nestjs/throttler`, `@nestjs/terminus`, `class-validator`, `class-transformer`, `nestjs-pino` + `pino-http` + `pino`, `@prisma/adapter-pg` + `pg` (dependencies); `prisma`, `@types/pg`, `pino-pretty` (devDependencies). `@prisma/client` deliberately **not** installed — `prisma/schema.prisma` uses the new `provider = "prisma-client"` generator with custom `output`, which is self-contained and driver-adapter based; revisit at the PrismaModule step per the `prisma-driver-adapter-implementation` skill.
- Added `src/config/env.validation.ts` (`class-validator` + `validateSync`, standard Nest recipe) and `src/config/configuration.ts` (`registerAs` namespaces: app, database, cors, clerk, geidea, cloudinary, mail, cart), wired via `ConfigModule.forRoot({ isGlobal: true, load, validate, cache: true })` in `src/app.module.ts`.
- Required-at-boot vars (fail-fast): `NODE_ENV`, `PORT`, `DATABASE_URL`, `CORS_ORIGINS`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`. All other documented vars (Geidea, Cloudinary, Resend/mail, cart/order TTLs) are typed with defaults but optional for now — promoted to required when their owning phase's module is built.
- `.env`: added `NODE_ENV`, `CORS_ORIGINS`; renamed `CLERK_WEBHOOK_SIGNING_SECRET` → `CLERK_WEBHOOK_SECRET` to match `CODING_STANDARDS.md` §7.
- Added `src/config/env.validation.spec.ts` (unit tests: missing required var throws, invalid enum throws, defaults populate correctly).
- Verified: `pnpm build`/`pnpm lint`/`pnpm test` pass; app boots cleanly with valid env; boots fail with a clear `Environment validation failed` message and non-zero exit when a required var is missing or invalid (`CORS_ORIGINS=`, `NODE_ENV=bogus` tested).
- `DEVELOPMENT_PHASES.md`: checked off the `ConfigModule` env-validation line under Phase 0 (Phase 0 remains "In Progress" — PrismaModule, bootstrap wiring, interceptors/filters, HealthModule still outstanding).

## 2026-07-05 — docs · Swagger documentation made a mandatory per-endpoint step

- New process rule: after every endpoint is completed, it must be documented in Swagger/OpenAPI with `@nestjs/swagger` decorators (`@ApiTags`/`@ApiOperation`/`@ApiResponse` on controllers, `@ApiProperty` on DTOs), applied via the `nestjs-swagger` skill, **in the same task**.
- `CLAUDE.md`: extended Non-Negotiable Rule #8, added a Swagger checkbox to the post-task checklist, added Swagger UI path (`/api/docs`) to Quick Facts.
- `DEVELOPMENT_PHASES.md`: Swagger decorators added to the Global Definition of Done; new Phase 0 task (SwaggerModule setup in `main.ts`, docs at `/api/docs`) + acceptance criterion; Phase 11 docs audit now includes OpenAPI completeness.
- `API_SPECIFICATION.md`: header note + endpoint template gained a `Swagger:` line (kept in sync with the `new-endpoint` skill's copy).
- `CODING_STANDARDS.md`: new §9 "API Documentation (Swagger/OpenAPI)" with controller/DTO decorator conventions; §3 DTO rules now require `@ApiProperty` and mapped types from `@nestjs/swagger`.
- `ARCHITECTURE.md`: `@nestjs/swagger` added to the tech-stack table; controller/DTO layer responsibilities and the `main.ts` folder note updated.
- No code changes — `SwaggerModule` wiring in `src/main.ts` is a Phase 0 task (`@nestjs/swagger` is already installed).

## 2026-07-03 — docs · Initial specification set

- Created the full documentation system: `CLAUDE.md`, `PROJECT_OVERVIEW.md`, `ARCHITECTURE.md`, `DATABASE.md`, `API_SPECIFICATION.md`, `FEATURES.md`, `DEVELOPMENT_PHASES.md`, `CODING_STANDARDS.md`, ADRs 0001–0004.
- Key decisions recorded: Clerk identity (ADR-0001), Geidea hosted checkout (ADR-0002), atomic stock reservation (ADR-0003), anonymous cart + merge (ADR-0004).
- Schema changes specified but **not yet applied** (Migration 001): Geidea payment fields replacing Stripe, `Coupon.perUserLimit` + `CouponUsage`, `ShippingZone`, `order_number_seq`, listing indexes — see `DATABASE.md §4`.
- Open items: `DATABASE.md §7 Assumptions` (review gating, phone-at-signup strategy, address snapshots, refund automation, cart price-change UX).
- Project state: nothing implemented; active phase = Phase 0.
