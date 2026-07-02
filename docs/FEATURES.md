# SG Couture — Feature Specifications

> **Status:** Living document · **Last updated:** 2026-07-03 · **Related:** [API_SPECIFICATION.md](./API_SPECIFICATION.md), [DATABASE.md](./DATABASE.md), [DEVELOPMENT_PHASES.md](./DEVELOPMENT_PHASES.md)
>
> This document describes **domain behavior**. Endpoint shapes live in API_SPECIFICATION.md — do not duplicate them here.

---

## 1. Identity, Sync & Authorization (Clerk)

**Purpose:** authenticate requests, keep a local user mirror, enforce roles.

**Workflow**
1. Clients authenticate with Clerk SDKs; every API call carries `Authorization: Bearer <Clerk JWT>`.
2. `ClerkAuthGuard` verifies the JWT (`@clerk/backend`, JWKS cached), loads the local `users` row by Clerk id, rejects if `active = false`.
3. `POST /webhooks/clerk` (Svix-verified) syncs `user.created` / `user.updated` / `user.deleted` into `users`.
4. Role lives in DB (source of truth). When ADMIN changes a role, the backend also writes it to Clerk `publicMetadata.role` so frontends can gate UI without an extra API call.

**Business rules**
- No register/login/password/refresh endpoints exist in this backend. Ever.
- Webhook is idempotent: `user.created` for an existing id = upsert; `user.deleted` for a missing id = no-op (200).
- A verified JWT whose user row doesn't exist yet (webhook lag) → guard performs a just-in-time sync from Clerk's API, then proceeds.
- Deactivation (`active = false`) blocks all authenticated routes with 403 `ACCOUNT_DISABLED`; ADMIN-only toggle.

**Permissions matrix (dashboard)**

| Capability | USER | MANAGER | ADMIN |
|---|---|---|---|
| Storefront APIs | ✅ | ✅ | ✅ |
| Catalog CRUD (categories, products, images) | ❌ | ✅ | ✅ |
| Coupons CRUD | ❌ | ✅ | ✅ |
| Shipping zones CRUD | ❌ | ✅ | ✅ |
| Orders: list/view all | ❌ | ✅ | ✅ |
| Orders: change status / mark CASH paid | ❌ | ❌ | ✅ |
| Customers table: view | ❌ | ✅ | ✅ |
| Customers: trigger Clerk password reset | ❌ | ✅ | ✅ |
| Users: change role / activate-deactivate | ❌ | ❌ | ✅ |
| Analytics / revenue overview | ❌ | ❌ | ✅ |

Edge cases: ADMIN cannot demote or deactivate themselves (409 `SELF_MODIFICATION_FORBIDDEN`); MANAGER password-reset trigger applies only to `role = USER` accounts.

---

## 2. Catalog (Categories, Sub-categories, Products)

**Purpose:** the merchandise tree and product data powering the storefront.

**Business rules**
- Slugs are generated server-side (slugify name, `-2` suffix on collision); clients never send slugs.
- SubCategory belongs to one Category; a Product's sub-categories **must** belong to the product's primary category (422 `SUBCATEGORY_CATEGORY_MISMATCH`).
- `priceAfterDiscount` recomputed server-side on every product write; `discount` ∈ [0, 70].
- Storefront listing returns only `status = ACTIVE`; dashboard listing returns all statuses.
- Deleting a Category/SubCategory with products → 409 (Prisma `Restrict`). Deleting a Product referenced by any cart/order line → 409 `PRODUCT_IN_USE` with guidance to archive.
- Image lifecycle: upload to Cloudinary via `UploadsService` (signed upload); on replace/delete, the old Cloudinary asset is destroyed by `imageId`. Gallery order = `sortOrder`.

**Storefront product listing** supports: pagination, `search` (name/description, `contains`, case-insensitive), `category`/`subCategory` (slug), `minPrice`/`maxPrice` (against `priceAfterDiscount`), `sizes`/`colors` (array overlap), `featured`, `sort` (`newest` default, `price_asc`, `price_desc`, `best_selling`, `top_rated`).

Edge cases: archiving a product does **not** remove it from existing carts — it fails validation at checkout (see §6); wishlist/cart lines pointing to ARCHIVED products are returned flagged `available: false`.

