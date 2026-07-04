# SG Couture — API Specification

> **Status:** Living document · **Last updated:** 2026-07-05 · **Base URL:** `/api/v1` · **Related:** [FEATURES.md](./FEATURES.md) (business rules), [CODING_STANDARDS.md](./CODING_STANDARDS.md) (envelope, validation, error codes)
>
> 🤖 **Claude Code:** every new/changed endpoint MUST be documented here using the template below, in the correct section, before the task is considered done — **and** MUST carry `@nestjs/swagger` decorators in code (`@ApiTags`/`@ApiOperation`/`@ApiResponse` on the controller, `@ApiProperty` on DTOs), applied via the `nestjs-swagger` skill, so it appears in the Swagger UI at `/api/docs`.

## 0. Conventions & Endpoint Template

- All responses use the **global envelope** (`status/message/data/meta` on success; `status/message/code/errors` on error) — examples below show the `data` payload only unless the envelope matters.
- All list endpoints accept `page` (default 1) and `limit` (default 20, max 100) and return pagination `meta`.
- **Auth legend:** `Public` · `Optional` (guest or user) · `User` (Clerk JWT) · `Manager+` · `Admin`.
- **Common errors apply everywhere and are not repeated per endpoint:** `401 UNAUTHENTICATED` (protected routes), `403 FORBIDDEN`/`ACCOUNT_DISABLED`, `404 RESOURCE_NOT_FOUND` (any `:id`), `422 VALIDATION_ERROR` (any DTO), `429 RATE_LIMITED`, `500 INTERNAL_ERROR`.

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
Path/Query/Body: — · Validation: —
Success (200): `{ "app": "up", "database": "up" }`
Errors: 503 `SERVICE_UNAVAILABLE` when DB unreachable
Notes: throttler-exempt.

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

### PATCH /users/me
Update own profile (name, phone) · Auth: User
Request body: `{ "name?", "phone?" }` · Validation: name ≤ 120; phone EG format, unique
Success (200): updated profile
Errors: 409 `DUPLICATE_RESOURCE` (phone taken)
Notes: email/role are NOT editable here; name/phone also pushed to Clerk.

### GET /admin/users
Customer/user table · Auth: Manager+
Query: `page, limit, search` (name/email/phone), `role?`, `active?`
Success (200): `data: [user…]`, pagination meta
Notes: MANAGER sees the table; mutation endpoints below stay ADMIN except reset-password.

### GET /admin/users/:id
User detail (+ order count, last order) · Auth: Manager+
Success (200): user + `stats: { ordersCount, lastOrderAt }`

### PATCH /admin/users/:id/role
Change role · Auth: **Admin**
Request body: `{ "role": "USER" | "MANAGER" | "ADMIN" }`
Success (200): updated user
Errors: 409 `SELF_MODIFICATION_FORBIDDEN`
Notes: mirrors role to Clerk `publicMetadata.role`; audit-logged.

### PATCH /admin/users/:id/status
Activate/deactivate · Auth: **Admin**
Request body: `{ "active": boolean }`
Errors: 409 `SELF_MODIFICATION_FORBIDDEN`
Notes: deactivated users are 403 everywhere; audit-logged.

### POST /admin/users/:id/reset-password
Trigger a Clerk password-reset email for a customer · Auth: Manager+
Request body: —
Success (200): `{ "sent": true }`
Errors: 409 `FORBIDDEN_TARGET` when target role ≠ USER
Notes: executed via Clerk API; this backend never sees passwords.

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
Success (200): `data: [{ id, name, slug, imageUrl, subCategories: [...] }]`

### GET /categories/:slug
Category detail · Auth: Public

### POST /categories
Create · Auth: Manager+ · Body: `{ name, imageId?, imageUrl? }`
Success (201) · Errors: 409 `DUPLICATE_RESOURCE` (name/slug)
Notes: slug server-generated.

### PATCH /categories/:id · DELETE /categories/:id
Update / delete · Auth: Manager+
DELETE Errors: 409 `FOREIGN_KEY_CONSTRAINT` (has sub-categories/products) · Success (204)
Notes: replacing image destroys the old Cloudinary asset.

### POST /sub-categories · PATCH /sub-categories/:id · DELETE /sub-categories/:id
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
Success (200): full product + `images[]` (sorted) + category/subCategories
Errors: 404 for DRAFT/ARCHIVED

