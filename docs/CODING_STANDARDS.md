# SG Couture — Coding Standards

> **Status:** Living document · **Last updated:** 2026-07-05 · Covers: conventions, response envelope, validation, error handling, logging, security, env vars, testing, API documentation (Swagger).

## 1. Naming Conventions

| Thing | Convention | Example |
|---|---|---|
| Files | kebab-case + Nest suffixes | `admin-orders.controller.ts`, `create-product.dto.ts` |
| Classes | PascalCase + suffix | `OrdersService`, `CreateProductDto`, `ClerkAuthGuard` |
| Interfaces | PascalCase, no `I` prefix | `CartIdentity`, `PaymentGateway` |
| Enums | PascalCase / UPPER_CASE members (match Prisma) | `OrderStatus.PENDING` |
| Constants | UPPER_SNAKE in `constants/` | `ERROR_CODES.INSUFFICIENT_STOCK` |
| Env vars | UPPER_SNAKE | `GEIDEA_API_PASSWORD` |
| Routes | plural kebab-case resources | `/api/v1/shipping-zones` |
| DB | see [DATABASE.md §1](./DATABASE.md#1-conventions) | `@@map("productImages")` |
| Booleans | `is/has/can` prefix | `isPaid`, `hasNext` |
| Service methods | verb-first | `createOrder`, `recomputeRatings` |

## 2. Response Envelope

Every endpoint (success **and** error) returns:

```jsonc
// Success
{
  "status": "success",
  "message": "Optional human-readable summary",
  "data": { /* resource or array */ },
  "meta": { /* optional: pagination etc. */ }
}

// Error
{
  "status": "error",
  "message": "Insufficient stock for one or more items",
  "code": "INSUFFICIENT_STOCK",              // stable machine code from constants/error-codes.ts
  "errors": [ /* optional details: field errors, failed lines */ ]
}
```

Pagination meta (always this shape):

```json
"meta": { "page": 1, "limit": 20, "totalItems": 143, "totalPages": 8, "hasNext": true, "hasPrev": false }
```

- Applied by `ResponseEnvelopeInterceptor`; controllers return bare data or `{ data, meta }`.
- `data` is `null` on 204-semantics responses (we still return 200 + envelope for client uniformity, except true `204 No Content` on deletes — see API spec per endpoint).
- Never leak stack traces, Prisma error text, or internal paths in `message`.

## 3. DTO & Validation Rules

- One DTO class per body/query; `class-validator` decorators; `PartialType` for updates; never reuse entity classes as DTOs.
- Global pipe: `whitelist: true, forbidNonWhitelisted: true, transform: true` → unknown fields are 422s, not silently dropped surprises.
- Validation failures → **422** `VALIDATION_ERROR` with `errors: [{ field, constraints }]`.
- Every DTO property also carries `@ApiProperty({ description, example })` (or `@ApiPropertyOptional`) consistent with its class-validator decorators — see §9 API Documentation. Use `PartialType`/`PickType`/`OmitType` from **`@nestjs/swagger`** (not `@nestjs/mapped-types`) so derived DTOs keep their Swagger metadata.

**Canonical rules (reuse via shared decorators in `common/validators/`):**

| Data | Rule |
|---|---|
| ids | cuid (`ParseCuidPipe`); Clerk ids validated as non-empty string |
| Strings | trimmed (`@Transform`), `@IsNotEmpty`, sensible `@MaxLength` (names 120, titles 150, descriptions 5000, notes 1000) |
| Email | `@IsEmail`, lowercased |
| Phone | `@IsPhoneNumber('EG')` (anon checkout + addresses) |
| Money/percent | never accepted from clients (server-computed). Admin product `price`: `@IsNumber({maxDecimalPlaces:2}) @Min(0.01) @Max(99999999.99)`; `discount`: 0–70 |
| Ratings | 1.0–5.0, step 0.5 |
| Quantity | `@IsInt @Min(1) @Max(100)` per line |
| Pagination | `page ≥ 1` (default 1), `limit 1–100` (default 20) |
| Search `q` | `@MaxLength(100)`, trimmed |
| Coupon code | `@Matches(/^[A-Z0-9_-]{3,30}$/)` after uppercase transform |
| Images | Cloudinary-side constraints: jpeg/png/webp, ≤ 5 MB (signed upload params) |
| Sort | `@IsIn([...])` whitelists only |

## 4. Error Handling Strategy

**Exception hierarchy:** built-in Nest `HttpException`s + stable `code`. Services throw; controllers never catch; filters format.

| HTTP | When | Example codes |
|---|---|---|
| 400 | Malformed request (bad JSON, bad param type) | `BAD_REQUEST` |
| 401 | Missing/invalid Clerk JWT; unsigned webhook | `UNAUTHENTICATED`, `INVALID_WEBHOOK_SIGNATURE` |
| 403 | Authenticated but not allowed | `FORBIDDEN`, `ACCOUNT_DISABLED` |
| 404 | Resource not found / not visible to caller | `RESOURCE_NOT_FOUND`, `CLAIM_TOKEN_INVALID` |
| 409 | State conflict | `DUPLICATE_RESOURCE`, `INSUFFICIENT_STOCK`, `COUPON_EXHAUSTED`, `COUPON_USER_LIMIT`, `REVIEW_EXISTS`, `PRODUCT_IN_USE`, `INVALID_STATUS_TRANSITION`, `SELF_MODIFICATION_FORBIDDEN` |
| 422 | Well-formed but semantically invalid | `VALIDATION_ERROR`, `CART_EMPTY`, `SHIPPING_NOT_AVAILABLE`, `COUPON_EXPIRED`, `COUPON_INACTIVE`, `SUBCATEGORY_CATEGORY_MISMATCH`, `INVALID_VARIANT` |
| 429 | Throttled | `RATE_LIMITED` |
| 500 | Unhandled | `INTERNAL_ERROR` |

Prisma mapping (in `PrismaExceptionFilter`): `P2002`→409, `P2025`→404, `P2003`→409. All 5xx are logged with request id; 4xx logged at `warn` only for security-relevant cases (401/403, webhook failures).

## 5. Logging Strategy (Pino)

- **Request logging:** method, path, status, latency, requestId, userId (if any). Bodies are NOT logged.
- **Error logging:** full error + stack at `error` for 5xx; `warn` for auth failures and webhook rejections.
- **Security logging:** role changes, user activation toggles, webhook signature failures, amount-mismatch callbacks (`CRITICAL`), admin cash-paid actions.
- **Audit logging (money/state):** order created, status transition (from→to, actor), isPaid flip (source: webhook/admin), stock restoration, coupon consume/release — structured `audit: true` field for filtering.
- **Redaction:** `authorization` header, cookies, tokens (`guestToken`, `sessionToken`), webhook secrets — configured in pino redact paths.

## 6. Security

- **JWT:** Clerk-verified per request (JWKS cached); no tokens issued by this backend.
- **Passwords:** none stored, ever (Clerk).
- **Card data:** never touches this backend (Geidea hosted page).
- **Webhooks:** signature verification before any processing (Svix / Geidea HMAC); raw-body middleware scoped to webhook routes only.
- **CORS:** explicit origin allow-list from env; credentials enabled (cart cookie).
- **CSRF:** the API is Bearer-token based; the only cookie (`cart_session`) is httpOnly + SameSite=Lax and grants only cart access — acceptable exposure; state-changing cart routes still require the token match. Re-evaluate if any auth cookie is ever introduced.
- **Rate limiting:** global 100/min/IP; overrides: checkout 5/min, coupon validate 10/min, payment-session 5/min, claim 5/min.
- **Input:** global whitelist validation; Prisma parameterization = SQL-injection safe (no raw SQL except the documented sequence call); XSS is a client concern but we never render HTML from user input and cap string lengths.
- **Sensitive data:** guest tokens are single-purpose, expiring, and never logged; PII limited to what commerce requires.
- **Secrets:** env only, validated at boot, never committed; separate sandbox/production Geidea + Clerk instances.
- **Helmet** on, `x-powered-by` off.

## 7. Environment Variables

| Variable | Purpose |
|---|---|
| `NODE_ENV` | `development` / `production` / `test` |
| `PORT` | HTTP port (default 3000) |
| `DATABASE_URL` | Postgres connection string |
| `CORS_ORIGINS` | Comma-separated allowed origins |
| `CLERK_SECRET_KEY` | Clerk backend API key (JWT verify, user API, metadata writes) |
| `CLERK_WEBHOOK_SECRET` | Svix signing secret for `/webhooks/clerk` |
| `GEIDEA_MERCHANT_PUBLIC_KEY` | Geidea public key (session creation + callback signature) |
| `GEIDEA_API_PASSWORD` | Geidea API password (auth + HMAC signing) |
| `GEIDEA_BASE_URL` | Geidea environment base URL (sandbox vs production) |
| `GEIDEA_CALLBACK_URL` | Public URL of `/api/v1/webhooks/geidea` |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Cloudinary credentials |
| `RESEND_API_KEY` | Resend API key |
| `MAIL_FROM` | Sender identity, e.g. `SG Couture <orders@sgcouture.com>` |
| `STOREFRONT_URL` | Base URL for claim links / email CTAs |
| `CARD_ORDER_EXPIRY_MINUTES` | Unpaid CARD order TTL (default 60) |
| `GUEST_TOKEN_TTL_DAYS` | Claim token validity (default 30) |
| `ANON_CART_TTL_DAYS` | Anonymous cart TTL (default 7) |

All validated in `config/env.validation.ts`; boot fails on any missing/invalid value.

## 8. Testing Strategy

- **Unit (Jest):** services with mocked `PrismaService`; mandatory suites: totals math, coupon pipeline, state machine, rating aggregates, merge logic, Geidea signature functions.
- **Integration:** Prisma against a disposable Postgres (testcontainers); mandatory: conditional stock decrement under parallel transactions, coupon last-use race, cascade behaviors.
- **E2E (supertest):** per-endpoint happy path + documented error codes; webhook flows with signed fixture payloads; cart merge scenarios; the Phase-6 concurrency acceptance test.
- **Mocking:** external services (Clerk API, Geidea, Cloudinary, Resend) behind injectable services — mocked in tests, never called.
- **Coverage:** services ≥ 80%; money paths (checkout, payments, coupons, stock) ≥ 95%.

## 9. API Documentation (Swagger / OpenAPI)

Every completed endpoint is documented in Swagger via `@nestjs/swagger` **in the same task that implements it** — use the **`nestjs-swagger` skill** to apply and verify the decorators. The OpenAPI doc is built by `SwaggerModule` in `src/main.ts` and served at **`/api/docs`** (Phase 0 setup).

**Controller conventions**

- `@ApiTags('<resource>')` on every controller (one tag per resource; admin controllers use e.g. `admin/orders`).
- `@ApiOperation({ summary })` on every handler — short, verb-first, matching the endpoint's description in `API_SPECIFICATION.md`.
- `@ApiResponse` for the success status **and** each endpoint-specific error code documented in `API_SPECIFICATION.md` (common errors — 401/403/404/422/429/500 — are registered globally, not repeated per handler).
- `@ApiBearerAuth()` on protected routes (`User`/`Manager+`/`Admin` auth levels); `@ApiParam`/`@ApiQuery` where path/query params exist.

**DTO conventions**

- `@ApiProperty({ description, example })` on every property; `@ApiPropertyOptional` for optional ones.
- Swagger metadata must agree with the class-validator rules (same constraints, enums via `enum:`, defaults via `default:`).
- Derived DTOs use `PartialType`/`PickType`/`OmitType` from `@nestjs/swagger` so metadata is inherited.

**Definition of Done:** the endpoint renders correctly in the Swagger UI at `/api/docs` — right tag, auth padlock where protected, request/response schemas complete. This is part of the mandatory post-task checklist in `CLAUDE.md`.