---

## 3. Reviews, Ratings & Wishlist

**Reviews**
- One review per (user, product) — `@@unique`; second attempt → 409 `REVIEW_EXISTS` (client should PATCH instead).
- `ratings` ∈ 1.0–5.0, step 0.5 validated in DTO.
- On every create/update/delete, recompute inside the same transaction:
  `ratingsQuantity = count`, `ratingsAverage = round(avg, 1)` (null when count = 0).
- Users edit/delete their own review; ADMIN can delete any (moderation).

**Wishlist**
- Idempotent add (upsert) / remove (delete-if-exists → 204 either way).
- Listing joins product cards; ARCHIVED/DRAFT products flagged `available: false`.
- Wishlist is registered-users-only (anonymous wishlist stays client-side by design).

---

## 4. Cart

**Purpose:** server-owned cart for guests and users; the only object checkout reads from.

### Identity resolution (decided — see [ADR-0004](./ADR/ADR-0004-anonymous-cart-and-merge.md))

- **Registered:** cart keyed by `userId` (created lazily on first mutation).
- **Anonymous:** on first cart mutation without auth, backend generates `sessionToken` (UUID v4) and creates the cart with `expiresAt = now() + 7 days`.
  - **Web:** token delivered as httpOnly, Secure, SameSite=Lax cookie `cart_session` (set by the API; also returned in body once).
  - **Mobile:** token returned in the response body; app stores it in secure storage and sends `X-Cart-Session: <token>` on subsequent cart/checkout calls.
  - Resolution order per request: valid Clerk JWT → user cart; else cookie/header token → anonymous cart; else no cart (GET returns an empty virtual cart, mutations create one).
- `expiresAt` is **sliding**: refreshed to now+7d on every mutation. Daily cron deletes expired carts.

### Merge on login

Triggered automatically on the **first authenticated cart request** that also carries an anonymous token (guard detects both identities):

1. Load both carts. If user has no cart → re-key the anonymous cart to the user (`userId` set, `sessionToken`/`expiresAt` nulled). Done.
2. Else merge item-by-item into the user cart: same `(productId, color, size)` → quantities summed, capped at current product stock; distinct lines appended.
3. Recompute totals from live prices; delete the anonymous cart; instruct web client to clear the cookie (Set-Cookie expiry).

Merge is idempotent — a replayed request finds no anonymous cart and no-ops.

### Mutations & totals

- Add item: product must be `ACTIVE`; `color`/`size` must be members of the product arrays (422 otherwise); requested `quantity` (existing line + new) must be ≤ `Product.quantity` (409 `INSUFFICIENT_STOCK` with `available` in error details). Line `price` snapshots current `priceAfterDiscount`.
- Update quantity: same stock cap; quantity 0 is rejected (use delete).
- Every mutation recomputes `totalCartPrice = Σ(live price × qty)` and `totalPriceAfterDiscount = Σ(live priceAfterDiscount × qty)` in the same transaction.
- Cart **stock checks are advisory** — real reservation happens only at checkout (two customers can hold the same last unit in their carts; first checkout wins).

---

## 5. Coupons

**Purpose:** percentage promo codes with global and per-user limits.

**Validation pipeline** (used by `POST /coupons/validate` preview and re-run inside checkout):
1. Normalize code to UPPERCASE, find coupon.
2. `isActive = true`; `expire > now()`.
3. Global limit: `maxUsage = 0` OR `usedCount < maxUsage`.
4. Per-user limit (`perUserLimit = 0` = unlimited): count `CouponUsage` rows for this `userId` (registered) or `anonEmail` (guest checkout) — must be `< perUserLimit`.
5. Compute `discountApplied = round(itemsSubtotal × discount/100, 2)` where itemsSubtotal already reflects product-level discounts. **Coupons never discount shipping.**

**Consumption:** inside the order-creation transaction: `updateMany({ where: { id, OR: [{maxUsage: 0}, {usedCount: { lt: maxUsage }}] }, data: { usedCount: { increment: 1 } } })` — count 0 → 409 `COUPON_EXHAUSTED` (race-safe) — plus a `CouponUsage` row (unique per order).

