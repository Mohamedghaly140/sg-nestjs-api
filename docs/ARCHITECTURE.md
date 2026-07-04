# SG Couture — Architecture

> **Status:** Living document · **Last updated:** 2026-07-05 · **Related:** [CODING_STANDARDS.md](./CODING_STANDARDS.md), [DATABASE.md](./DATABASE.md), [ADR/](./ADR/)

## 1. Technology Stack & Rationale

| Technology | Role | Why |
|---|---|---|
| **NestJS 11** | HTTP framework | Opinionated module system, first-class DI, guards/pipes/interceptors map cleanly onto our cross-cutting needs; TypeScript-native |
| **PostgreSQL** | Database | Relational integrity for orders/stock; transactions + row-level atomic updates are the backbone of the stock-reservation strategy |
| **Prisma** | ORM | Type-safe queries, migration workflow, matches the provided schema; client generated to `generated/prisma` |
| **Clerk** | Identity provider | Owns sign-up/sign-in/passwords/sessions/verification; removes an entire attack surface from this codebase. See [ADR-0001](./ADR/ADR-0001-clerk-authentication.md) |
| **Geidea** | Payment gateway (Egypt) | Local gateway with EGP + Meeza support, hosted checkout keeps us out of PCI scope. See [ADR-0002](./ADR/ADR-0002-geidea-payment-gateway.md) |
| **Cloudinary** | Asset storage | Product/category images, invoices; `imageId` = public_id enables deletes/transforms |
| **Resend** | Transactional email | Order confirmations, guest claim links |
| **class-validator + class-transformer** | Validation | DTO-level declarative validation via global `ValidationPipe` |
| **@nestjs/swagger** | API documentation | OpenAPI generation from controller/DTO decorators; Swagger UI served at `/api/docs`; every endpoint documented per [CODING_STANDARDS.md §9](./CODING_STANDARDS.md#9-api-documentation-swagger--openapi) |
| **@nestjs/throttler** | Rate limiting | Protects public endpoints (checkout, coupon validation, webhooks) |
| **@nestjs/schedule** | Cron jobs | Expired-cart purge, unpaid-CARD-order expiry, guest-token cleanup |
| **Pino (nestjs-pino)** | Logging | Structured JSON logs, request correlation |
| **Firebase (FCM)** | Push notifications | **Future phase** — in-app notifications ship first |
| **Bosta** | Shipping provider | **Future phase** — DB shipping zones ship first |

No caching layer at launch. Redis may be introduced later for cart hot-paths and rate-limit storage (documented as a future enhancement, not current scope).

## 2. Architecture Style

**Modular monolith.** One NestJS application, one PostgreSQL database, feature-based modules with strict boundaries:

- Modules communicate through **exported services** (never by importing another module's Prisma queries or controllers).
- Domain events that cross modules (e.g., "order paid" → notification + email) are dispatched through lightweight in-process event emitters (`@nestjs/event-emitter`) so Orders doesn't depend on Notifications/Mail directly.

### Dependency flow

```
HTTP Request
  → Middleware (pino request logger, raw-body capture for webhooks)
  → Guards (ThrottlerGuard → ClerkAuthGuard / OptionalAuthGuard → RolesGuard)
  → Pipes (global ValidationPipe → DTO)
  → Controller (routing + I/O shaping only)
  → Service (business logic, transactions)
  → PrismaService (data access)
  → Interceptors (ResponseEnvelopeInterceptor on the way out)
  → Exception Filters (AllExceptionsFilter / PrismaExceptionFilter on error)
```

**Rule:** dependencies point downward only. Controllers never call Prisma. Services never read HTTP objects (`Request`/`Response`) — anything they need arrives as typed parameters (e.g., `CurrentUser`, `cartIdentity`).

## 3. Layer Responsibilities

### Controllers
- Declare routes, apply guards/decorators, receive validated DTOs, delegate to a single service call, return plain data (envelope is applied by the interceptor).
- Carry the Swagger route decorators (`@ApiTags`, `@ApiOperation`, `@ApiResponse`, `@ApiBearerAuth`) — see CODING_STANDARDS.md §9.
- No business logic, no Prisma, no try/catch (filters handle errors).

### Services
- All business rules, orchestration, and transactions (`prisma.$transaction`).
- Throw domain-mapped Nest exceptions (`NotFoundException`, `ConflictException` with error codes from `common/constants/error-codes.ts`).
- Emit domain events for cross-module side effects.

### Prisma layer
- A single global `PrismaService` (extends `PrismaClient`, `onModuleInit` connect).
- No repository abstraction on top of Prisma (see PROJECT_OVERVIEW.md §Design Principles). Complex reusable queries live in the owning module's service as private methods.

### Guards
| Guard | Purpose |
|---|---|
| `ClerkAuthGuard` | Verifies Clerk Bearer JWT (`@clerk/backend`), loads the local user row, attaches `req.user`. 401 if missing/invalid, 403 if `active = false` |
| `OptionalAuthGuard` | Same verification but never throws on absence — used by cart/checkout/product endpoints that serve both guests and users |
| `RolesGuard` + `@Roles(Role.ADMIN, ...)` | Role check against the **DB** role (source of truth), after `ClerkAuthGuard` |
| `ThrottlerGuard` | Global rate limiting; stricter overrides on checkout/coupon/webhook routes |

### Interceptors
- `ResponseEnvelopeInterceptor` — wraps controller return values into `{ status, message, data, meta }`. Controllers can return `{ data, meta }` (paginated) or a bare object.
- `SerializeInterceptor` (`ClassSerializerInterceptor`) — strips `@Exclude()`d fields.

### Pipes
- Global `ValidationPipe` with `{ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }`.
- `ParseCuidPipe` for `:id` params.

### Exception filters
- `PrismaExceptionFilter` — maps known Prisma errors: `P2002` → 409 `DUPLICATE_RESOURCE`, `P2025` → 404 `RESOURCE_NOT_FOUND`, `P2003` → 409 `FOREIGN_KEY_CONSTRAINT`.
- `AllExceptionsFilter` — final catch-all → 500 `INTERNAL_ERROR`, logs with correlation id, never leaks internals.

### DTOs
- Every request body/query has a DTO class in the module's `dto/` folder. Response shapes use entity classes with `@Exclude/@Expose` where field-stripping matters. See CODING_STANDARDS.md.
- Every DTO property carries `@ApiProperty`/`@ApiPropertyOptional` in agreement with its class-validator rules (CODING_STANDARDS.md §9).

## 4. Modules

| Module | Owns | Depends on (services) |
|---|---|---|
| `PrismaModule` (global) | DB access | — |
| `ConfigModule` (global) | Validated env | — |
| `CommonModule` | envelope interceptor, filters, pipes, decorators, pagination helpers | — |
| `AuthModule` | ClerkAuthGuard, OptionalAuthGuard, RolesGuard, Clerk webhook controller, user sync | Prisma, Users |
| `UsersModule` | user profile, admin user management, role changes | Prisma, Clerk SDK |
| `AddressesModule` | user addresses | Prisma |
| `CategoriesModule` | categories + sub-categories | Prisma, Uploads |
| `ProductsModule` | products, product images, listing/filtering | Prisma, Uploads |
| `ReviewsModule` | reviews + rating aggregate recompute | Prisma |
| `WishlistModule` | wishlist | Prisma |
| `CartModule` | cart identity resolution, items, totals, merge, expiry cron | Prisma, Products |
| `CouponsModule` | coupon CRUD, validation, usage tracking | Prisma |
| `ShippingModule` | shipping zones CRUD, fee lookup | Prisma |
| `OrdersModule` | checkout (registered + guest), stock reservation, order lifecycle, claiming, humanOrderId, expiry cron | Prisma, Cart, Coupons, Shipping, EventEmitter |
| `PaymentsModule` | Geidea session creation, webhook, refunds | Prisma, Orders |
| `NotificationsModule` | in-app notifications, event listeners | Prisma |
| `MailModule` | Resend templates + senders, event listeners | Resend |
| `UploadsModule` | Cloudinary signed uploads/deletes | Cloudinary |
| `AnalyticsModule` | dashboard metrics (ADMIN) | Prisma |
| `HealthModule` | `/health` (Terminus) | Prisma |

## 5. Folder Structure

```
sg-couture-backend/
├── CLAUDE.md                     # AI instructions (entry point)
├── docs/                         # This documentation set
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts                   # Dev seed (categories, products, admin user)
├── generated/prisma/             # Generated Prisma client (gitignored)
├── src/
│   ├── main.ts                   # bootstrap: prefix, versioning, pipes, cors, helmet, swagger (/api/docs)
│   ├── app.module.ts
│   ├── config/                   # env validation schema + typed config namespaces
│   │   ├── configuration.ts
│   │   └── env.validation.ts
│   ├── common/                   # cross-cutting, no business logic
│   │   ├── constants/error-codes.ts
│   │   ├── decorators/           # @CurrentUser, @Roles, @Public, @CartIdentity
│   │   ├── dto/pagination-query.dto.ts
│   │   ├── filters/
│   │   ├── interceptors/
│   │   ├── pipes/
│   │   └── utils/
│   ├── prisma/                   # PrismaModule + PrismaService
│   └── modules/
│       ├── auth/
│       │   ├── auth.module.ts
│       │   ├── guards/
│       │   ├── webhooks/clerk-webhook.controller.ts
│       │   └── services/clerk-sync.service.ts
│       ├── users/
│       │   ├── users.module.ts
│       │   ├── users.controller.ts        # /users/me
│       │   ├── admin-users.controller.ts  # /admin/users
│       │   ├── users.service.ts
│       │   └── dto/
│       ├── addresses/ …          # same internal shape: controller(s), service, dto/
│       ├── categories/
│       ├── products/
│       ├── reviews/
│       ├── wishlist/
│       ├── cart/
│       ├── coupons/
│       ├── shipping/
│       ├── orders/
│       ├── payments/
│       ├── notifications/
│       ├── mail/                 # templates/ + mail.service.ts (no controller)
│       ├── uploads/
│       ├── analytics/
│       └── health/
└── test/                         # e2e specs
```

Every feature module follows the same internal shape: `*.module.ts`, one or more controllers (storefront vs `admin-*` when role-gated surface differs), `*.service.ts`, `dto/`, optional `entities/`, `events/`, `listeners/`.

## 6. Request Identity Model

Two identities can be attached to a request:

1. **`req.user`** — set by `ClerkAuthGuard`/`OptionalAuthGuard` from a verified Clerk JWT + DB lookup. Shape: `{ id, email, role, active }`.
2. **`req.cartIdentity`** — resolved by `CartIdentityMiddleware` for cart/checkout routes: `{ userId } | { sessionToken }`. Web sends the anonymous token via the `cart_session` httpOnly cookie; mobile sends `X-Cart-Session` header. See [FEATURES.md §Cart](./FEATURES.md#4-cart).

## 7. Webhooks

| Endpoint | Source | Verification |
|---|---|---|
| `POST /api/v1/webhooks/clerk` | Clerk | Svix signature (`svix-id`, `svix-timestamp`, `svix-signature`) against `CLERK_WEBHOOK_SECRET`; requires raw body |
| `POST /api/v1/webhooks/geidea` | Geidea | Signature verification per Geidea callback spec (HMAC over merchantPublicKey + amount + currency + orderId + status + merchantReferenceId using the API password) + amount/currency match against our order |

Webhook controllers are `@Public()` (no Clerk auth), rate-limit exempt, verify signatures **before** parsing business payloads, and are **idempotent** (processing the same event twice is a no-op).

## 8. Background Jobs (@nestjs/schedule)

| Job | Schedule | Action |
|---|---|---|
| `purgeExpiredCarts` | daily 04:00 | Delete anonymous carts with `expiresAt < now()` |
| `expireUnpaidCardOrders` | every 15 min | Cancel PENDING CARD orders unpaid for > 60 min → restore stock, release coupon usage |
| `purgeExpiredGuestTokens` | daily 04:30 | Null out `guestToken` where `guestTokenExpiresAt < now()` |
