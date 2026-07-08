# SG Couture — API Specification

> **Status:** Living document · **Last updated:** 2026-07-07 · **Base URL:** `/api/v1` · **Related:** [FEATURES.md](./FEATURES.md) (business rules), [CODING_STANDARDS.md](./CODING_STANDARDS.md) (envelope, validation, error codes)
>
> 🤖 **Claude Code:** every new/changed endpoint MUST be documented here using the template below, in the correct section, before the task is considered done — **and** MUST carry `@nestjs/swagger` decorators in code (`@ApiTags`/`@ApiOperation`/`@ApiResponse` on the controller, `@ApiProperty` on DTOs), applied via the `nestjs-swagger` skill, so it appears in the Swagger UI at `/api/docs`.

## 0. Conventions & Endpoint Template

- All responses use the **global envelope** (`status/message/data/meta` on success; `status/message/code/errors` on error) — examples below show the `data` payload only unless the envelope matters.
- All list endpoints accept `page` (default 1) and `limit` (default 20, max 100) and return pagination `meta`.
- **Auth legend:** `Public` · `Optional` (guest or user) · `User` (Clerk JWT) · `Manager+` · `Admin`.
- **Common errors apply everywhere and are not repeated per endpoint:** `401 UNAUTHENTICATED` (protected routes), `403 FORBIDDEN`/`ACCOUNT_DISABLED`, `404 RESOURCE_NOT_FOUND` (any `:id`), `422 VALIDATION_ERROR` (any DTO), `429 RATE_LIMITED`, `500 INTERNAL_ERROR`.
- **Numbers on the wire:** record money/percent/rating decimals are serialized as **strings** with DB precision (e.g. `"1299.00"`); dates are ISO 8601 UTC. **Exception:** dashboard/analytics aggregates (§14) are plain JSON numbers — they are chart/KPI inputs, not editable records.

Template (use verbatim for every endpoint):

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

---

## 1. Health

### GET /health
Liveness/readiness (DB ping) · Auth: Public
Headers: —
Path params: — · Query params: —
Request body: —
Validation: —
Success (200): `{ "app": "up", "database": "up" }`
Errors: 503 `SERVICE_UNAVAILABLE` when DB unreachable
Notes: Throttler-exempt. The application and PostgreSQL connection must both be available; the database check uses `SELECT 1`.
Swagger: `Liveness/readiness check (DB ping)` · `@ApiResponse` 200/503 · `HealthResponseDto` properties documented with `@ApiProperty`

---

## 2. Webhooks