**Release:** if the order is CANCELLED **before payment** (user cancel of pending CARD, admin cancel, or auto-expiry): decrement `usedCount`, delete the usage row. Cancelling/refunding after payment does not release usage.

Edge cases: guest order claimed by a user → usage row keeps `anonEmail` (no transfer; prevents limit-evasion loops). Coupon deletion is blocked if orders reference it → deactivate instead (`isActive = false`); DB `SetNull` protects history regardless.

---

## 6. Orders & Checkout

**Purpose:** convert a cart into an order with correct money and stock, for registered and anonymous customers.

### Checkout workflow (single transaction, both modes)

1. **Resolve cart** (user or sessionToken). Empty cart → 422 `CART_EMPTY`.
2. **Validate lines:** every product `ACTIVE`; color/size still valid. Violations → 422 with per-line details (client refreshes cart).
3. **Shipping fee:** look up ShippingZone by destination (registered: chosen Address must belong to the user; anonymous: `anon*` body fields). No active zone → 422 `SHIPPING_NOT_AVAILABLE`.
4. **Coupon (optional):** full validation pipeline (§5) + atomic consumption.
5. **Stock reservation (the concurrency guarantee — [ADR-0003](./ADR/ADR-0003-stock-reservation-strategy.md)):** for each line, atomic conditional decrement:
   `UPDATE products SET quantity = quantity - :qty WHERE id = :id AND quantity >= :qty`
   Any line affecting 0 rows → **whole transaction rolls back** → 409 `INSUFFICIENT_STOCK` listing the failed lines, and the other customer is never charged. This is what makes "two carts, one unit, simultaneous checkout" safe: Postgres row locking serializes the two updates; exactly one succeeds.
6. **Create order** + items (price snapshots from live `priceAfterDiscount`), `humanOrderId` from sequence, `totalOrderPrice = itemsSubtotal − discountApplied + shippingFees`.
   - Anonymous: generate `guestToken` (32-byte random hex), `guestTokenExpiresAt = now() + 30 days`.
7. **Clear the cart** (delete anonymous cart / empty user cart).
8. **After commit:** emit `order.created` → Resend confirmation email (guest email includes the claim link `https://<storefront>/orders/claim?token=…`); CARD orders proceed to payment session (§7).

### Payment method semantics

| | CASH (on delivery) | CARD (Geidea) |
|---|---|---|
| `isPaid` set by | ADMIN action (typically after delivery) | Geidea webhook only |
| Post-checkout | order proceeds to fulfillment | client requests a payment session and opens Geidea Checkout |
| If never paid | admin manages | cron cancels PENDING unpaid CARD orders after **60 min** → stock + coupon released |

`sold` is incremented when `isPaid` flips to true (webhook / admin), decremented on REFUNDED.

### Status state machine (ADMIN-only transitions)

```
PENDING → PROCESSING → SHIPPED → DELIVERED → REFUNDED
   │            │
   └──────┬─────┘
          ▼
      CANCELLED
```

- `PENDING/PROCESSING → CANCELLED`: allowed; restores stock; releases coupon if unpaid; if paid (CARD), refund is executed in Geidea dashboard and status should then be REFUNDED, not CANCELLED.
- `DELIVERED` sets `isDelivered = true`, `deliveredAt = now()`; requires `isPaid = true` for CASH orders (payment collected on delivery) — admin marks paid + delivered together.
- `DELIVERED → REFUNDED`: restores stock, decrements `sold`; money movement is manual in Geidea dashboard for now (see DATABASE.md Assumptions §4).
- Any other transition → 409 `INVALID_STATUS_TRANSITION`.
- Registered users may cancel their **own** order only while `PENDING` and unpaid (`POST /orders/:id/cancel`).

### Guest order claiming

1. Guest checkout email contains the claim link with `guestToken`.
2. An **authenticated** user calls `POST /orders/claim { token }`.
3. Valid + unexpired token → order gets `userId = current user`, `claimedByUserId = current user` (audit), `guestToken` nulled. `anon*` snapshot fields are kept (they are the shipping record).
4. Expired/invalid → 404 `CLAIM_TOKEN_INVALID` (no oracle about which).