### GET /admin/products
Dashboard listing (all statuses) · Auth: Manager+ · Query: as public + `status?`

### POST /products
Create · Auth: Manager+
Body: `{ name, description, quantity, price, discount?, sizes[], colors[], imageId, imageUrl, status?, featured?, categoryId, subCategoryIds?[] }`
Validation: discount 0–70; subCategoryIds must belong to categoryId (422 `SUBCATEGORY_CATEGORY_MISMATCH`)
Success (201): product
Notes: slug + priceAfterDiscount computed server-side. **Never accept priceAfterDiscount/sold/ratings from clients.**

### PATCH /products/:id
Partial update · Auth: Manager+ · Notes: price/discount change recomputes priceAfterDiscount; existing carts/orders keep their snapshots; live cart totals reflect new price on next recompute.

### DELETE /products/:id
Delete or reject · Auth: Manager+
Success (204) only when no cart/order lines reference it · Errors: 409 `PRODUCT_IN_USE` → archive instead (`PATCH status: ARCHIVED`)

### POST /products/:id/images
Add gallery image · Auth: Manager+ · Body: `{ imageId, imageUrl, sortOrder? }` · Success (201)

### DELETE /products/:id/images/:imageId
Remove gallery image (destroys Cloudinary asset) · Auth: Manager+ · Success (204)

### PATCH /products/:id/images/reorder
Body: `{ order: [imageRecordId…] }` · Auth: Manager+ · Success (200): images

### POST /admin/uploads/signature
Signed Cloudinary upload params for dashboard direct-upload · Auth: Manager+
Body: `{ folder: "products" | "categories" }` · Success (200): `{ signature, timestamp, apiKey, cloudName, folder }`
Notes: constraints (type/size) embedded in signed params.

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

### GET /admin/coupons · POST /admin/coupons · PATCH /admin/coupons/:id · DELETE /admin/coupons/:id
CRUD · Auth: Manager+
Create body: `{ name, discount (1–70), maxUsage (0=∞), perUserLimit (0=∞, default 1), expire, isActive? }`
Delete: 204, or 409 `FOREIGN_KEY_CONSTRAINT`-style guidance when orders reference it → deactivate instead
Notes: name normalized UPPERCASE; `usedCount` read-only.

---

## 11. Shipping

### GET /shipping/fee
Public fee lookup for pre-checkout display · Auth: Public
Query: `country, governorate, city?`
Success (200): `{ "fee": "65.00", "zone": { "country", "governorate", "city" } }`
Errors: 422 `SHIPPING_NOT_AVAILABLE`
Notes: most-specific active match; checkout recomputes internally (never trusts this call's client-side result).

### GET /admin/shipping-zones · POST /admin/shipping-zones · PATCH /admin/shipping-zones/:id · DELETE /admin/shipping-zones/:id
CRUD · Auth: Manager+ · Create body: `{ country, governorate, city?, fee, isActive? }`
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
All orders · Auth: Manager+ · Query: `page, limit, status?, paymentMethod?, isPaid?, search?` (humanOrderId/email/phone), `from?, to?`

### GET /admin/orders/:id
Full order detail incl. anon fields, coupon, payment refs · Auth: Manager+

### PATCH /admin/orders/:id/status
Transition status per the state machine · Auth: **Admin**
Body: `{ status }` · Success (200): order
Errors: 409 `INVALID_STATUS_TRANSITION`
Notes: side effects (stock/coupon restore, `sold` decrement on REFUNDED, `isDelivered/deliveredAt`) per [FEATURES.md §6](./FEATURES.md#6-orders--checkout); emits `order.status_changed`; audit-logged.

### PATCH /admin/orders/:id/mark-paid
Mark a CASH order paid · Auth: **Admin**
Success (200): order (`isPaid`, `paidAt`) · Errors: 409 when CARD (webhook-only) or already paid
Notes: increments `sold`; emits `order.paid`; audit-logged.

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

## 14. Analytics

### GET /admin/analytics/overview
Dashboard overview · Auth: **Admin** (MANAGER → 403 by design)
Query: `from?, to?` (default last 30 days)
Success (200): `{ "revenue": "…", "ordersByStatus": {…}, "topProducts": […], "lowStock": […], "newCustomers": n }`
Notes: revenue counts **paid** orders only.