### POST /webhooks/clerk
Clerk identity sync (`user.created`, `user.updated`, `user.deleted`) · Auth: Public (Svix-signed)
Headers: `svix-id`, `svix-timestamp`, `svix-signature` (required)
Request body: raw Clerk event payload (verified before parsing)
Validation: Svix signature against `CLERK_WEBHOOK_SECRET`; unknown event types acknowledged and ignored
Success (200): `{ "received": true }`
Errors: 401 `INVALID_WEBHOOK_SIGNATURE`
Notes: idempotent upserts/deletes; `user.deleted` cascades per [DATABASE.md §3.1](./DATABASE.md#31-user-users); missing-phone handling per DATABASE.md Assumptions §2. Raw-body route.
Swagger: `Synchronize Clerk user lifecycle events` · `@ApiResponse` 200/401

### POST /webhooks/geidea
Payment result callback from Geidea · Auth: Public (HMAC-signed payload)
Request body: Geidea callback (order id, amount, currency, status, merchantReferenceId, signature)
Validation: signature per Geidea spec; `merchantReferenceId` resolves to an order; **amount and currency must equal `order.totalOrderPrice`/EGP**
Success (200): `{ "received": true }`
Errors: 401 `INVALID_WEBHOOK_SIGNATURE`; 404 when order unknown
Notes: on success status → `isPaid=true`, `paidAt`, `geideaOrderId` stored, `Product.sold` incremented, `order.paid` emitted. Amount mismatch → CRITICAL log, no state change, still 200 to stop retries. Idempotent on replays. See [FEATURES.md §7](./FEATURES.md#7-payments-geidea).

---

## 3. Users

### GET /users/me
Current user profile · Auth: User
Success (200): `{ "id", "email", "name", "phone", "role", "createdAt" }`
Notes: JIT-syncs from Clerk if webhook lagged.
Swagger: `Get the current user profile` · `@ApiResponse` 200 · `MeResponseDto` documented

### PATCH /users/me
Update own profile (name, phone) · Auth: User
Request body: `{ "name?", "phone?" }` · Validation: name ≤ 120; phone EG format, unique
Success (200): updated profile
Errors: 409 `DUPLICATE_RESOURCE` (phone taken)
Notes: email/role are NOT editable here; name/phone also pushed to Clerk.
Swagger: `Update the current user profile` · `@ApiResponse` 200/409 · `UpdateMeDto`/`MeResponseDto` documented

### GET /admin/customers
Customer table (`role = USER` accounts only) · Auth: Manager+
Query: `page, limit, search` (name/email/phone), `active?`
Success (200): `data: [{ id, name, email, phone, active, createdAt, ordersCount }]`, pagination meta
Notes: implicitly filtered to `role = USER` (staff accounts live under /admin/users); ordered `createdAt` desc.
Swagger: `List customers for administration` · `@ApiResponse` 200 · query/response DTOs documented

### GET /admin/customers/:id
Customer detail: profile + addresses + order history · Auth: Manager+
Success (200): `{ id, name, email, phone, active, role, createdAt, addresses: [address…], orders: [{ id, humanOrderId, status, paymentMethod, totalOrderPrice, isPaid, createdAt, itemsCount }] }`
Errors: 404 also when the id exists but `role ≠ USER` (staff accounts are invisible here)
Notes: orders ordered `createdAt` desc.
Swagger: `Get a customer detail with addresses and orders` · `@ApiResponse` 200/404 · path param/detail DTO documented

### PATCH /admin/customers/:id/active
Activate/deactivate (ban) a customer · Auth: Manager+
Request body: `{ "active": boolean }`
Success (200): `{ "id", "active" }`
Errors: 409 `SELF_MODIFICATION_FORBIDDEN` (own account); 409 `FORBIDDEN_TARGET` (target role ≠ USER)
Notes: Clerk first (`banUser`/`unbanUser`), then DB `user.active` — a Clerk failure aborts the request with no DB change. Deactivated users are 403 `ACCOUNT_DISABLED` everywhere; audit-logged.
Swagger: `Change a customer activation status` · `@ApiResponse` 200/409 · path param/request/response DTOs documented

### POST /admin/customers/:id/reset-password
Reset a customer password and send a first-party notice · Auth: Manager+
Request body: —
Success (200): `{ "sent": true }`
Errors: 409 `FORBIDDEN_TARGET` when target role ≠ USER, for every Manager+ actor (including ADMIN); 503 `SERVICE_UNAVAILABLE` when mail is not configured or delivery fails
Notes: generates a strong random password, sets it through Clerk with all other sessions signed out, then sends a one-off Resend notice. The password is held only in request memory and is never persisted by this backend. A mail failure is surfaced because the Clerk password has already changed. (Moved from `/admin/users/:id/reset-password` — same behavior.)
Swagger: `Reset a customer password and send a notice` · `@ApiResponse` 200/409/503 · path param documented

### GET /admin/users
User table across all roles (staff management) · Auth: **Admin**
Query: `page, limit, search` (name/email), `role?`, `active?`
Success (200): `data: [{ id, name, email, phone, role, active, createdAt }]`, pagination meta
Notes: ordered `createdAt` desc.
Swagger: `List users for staff management` · `@ApiResponse` 200 · query/response DTOs documented

### POST /admin/users
Create an account (staff or customer) via Clerk · Auth: **Admin**
Request body: `{ "name", "email", "phone", "password", "role" }`
Validation: name 2–120; email; phone EG format; password ≥ 8; role ∈ `USER | MANAGER | ADMIN`
Success (201): created user `{ id, name, email, phone, role, active, createdAt }`
Errors: 422 `VALIDATION_ERROR` carrying Clerk's rejection message (duplicate email/phone, weak/compromised password)
Notes: Clerk `createUser` first (name split into firstName/lastName; username derived from the email local part, chars outside `[a-zA-Z0-9_.-]` → `_`; `publicMetadata.role` set), then immediate idempotent DB upsert with the Clerk-issued id (the Clerk webhook may lag or race). A DB failure after the Clerk create triggers a best-effort compensating Clerk `deleteUser` (CRITICAL-logged if that also fails — see ADR-0001). The password is never persisted by this backend. Audit-logged.
Swagger: `Create a user account via Clerk` · `@ApiResponse` 201/422 · request/response DTOs documented

### PATCH /admin/users/:id
Update role + activation together · Auth: **Admin**
Request body: `{ "role": "USER" | "MANAGER" | "ADMIN", "active": boolean }` (both required)
Success (200): updated user
Errors: 409 `SELF_MODIFICATION_FORBIDDEN` (own role change or self-deactivation); 409 `LAST_ADMIN_REQUIRED` (change would leave no other active ADMIN)
Notes: replaces the former separate `/role` and `/status` endpoints. Write order: Clerk `publicMetadata.role` → Clerk `banUser`/`unbanUser` → DB `user.update` (a Clerk failure aborts, DB untouched, so the Clerk webhook can never overwrite a half-applied change); a DB failure after the Clerk writes triggers a best-effort compensating revert of the Clerk role/ban state (CRITICAL-logged if that also fails — see ADR-0001). DB stays the authoritative role source on reads. Audit-logged.
Swagger: `Update a user role and activation status` · `@ApiResponse` 200/409 · path param/request/response DTOs documented

### DELETE /admin/users/:id
Delete a user from Clerk and the DB · Auth: **Admin**
Success (204)
Errors: 409 `SELF_MODIFICATION_FORBIDDEN` (self-delete); 409 `LAST_ADMIN_REQUIRED` (target is the last active ADMIN)
Notes: Clerk `deleteUser` first — a Clerk 404 is tolerated (row exists only in DB, e.g. seed data) and deletion proceeds; any other Clerk error aborts. Then DB delete: cascades to addresses/cart/wishlist/reviews/notifications per [DATABASE.md §3.1](./DATABASE.md#31-user-users); orders keep a null `userId` (`SetNull`). A DB failure after the Clerk delete self-heals via the idempotent `user.deleted` webhook. Audit-logged.
Swagger: `Delete a user from Clerk and the database` · `@ApiResponse` 204/409 · path param documented

---

## 4. Addresses (all Auth: User; all rows scoped to owner — foreign ids → 404)

### GET /addresses
List my addresses · Success (200): `data: [address…]` (default first)

### POST /addresses
Create address · Request body: `{ alias, country, governorate, city, area, phone, addressLine1, details, postalCode?, latitude?, longitude?, isDefault? }`
Validation: per [CODING_STANDARDS.md §3](./CODING_STANDARDS.md#3-dto--validation-rules); first address auto-defaults
Success (201): address
Notes: `isDefault: true` unsets previous default (transaction).

### GET /addresses/:id · PATCH /addresses/:id · DELETE /addresses/:id
Read / partial update / delete own address
DELETE Success (204) · Notes: deleting the default promotes the most recent remaining address; orders referencing it survive (`SetNull`).

### PATCH /addresses/:id/default
Set as default · Success (200): address · Notes: transactional unset-others.

---

## 5. Catalog — Categories & Sub-categories

### GET /categories
Public tree listing (with sub-categories, product counts) · Auth: Public
Success (200): `data: [{ id, name, slug, imageUrl, productCount, subCategories: [{ id, name, slug, productCount }] }]`
Notes: `productCount` values include ACTIVE products only.

### GET /categories/:slug
Category detail · Auth: Public
Success (200): `data: { id, name, slug, imageUrl, productCount, subCategories: [{ id, name, slug, productCount }] }`
Errors: 404 `RESOURCE_NOT_FOUND`
Notes: `productCount` values include ACTIVE products only.

### GET /admin/categories
Dashboard listing (paginated, with sub-categories) · Auth: Manager+
Query: `page, limit, search` (name/slug)
Success (200): `data: [{ id, name, slug, imageId, imageUrl, createdAt, subCategories: [{ id, name, slug }] }]`, pagination meta
Notes: ordered `createdAt` desc; `subCategories` name asc; `imageId`/`imageUrl` nullable.
Swagger: `List categories for administration` · `@ApiResponse` 200 · query/response DTOs documented

### POST /admin/categories
Create · Auth: Manager+ · Body: `{ name, imageId?, imageUrl? }`
Success (201) · Errors: 409 `DUPLICATE_RESOURCE` (name/slug)
Notes: slug server-generated.

### PATCH /admin/categories/:id · DELETE /admin/categories/:id
Update / delete · Auth: Manager+
DELETE Errors: 409 `FOREIGN_KEY_CONSTRAINT` (has sub-categories/products) · Success (204)
Notes: replacing image destroys the old Cloudinary asset.

### POST /admin/sub-categories · PATCH /admin/sub-categories/:id · DELETE /admin/sub-categories/:id
CRUD · Auth: Manager+ · Body (create): `{ name, categoryId }`
Errors: create/update 409 `DUPLICATE_RESOURCE`; delete 409 `FOREIGN_KEY_CONSTRAINT` (has products)

---

## 6. Catalog — Products

### GET /products
Storefront listing (ACTIVE only) · Auth: Public
Query: `page, limit, search?, category?, subCategory?` (slugs), `minPrice?, maxPrice?` (on priceAfterDiscount), `sizes?, colors?` (CSV), `featured?`, `sort?` ∈ `newest|price_asc|price_desc|best_selling|top_rated`
Success (200): `data: [productCard…]` + meta — card: `{ id, name, slug, imageUrl, price, discount, priceAfterDiscount, ratingsAverage, ratingsQuantity, featured, sizes, colors, quantity }`
Notes: `quantity` exposed for UX (low-stock badges); advisory only.

### GET /products/:slug
Product detail (ACTIVE only on this route) · Auth: Public
Success (200): `{ id, name, slug, description, imageUrl, price, discount, priceAfterDiscount, ratingsAverage, ratingsQuantity, featured, sizes, colors, quantity, category: { id, name, slug }, subCategories: [{ id, name, slug }], images: [{ id, imageId, imageUrl, sortOrder }] }`
Errors: 404 for DRAFT/ARCHIVED
Notes: `images[]` is sorted by `sortOrder asc`; money fields are JSON strings from Prisma Decimal serialization.

### GET /admin/products
Dashboard listing (all statuses) · Auth: Manager+
Query: `page, limit, search` (name/slug), `status?`, `categoryId?`, `featured?`
Success (200): `data: [{ id, name, slug, price, discount, priceAfterDiscount, quantity, sold, imageUrl, status, featured, createdAt, category: { id, name } }]`, pagination meta
Notes: ordered `createdAt` desc.
Swagger: `List products for administration` · `@ApiResponse` 200 · query/response DTOs documented

### GET /admin/products/filter-options
Category options for the dashboard list filter · Auth: Manager+
Success (200): `{ "categories": [{ "id", "name" }] }` (name asc)
Swagger: `Get product list filter options` · `@ApiResponse` 200 · response DTO documented

### GET /admin/products/form-data
Reference data for the create/edit product form · Auth: Manager+
Success (200): `{ "categories": [{ "id", "name" }], "subCategories": [{ "id", "name", "categoryId" }] }` (both name asc)
Swagger: `Get product form reference data` · `@ApiResponse` 200 · response DTO documented

### GET /admin/products/:id
Full product detail, any status · Auth: Manager+
Success (200): full product (`sold`, `ratingsAverage`, `ratingsQuantity`, timestamps included) + `category: { id, name, slug }` + `subCategories: [{ id, name }]` + `images[]` (sortOrder asc)
Swagger: `Get an administrative product detail` · `@ApiResponse` 200 · path param/detail DTO documented

### GET /admin/products/:id/form
Product in the shape the edit form consumes · Auth: Manager+
Success (200): `{ id, name, slug, description, price, discount, priceAfterDiscount, quantity, sizes, colors, imageId, imageUrl, status, featured, categoryId, subCategoryIds, images: [{ id, imageId, imageUrl, sortOrder }] }`
Notes: unlike the detail route this exposes Cloudinary `imageId`s and raw `categoryId`/`subCategoryIds`; gallery sortOrder asc.
Swagger: `Get a product in edit-form shape` · `@ApiResponse` 200 · path param/form DTO documented

### POST /admin/products
Create · Auth: Manager+
Body: `{ name, description, quantity, price, discount?, sizes[], colors[], imageId, imageUrl, status?, featured?, categoryId, subCategoryIds?[] }`
Validation: discount 0–70; subCategoryIds must belong to categoryId (422 `SUBCATEGORY_CATEGORY_MISMATCH`)
Success (201): product
Notes: slug + priceAfterDiscount computed server-side. **Never accept priceAfterDiscount/sold/ratings from clients.**

### PATCH /admin/products/:id
Partial update · Auth: Manager+
Request body: any subset of the create fields + optional `images[]` (`{ imageId, imageUrl, sortOrder? }`)
Notes: price/discount change recomputes priceAfterDiscount; existing carts/orders keep their snapshots; live cart totals reflect new price on next recompute. When `images[]` is sent, the gallery is **diffed by Cloudinary `imageId`** in one transaction: rows whose `imageId` is absent from the payload are deleted, matching rows are updated (`imageUrl`, `sortOrder`), new `imageId`s are created. When `subCategoryIds[]` is sent, the join set is reset (delete all, recreate). After commit, removed gallery assets and a replaced main `imageId` are destroyed in Cloudinary (best-effort — a Cloudinary failure never fails the request).

### DELETE /admin/products/:id
Delete, or auto-archive when referenced · Auth: Manager+
Success (200):
```json
{ "deleted": true,  "archived": false }
{ "deleted": false, "archived": true }
```
Notes: when any order/cart line references the product (checked up-front, and on FK-restriction failure as fallback) it is **not** deleted — `status = ARCHIVED`, `featured = false` are set instead and the response says so. A hard delete destroys the main image + all gallery assets in Cloudinary (best-effort). Idempotent; never returns 409.

### POST /admin/products/:id/duplicate
Duplicate a product as a draft · Auth: Manager+
Request body: —
Success (201): new product
Errors: 404 (source missing)
Notes: copies `description`, `price`, `discount`, `priceAfterDiscount`, `quantity`, `sizes`, `colors`, `categoryId` and sub-category joins; name = `"<source name> (copy)"`, slug from `"<source-slug>-copy"` de-duplicated; forces `status = DRAFT`, `featured = false`, blank images (`imageId`/`imageUrl` empty, no gallery rows). Single transaction.
Swagger: `Duplicate a product as a draft` · `@ApiResponse` 201/404 · path param/response DTO documented

### PATCH /admin/products/:id/featured
Toggle the featured flag · Auth: Manager+
Request body: `{ "featured": boolean }`
Success (200): `{ "id", "featured" }`
Swagger: `Set a product featured flag` · `@ApiResponse` 200 · path param/request DTOs documented

### PATCH /admin/products/:id/status
Set the product status directly · Auth: Manager+
Request body: `{ "status": "DRAFT" | "ACTIVE" | "ARCHIVED" }`
Success (200): `{ "id", "status" }`
Notes: no transition restrictions — any status can be set.
Swagger: `Set a product status` · `@ApiResponse` 200 · path param/request DTOs documented

### POST /admin/products/:id/images
Add gallery image · Auth: Manager+ · Body: `{ imageId, imageUrl, sortOrder? }` · Success (201)

### DELETE /admin/products/:id/images/:imageId
Remove gallery image (destroys Cloudinary asset) · Auth: Manager+ · Success (204)
Notes: `:imageId` is the **ProductImage row id** (cuid), not the Cloudinary public id; the row's Cloudinary asset is destroyed best-effort after the delete.

### PATCH /admin/products/:id/images/reorder
Body: `{ order: [imageRecordId…] }` · Auth: Manager+ · Success (200): images

### POST /admin/uploads/signature
Signed Cloudinary upload params for dashboard direct-upload · Auth: Manager+
Body: `{ folder: "products" | "categories" }` · Success (200): `{ signature, timestamp, apiKey, cloudName, folder, allowedFormats }`
Notes: signed params include `allowed_formats = "jpg,jpeg,png,webp"` and SHA-256 signature. Max file size (5 MB) is enforced by the dashboard/upload preset, not by the signature endpoint.

---

## 7. Reviews

### GET /products/:id/reviews
Public paginated list · Auth: Public · Query: `page, limit` · Success (200): `data: [{ id, title, ratings, user: { id, name }, createdAt }]`

### POST /products/:id/reviews
Create my review · Auth: User · Body: `{ title?, ratings }` (1.0–5.0, step .5)
Success (201) · Errors: 409 `REVIEW_EXISTS`; 404 product not ACTIVE
Notes: transactional aggregate recompute.

### PATCH /reviews/:id
Edit own review · Auth: User (owner) · Body: `{ title?, ratings? }` · Notes: recompute.

### DELETE /reviews/:id
Delete own review; ADMIN may delete any · Auth: User/Admin · Success (204) · Notes: recompute.

---

## 8. Wishlist (Auth: User)

### GET /wishlist
Success (200): `data: [{ product: card, addedAt, available }]`

### PUT /wishlist/:productId
Idempotent add · Success (200): `{ added: true }` (also 200 if already present)

### DELETE /wishlist/:productId
Idempotent remove · Success (204)

---

## 9. Cart (Auth: Optional — identity per [FEATURES.md §4](./FEATURES.md#4-cart))

Headers (anonymous): web → cookie `cart_session` (set by API); mobile → `X-Cart-Session`.

### GET /cart
Current cart (virtual empty if none) · Success (200):
```json
{ "id": "…|null", "items": [{ "id", "product": { "id","name","slug","imageUrl","priceAfterDiscount","quantity","status" }, "quantity", "color", "size", "price", "lineTotal" }],
  "totalCartPrice": "1300.00", "totalPriceAfterDiscount": "1105.00", "expiresAt": null }
```
Notes: triggers **auto-merge** when both JWT and anonymous token are present (idempotent; clears cookie via Set-Cookie).

### POST /cart/items
Add item (creates cart if none; may mint anonymous token) · Body: `{ productId, quantity, color?, size? }`
Validation: product ACTIVE; color/size ∈ product arrays (422 `INVALID_VARIANT`); total line qty ≤ stock
Success (201): cart (as GET) — first anonymous call also returns `sessionToken` in `data` and sets the cookie
Errors: 409 `INSUFFICIENT_STOCK` `errors:[{productId, requested, available}]`
Notes: same (product,color,size) increments the existing line; totals recomputed; sliding TTL refresh.

### PATCH /cart/items/:itemId
Change quantity · Body: `{ quantity }` (≥1) · Success (200): cart · Errors: 409 `INSUFFICIENT_STOCK`

### DELETE /cart/items/:itemId
Remove line · Success (200): cart

### DELETE /cart
Clear cart · Success (204) · Notes: anonymous cart row deleted; cookie cleared.

---

## 10. Coupons

### POST /coupons/validate
Preview a coupon against the current cart · Auth: Optional
Body: `{ code, email? }` (email used for the per-user check on guest flows)
Success (200): `{ "valid": true, "code": "SAVE20", "discountPercent": "20.00", "discountApplied": "221.00", "itemsSubtotal": "1105.00" }`
Errors: 404 unknown code; 422 `COUPON_EXPIRED` / `COUPON_INACTIVE`; 409 `COUPON_EXHAUSTED` / `COUPON_USER_LIMIT`
Notes: preview only — nothing is consumed; checkout revalidates.
Notes: if no userId and no `email` are available, the per-user-limit check is skipped; an empty/no cart still returns `valid: true` with `itemsSubtotal` and `discountApplied` as `"0.00"` when the code is otherwise eligible.

### GET /admin/coupons
Dashboard listing with lifecycle filter · Auth: Manager+
Query: `page, limit, search` (name), `status?` ∈ `active | expired | exhausted | deactivated`
Success (200): `data: [{ id, name, discount, usedCount, maxUsage, perUserLimit, expire, isActive, createdAt }]`, pagination meta
Notes: ordered `createdAt` desc. Lifecycle filter semantics (absent = no filter):

| `status` | Condition |
|---|---|
| `active` | `isActive` AND `expire > now` AND (`maxUsage = 0` OR `usedCount < maxUsage`) |
| `expired` | `expire <= now` |
| `exhausted` | `maxUsage > 0` AND `usedCount >= maxUsage` |
| `deactivated` | `isActive = false` |

Swagger: `List coupons for administration` · `@ApiResponse` 200 · query/response DTOs documented

### POST /admin/coupons · PATCH /admin/coupons/:id
Create / update · Auth: Manager+
Create body: `{ name, discount (1–70), maxUsage (0=∞), perUserLimit (0=∞, default 1), expire, isActive? }`
Validation: `name` must match `^[A-Z0-9_-]{3,30}$` after uppercase normalization; `expire` must be in the **future on create**; on update a past date is allowed (it effectively expires the coupon)
Errors: 409 `DUPLICATE_RESOURCE` (code already exists)
Notes: name normalized UPPERCASE; `usedCount` read-only.

### PATCH /admin/coupons/:id/deactivate
Soft-disable (`isActive = false`) · Auth: Manager+
Request body: —
Success (200): `{ "id", "isActive": false }`
Notes: there is no reactivate endpoint by design — create a new coupon instead.
Swagger: `Deactivate a coupon` · `@ApiResponse` 200 · path param documented

### DELETE /admin/coupons/:id
Hard-delete an **unused** coupon · Auth: Manager+
Success (204) when `usedCount = 0` · Errors: 409 `COUPON_IN_USE` when `usedCount > 0` → deactivate instead (order history must be preserved; DB `SetNull` protects it regardless).

---

## 11. Shipping

### GET /shipping/fee
Public fee lookup for pre-checkout display · Auth: Public
Query: `country, governorate, city?`
Success (200): `{ "fee": "65.00", "zone": { "country", "governorate", "city" } }`
Errors: 422 `SHIPPING_NOT_AVAILABLE`
Notes: most-specific active match; checkout recomputes internally (never trusts this call's client-side result).

### GET /admin/shipping-zones · POST /admin/shipping-zones · PATCH /admin/shipping-zones/:id · DELETE /admin/shipping-zones/:id
CRUD · Auth: Manager+ · Query on list: `page, limit, search?` (country/governorate/city) · Create body: `{ country, governorate, city?, fee, isActive? }`
Errors: 409 `DUPLICATE_RESOURCE` on (country, governorate, city)

---

## 12. Orders & Checkout

### POST /orders
Registered checkout — converts my cart into an order · Auth: User · Throttle 5/min
Body: `{ shippingAddressId, paymentMethod: "CASH"|"CARD", couponCode?, notes? }`
Validation: address belongs to me; cart non-empty; per-line validity; coupon pipeline
Success (201):
```json
{ "id":"…","humanOrderId":"ORD-000042","status":"PENDING","paymentMethod":"CARD",
  "items":[{ "productId","name","imageUrl","quantity":2,"color":"black","size":"M","price":"552.50","lineTotal":"1105.00" }],
  "itemsSubtotal":"1105.00","discountApplied":"221.00","shippingFees":"65.00","totalOrderPrice":"949.00",
  "isPaid":false,"createdAt":"…" }
```
Errors: 422 `CART_EMPTY` / `SHIPPING_NOT_AVAILABLE` / line-validation details; 409 `INSUFFICIENT_STOCK` / `COUPON_EXHAUSTED` / `COUPON_USER_LIMIT`
Notes: single transaction per [FEATURES.md §6](./FEATURES.md#6-orders--checkout); stock decremented atomically; cart cleared; `order.created` emitted; CARD → client proceeds to payment-session.

### POST /orders/guest
Anonymous checkout · Auth: Optional (anonymous cart token required) · Throttle 5/min
Body: `{ paymentMethod, couponCode?, notes?, contact: { name, phone, email }, shipping: { country, governorate, city, area, phone, addressLine1, details, postalCode?, latitude?, longitude? } }`
Success (201): order summary (as above) + `{ "claimToken": "sent-by-email" }` — token itself is **not** returned in the API response
Errors: as POST /orders + 422 when no anonymous cart
Notes: generates `guestToken` (30d) and emails the claim link to `contact.email`; coupon per-user limit keyed on email.

### GET /orders
My orders (claimed included) · Auth: User · Query: `page, limit, status?` · Success (200): summaries + meta

### GET /orders/:id
My order detail · Auth: User (owner) · Errors: 404 when not mine

### GET /orders/guest/:token
Guest confirmation-page fetch by claim token · Auth: Public · Throttle 10/min
Success (200): order detail (no other user data) · Errors: 404 `CLAIM_TOKEN_INVALID` (invalid OR expired — no oracle)

### POST /orders/claim
Attach a guest order to my account · Auth: User · Throttle 5/min
Body: `{ token }`
Success (200): claimed order · Errors: 404 `CLAIM_TOKEN_INVALID`
Notes: sets `userId` + `claimedByUserId`, nulls token; keeps `anon*` shipping snapshot; idempotency: re-claim of a consumed token → 404.

### POST /orders/:id/cancel
Self-cancel while PENDING + unpaid · Auth: User (owner)
Success (200): order (CANCELLED) · Errors: 409 `INVALID_STATUS_TRANSITION` (paid or past PENDING)
Notes: restores stock; releases coupon usage; emits `order.status_changed`.

### POST /orders/:id/payment-session
Create/reuse a Geidea Checkout session for a CARD order · Auth: User (owner) — or Public with `?token=<guestToken>` for guest orders · Throttle 5/min
Success (201): `{ "sessionId": "geidea-session-uuid", "amount": "949.00", "currency": "EGP" }`
Errors: 409 `ORDER_NOT_PAYABLE` (not CARD / not PENDING / already paid)
Notes: idempotent while the session is valid; amount always from `totalOrderPrice`. Client opens Geidea Checkout with `sessionId`; confirmation arrives ONLY via webhook.

### GET /admin/orders
All orders · Auth: Manager+
Query: `page, limit, status?, paymentMethod?, isPaid?, search?` (humanOrderId / customer name (`user.name`/`anonName`) / email (`user.email`/`anonEmail`) / phone), `from?, to?`
Success (200): `data: [{ id, humanOrderId, status, paymentMethod, isPaid, totalOrderPrice, createdAt, customerName, itemsCount }]`, pagination meta
Notes: `customerName` = `user.name ?? anonName ?? "Guest"`; ordered `createdAt` desc.
Swagger: `List orders for administration` · `@ApiResponse` 200 · query/response DTOs documented

### GET /admin/orders/:id
Full order detail · Auth: Manager+
Success (200): full order row + `user` (id/name/email/phone, null for guest) + `shippingAddress` (full row, null for guest) + all `anon*` shipping/contact fields + `coupon: { name, discount }` + `discountApplied` + payment refs (`geideaSessionId`, `geideaOrderId`) + `items: [{ id, quantity, color, size, price, lineTotal, product: { id, name, slug, imageUrl } }]`

### PATCH /admin/orders/:id/status
Transition status per the state machine · Auth: Manager+
Body: `{ status, notes? }` · Success (200): order
Errors: 409 `INVALID_STATUS_TRANSITION` (incl. same-status requests)
Notes: side effects (stock/coupon restore, `sold` decrement on REFUNDED, `isDelivered/deliveredAt`) per [FEATURES.md §6](./FEATURES.md#6-orders--checkout); `notes`, when present, overwrites the order's notes; emits `order.status_changed`; audit-logged.

### PATCH /admin/orders/:id/mark-paid
Mark a CASH order paid · Auth: Manager+
Success (200): order (`isPaid`, `paidAt`) · Errors: 409 when CARD (webhook-only) or already paid
Notes: one-way — there is no un-mark; corrections go through support/`verify-payment`. Increments `sold`; emits `order.paid`; audit-logged.

### POST /admin/orders/:id/verify-payment
Support tool: query Geidea for the order's real payment state and reconcile · Auth: Admin
Success (200): `{ "geideaStatus": "…", "reconciled": boolean }`

---

## 13. Notifications

### GET /notifications
My notifications · Auth: User · Query: `page, limit, read?`
Success (200): `data: [{ id, type, title, body, read, metadata, createdAt }]`, meta + `{ unreadCount }`

### PATCH /notifications/:id/read
Mark one read (owner) · Success (200)

### PATCH /notifications/read-all
Mark all read · Success (200): `{ "updated": n }`

### POST /admin/notifications/broadcast
PROMO broadcast to all active users · Auth: Admin
Body: `{ title, body, metadata? }` · Success (202): `{ "queued": true }` · Notes: batched inserts; type=`PROMO`.

---

## 14. Dashboard & Analytics (all Auth: **Admin** — MANAGER → 403 by design)

All values in this section are plain JSON **numbers** (chart/KPI inputs — see §0). **Status filter rule:** monetary sums and product-level sales aggregates (revenue, units sold) exclude `CANCELLED`/`REFUNDED` orders so all revenue figures reconcile with each other; order/redemption **counts** and discount totals include all statuses (match this asymmetry). Endpoint-specific exceptions are noted inline.

### GET /admin/dashboard/metrics
Single aggregate call for the dashboard home (one round trip) · Auth: Admin
Query params: — (all windows computed server-side from "now": **current** = start of current calendar month → now; **previous** = the full previous calendar month; `revenueByDay` = trailing 30 days)
Success (200):
```jsonc
{
  "revenue":       { "current": 45200.5, "previous": 39100 },
  "orders":        { "current": 88, "previous": 73 },
  "newCustomers":  { "current": 25, "previous": 19 },          // role USER, created in window
  "avgOrderValue": { "current": 513.6, "previous": 535.6 },    // revenue / orders, 0 when no orders
  "pendingOrders": 7,                                           // status = PENDING, all time
  "lowStockCount": 4,                                           // quantity < 10 AND status = ACTIVE
  "activeCoupons": 3,                                           // isActive AND expire > now AND not exhausted
  "ordersByStatus": [{ "status": "PENDING", "count": 7 }],      // all time
  "revenueByDay":  [{ "date": "2026-06-08", "revenue": 1240 }], // trailing 30 days, ISO dates, ascending
  "recentOrders":  [{ "id", "humanOrderId", "customerName", "status", "paymentMethod", "totalOrderPrice", "createdAt" }], // 10 most recent
  "topProducts":   [{ "id", "name", "imageUrl", "categoryName", "revenue", "units" }], // top 5 by all-time item revenue (qty × price snapshot), excl. CANCELLED/REFUNDED orders
  "lowStockProducts": [{ "id", "name", "quantity", "categoryName", "status" }]         // quantity < 10 AND ACTIVE, quantity asc, max 20
}
```
Swagger: `Get dashboard aggregate metrics` · `@ApiResponse` 200 · response DTO documented

### Shared analytics conventions (the five endpoints below)
Query: `from?, to?` (ISO `YYYY-MM-DD`; `end = endOfDay(to ?? now)`, `start = startOfDay(from ?? end − 30 days)`); range filters are on `order.createdAt` (or `user.createdAt` where noted).
Time-bucket grouping: span ≤ 60 days → `day`; ≤ 180 days → `week`; else `month` (`DATE_TRUNC`); buckets carry ISO `date` strings and the chosen `grouping` is echoed in the response — the client formats labels.

### GET /admin/analytics/sales
Success (200): `{ "totalRevenue", "totalOrders", "avgOrderValue", "totalDiscountApplied" (all statuses), "grouping", "revenueOverTime": [{ "date", "revenue" }], "ordersByStatus": [{ "status", "count" }], "paymentMethodSplit": [{ "method", "count" }] }` — all in range
Swagger: `Get sales analytics` · `@ApiResponse` 200 · query/response DTOs documented

### GET /admin/analytics/products
Success (200): `{ "totalUnitsSold" (order items in range), "activeProductsCount" (not range-bound), "outOfStockCount" (quantity = 0 AND ACTIVE, not range-bound), "topProducts": [{ "id", "name", "categoryName", "sold", "revenue" }] (top 10 by units in range; LEFT JOIN — zero-sale products may appear), "revenueByCategory": [{ "name", "revenue" }] (all categories, desc) }`
Notes: per-product/category revenue = `SUM(quantity × price snapshot)` over order items whose order is in range. All units/revenue aggregates here exclude `CANCELLED`/`REFUNDED` orders (§14 status filter rule — also matches `Product.sold`, which is decremented on refund).
Swagger: `Get product analytics` · `@ApiResponse` 200 · query/response DTOs documented

### GET /admin/analytics/customers
Success (200): `{ "totalCustomers" (role USER, all time), "newThisPeriod" (created in range), "activeThisPeriod" (≥ 1 order in range), "grouping", "newCustomersOverTime": [{ "date", "count" }], "topSpenders": [{ "id", "name", "email", "ordersCount", "totalSpent" }] (top 10 by spend in range, excl. CANCELLED/REFUNDED) }`
Swagger: `Get customer analytics` · `@ApiResponse` 200 · query/response DTOs documented

### GET /admin/analytics/coupons
Success (200): `{ "totalCoupons" (all time), "totalRedemptions" (orders with couponId in range, any status), "totalDiscountGiven" (sum discountApplied over those orders), "coupons": [{ "id", "name", "discountPct", "usedCount" (lifetime), "maxUsage", "expire", "periodRedemptions", "totalDiscountGiven" }] (EVERY coupon — LEFT JOIN — ordered by totalDiscountGiven desc) }`
Swagger: `Get coupon analytics` · `@ApiResponse` 200 · query/response DTOs documented

### GET /admin/analytics/geography
Success (200): `{ "rows": [{ "governorate", "orderCount", "revenue" }] }` ordered by orderCount desc
Notes: governorate = `COALESCE(shippingAddress.governorate, order.anonGovernorate)` — registered + guest orders merged per governorate; orders where both are null excluded; range on `order.createdAt`. Per the §14 status filter rule, `orderCount` includes all statuses while `revenue` excludes `CANCELLED`/`REFUNDED`.
Swagger: `Get geography analytics` · `@ApiResponse` 200 · query/response DTOs documented
