# SG Couture Backend — Changelog

> 🤖 **Claude Code:** append an entry after **every** completed task. Format: date · scope · summary · docs touched. Newest first.

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