Order visibility: users see orders where `userId = me`. Guests can fetch a single order by `guestToken` (`GET /orders/guest/:token`) for the confirmation page.

---

## 7. Payments (Geidea)

**Purpose:** card payments via Geidea Checkout (hosted payment page) — backend never touches card data.

**Flow**
1. Client (after CARD checkout) calls `POST /orders/:id/payment-session`. Preconditions: order is mine (or matching guest token), CARD, PENDING, unpaid.
2. Backend calls Geidea *create session* (amount = `totalOrderPrice`, currency `EGP`, `merchantReferenceId = order.id`, `callbackUrl` = our webhook, signed with timestamp per Geidea spec). Stores `geideaSessionId`. Re-request while a session is still valid returns the same session (idempotent).
3. Client opens Geidea Checkout with the session id (JS SDK on web / WebView on mobile). Return/redirect URLs are **UX only**.
4. Geidea POSTs the callback to `POST /webhooks/geidea`. Backend: verify signature → verify amount & currency match the order → on success: `isPaid = true`, `paidAt`, store `geideaOrderId`, increment `sold`, emit `order.paid` (email + notification). Failure/cancel callbacks are logged; order stays PENDING until paid or expired by cron.
5. Idempotency: webhook handling is keyed on `geideaOrderId` + order state — replays no-op.

**Rules**
- Never mark paid from a client redirect. Webhook is the only writer (plus a manual admin re-verify endpoint that queries Geidea, for support cases).
- Amount mismatch in callback → log `CRITICAL`, do not mark paid, alert.
- Refunds: manual via Geidea dashboard at MVP; API-automated refund is a Future Enhancement.

---

## 8. Shipping

- Fee lookup from `ShippingZone` (DATABASE.md §4.3): most specific active match (country+governorate+city → country+governorate). Public endpoint lets the storefront show fees pre-checkout; checkout recomputes internally.
- MANAGER/ADMIN CRUD zones. Unique (country, governorate, city).
- **Bosta integration (future):** `ShippingService` exposes `getFee(destination)` and later `createShipment(order)`; Bosta implements the same interface behind a feature flag.

---

## 9. Notifications

- In-app rows created by event listeners: `order.paid`, `order.status_changed` (SHIPPED, DELIVERED, CANCELLED, REFUNDED) → notification for the order's user (skipped for unclaimed guest orders — they get email only).
- `PROMO` broadcast: ADMIN endpoint fans out a notification to all active users (batched inserts).
- User endpoints: list (paginated, `read` filter + unread count in meta), mark one read, mark all read.
- **FCM push (future phase):** DeviceToken model + mirror pushes; in-app remains the source of truth.

---

## 10. Emails (Resend)

| Trigger | To | Content |
|---|---|---|
| `order.created` (registered) | user email | Confirmation + order summary |
| `order.created` (guest) | `anonEmail` | Confirmation + **claim link** (`guestToken`, 30-day validity note) |
| `order.paid` | purchaser | Payment receipt |
| `order.status_changed` → SHIPPED / DELIVERED / CANCELLED / REFUNDED | purchaser | Status update |
| MANAGER "reset password" on a customer | customer | Clerk-initiated reset email (via Clerk API, not Resend) |

Email sending is **post-commit and non-blocking**: failures are logged + retried (3 attempts, exponential backoff); they never fail the originating request.

---

## 11. Analytics (ADMIN only)

MVP dashboard overview endpoint(s): revenue (paid orders) by period, order counts by status, top-selling products, low-stock list (`quantity ≤ threshold`), new customers by period. Read-only aggregations; heavier BI is out of scope.

---

## 12. Future Enhancements (out of current scope)

- Bosta shipping integration (rates + shipment creation + tracking webhooks)
- FCM push notifications (DeviceToken model)
- Automated Geidea refunds via API
- Verified-purchase gating + comments on reviews
- Address snapshot copied onto orders at checkout
- SKU-level variant stock (per size/color)
- Redis caching + distributed rate limiting
- Multi-language product content (AR/EN)
- Invoice PDF generation → Cloudinary
- Search upgrade (Postgres FTS or Meilisearch)
