---
name: new-endpoint
description: Scaffold a new NestJS endpoint (DTO, controller, service) and its docs/API_SPECIFICATION.md entry, following this repo's exact envelope, validation, and endpoint-template conventions.
---

# New Endpoint

Ensures every new or changed endpoint follows this repo's non-negotiable conventions (`AGENTS.md` rule #8) instead of re-deriving them from memory each time.

## When to Activate

- Adding a new route to any controller.
- Changing an existing route's request/response shape, auth level, or validation.

## Endpoint Doc Template

Every endpoint must get an entry in `docs/API_SPECIFICATION.md`, in the correct numbered section, using this template **verbatim** (from §0 of that file):

```
### METHOD /path
Description · Auth: <level>
Headers: <beyond Authorization, if any>
Path params: … · Query params: …
Request body: <json or —>
Validation: <specific rules>
Success (2xx): <json shape>
Errors: <endpoint-specific only>
Notes: <side effects, idempotency, events>
Swagger: <@ApiOperation summary · @ApiResponse codes · DTO @ApiProperty complete>
```

- **Auth legend:** `Public` · `Optional` (guest or user) · `User` (Clerk JWT) · `Manager+` · `Admin`.
- **Common errors are declared once, not per endpoint:** `401 UNAUTHENTICATED` (protected routes), `403 FORBIDDEN`/`ACCOUNT_DISABLED`, `404 RESOURCE_NOT_FOUND` (any `:id`), `422 VALIDATION_ERROR` (any DTO), `429 RATE_LIMITED`, `500 INTERNAL_ERROR` — only list errors specific to this endpoint.
- List endpoints always accept `page` (default 1) and `limit` (default 20, max 100) and return pagination `meta`.

## Response Envelope

Controllers return **bare data** — never build the envelope themselves. `ResponseEnvelopeInterceptor` wraps it:

```jsonc
// Success
{ "status": "success", "message": "Optional human-readable summary", "data": { /* resource or array */ }, "meta": { /* optional */ } }

// Error
{ "status": "error", "message": "...", "code": "STABLE_ERROR_CODE", "errors": [ /* optional details */ ] }
```

Pagination `meta` is always this shape: `{ "page": 1, "limit": 20, "totalItems": 143, "totalPages": 8, "hasNext": true, "hasPrev": false }`. True `204 No Content` (deletes) is the one exception to "always 200 + envelope" — check the endpoint's documented status code.

## Naming & File Conventions

| Thing | Convention | Example |
|---|---|---|
| Files | kebab-case + Nest suffix | `create-product.dto.ts`, `admin-orders.controller.ts` |
| Classes | PascalCase + suffix | `OrdersService`, `CreateProductDto` |
| Routes | plural kebab-case resources | `/api/v1/shipping-zones` |
| Service methods | verb-first | `createOrder`, `recomputeRatings` |
| Booleans | `is/has/can` prefix | `isPaid`, `hasNext` |

## DTO & Validation Rules

- One DTO class per body/query; `class-validator` decorators; `PartialType` for partial updates; **never** reuse entity classes as DTOs.
- Global pipe is `whitelist: true, forbidNonWhitelisted: true, transform: true` — unknown fields are 422s, not silently dropped.
- Validation failures → **422** `VALIDATION_ERROR` with `errors: [{ field, constraints }]`.
- Canonical field rules (reuse shared decorators in `common/validators/`): ids via `ParseCuidPipe`; strings trimmed + `@IsNotEmpty` + sensible `@MaxLength`; email `@IsEmail` lowercased; phone `@IsPhoneNumber('EG')`; **money/percent fields are never accepted from clients** — always server-computed; quantity `@IsInt @Min(1) @Max(100)`; pagination `page ≥ 1`, `limit` 1–100.

## Request Pipeline Reminder

- **Controller**: routing + I/O only. No Prisma calls, no business logic, never catches exceptions (filters handle that).
- **Service**: owns business logic, `prisma.$transaction`, domain events. Throws `HttpException`s carrying a stable `code` from the error-code table in `CODING_STANDARDS.md` §4 (e.g. `409 INSUFFICIENT_STOCK`, `404 RESOURCE_NOT_FOUND`).
- Server computes all prices/totals — never trust a client-submitted amount.

## Procedure

1. Confirm the endpoint belongs to the currently active phase in `docs/DEVELOPMENT_PHASES.md` (use the `phase-guard` agent if unsure) — don't build ahead of schedule.
2. Write or extend the DTO(s) in the owning module's `dto/` folder.
3. Write the controller method (routing/I-O only, correct guard/auth decorator for the endpoint's Auth level).
4. Write the service method (business logic, transaction if money/stock is involved, throws typed errors).
5. Document the endpoint in Swagger with the `nestjs-swagger` skill: `@ApiTags` on the controller, `@ApiOperation` + `@ApiResponse` on the handler, `@ApiBearerAuth()` on protected routes, `@ApiProperty` on every DTO property (matching its class-validator rules).
6. Add or update the entry in `docs/API_SPECIFICATION.md`'s correct numbered section, using the template verbatim.
7. Add unit tests for the service and an e2e happy-path test per `CODING_STANDARDS.md` §8 (money paths need ≥95% coverage).
8. Run the `task-close` skill before declaring the task done.
