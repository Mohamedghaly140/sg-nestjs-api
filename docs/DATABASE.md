# SG Couture — Database Design

> **Status:** Living document · **Last updated:** 2026-07-03 · **Source of truth:** `prisma/schema.prisma` · **Related:** [FEATURES.md](./FEATURES.md), [ADR-0003](./ADR/ADR-0003-stock-reservation-strategy.md)
>
> ⚠️ Any change to `schema.prisma` MUST be reflected here (and in CHANGELOG.md) in the same task.

## 1. Conventions

- **IDs:** `cuid()` strings, except `User.id` which is the **Clerk user ID**.
- **Table naming:** models map to camelCase table names via `@@map` (`users`, `productImages`, …).
- **Timestamps:** `createdAt @default(now())` + `updatedAt @updatedAt` on all aggregate roots. Intentionally absent on line-item/join tables (`ProductImage`, `CartItem`, `OrderItem`, `ProductSubCategory`) — their lifecycle is owned by the parent.
- **Money:** `Decimal @db.Decimal(10, 2)`, EGP. Percentages: `Decimal(5, 2)`. Ratings: `Decimal(2, 1)`.
- **No soft delete.** Products are retired via `status = ARCHIVED`; users via `active = false`. History-bearing rows (orders) survive parent deletion via `SetNull`.
- **Deletion semantics:**
  - `Cascade` — owned children die with the owner (addresses, reviews, cart items, notifications…)
  - `Restrict` — protect referenced catalog/history (can't delete a Category with products, can't delete a Product that exists in any cart/order line)
  - `SetNull` — orders keep existing when user/address/coupon is deleted

## 2. Enums

| Enum | Values | Notes |
|---|---|---|
| `Role` | `USER`, `MANAGER`, `ADMIN` | Authorization tier; DB is source of truth, mirrored to Clerk `publicMetadata.role` |
| `OrderStatus` | `PENDING`, `PROCESSING`, `SHIPPED`, `DELIVERED`, `CANCELLED`, `REFUNDED` | See state machine in [FEATURES.md §Orders](./FEATURES.md#6-orders--checkout) |
| `PaymentMethod` | `CASH`, `CARD` | CASH = cash on delivery; CARD = Geidea Checkout |
| `ProductStatus` | `DRAFT`, `ACTIVE`, `ARCHIVED` | Only `ACTIVE` products are visible/purchasable on the storefront |

## 3. Models

### 3.1 User (`users`)

Mirror of Clerk identity. **Clerk owns identity; this table owns app-level relations and the authoritative role.**

| Field | Type | Constraints | Meaning |
|---|---|---|---|
| `id` | String | `@id` | **Clerk user ID** (e.g. `user_2ab…`) — not generated locally |
| `email` | String | unique | Synced from Clerk primary email |
| `name` | String | required | Synced from Clerk (first + last) |
| `phone` | String | unique | Synced from Clerk / collected at onboarding |
| `role` | Role | default USER | Authorization tier; changed only by ADMIN; mirrored to Clerk metadata on change |
| `active` | Boolean | default true | Deactivated users get 403 on every authenticated route |

Relations: `addresses[]`, `orders[]`, `reviews[]`, `cart?` (1:1), `wishlist[]`, `notifications[]`.

**Lifecycle:** created/updated/deleted exclusively by the Clerk webhook (`user.created`, `user.updated`, `user.deleted`). On `user.deleted`: row is deleted → cascades remove addresses/reviews/cart/wishlist/notifications; orders survive with `userId = NULL`.

**Validation notes:** `phone` unique means Clerk sign-ups without a phone need a phone-collection step before checkout-related features; webhook sync must handle missing phone (see Assumptions §7).

### 3.2 Address (`addresses`)

Saved shipping addresses for registered users. Egypt-shaped hierarchy: `country → governorate → city → area`.

Key points: `postalCode`, `latitude`, `longitude` optional; `isDefault` — **business rule:** at most one default per user, enforced in service (transaction: unset others, set target). `onDelete: Cascade` from User; Orders reference addresses with `SetNull`, so deleting an address never breaks order history (order also keeps no address snapshot — see Assumptions §3).

### 3.3 Category (`categories`) & SubCategory (`subCategories`)

Two-level taxonomy. `name` and `slug` unique on both. `imageId/imageUrl` (Cloudinary) optional on Category.
- `SubCategory.category` — `Restrict`: a category with sub-categories/products cannot be deleted (must be emptied first).
- Product belongs to exactly **one Category** (primary) and **0..n SubCategories** via `ProductSubCategory` join (`Cascade` both sides).
- **Business rule:** a product's sub-categories must belong to its primary category (service-level validation).

### 3.4 Product (`products`)

| Field | Meaning / Rule |
|---|---|
| `slug` | unique, generated from `name` server-side (slugify + collision suffix) |
| `quantity` | Available stock. Mutated **only** via atomic conditional updates ([ADR-0003](./ADR/ADR-0003-stock-reservation-strategy.md)) |
| `sold` | Lifetime units sold; incremented when an order is **paid**, decremented on refund |
| `price` | Base price (EGP) |
| `discount` | Percentage 0–70; validated server-side |
| `priceAfterDiscount` | **Computed server-side** on every create/update: `round(price × (1 − discount/100), 2)`. Never accepted from clients. This is the price used by carts/orders |
| `sizes` / `colors` | Attribute options (strings). Not SKU-level variants: stock is per-product, not per size/color combination |
| `imageId/imageUrl` | Cover image (Cloudinary, required) |
| `ratingsAverage` / `ratingsQuantity` | Denormalized aggregates recomputed by ReviewsService after every review insert/update/delete |
| `status` | Storefront only shows/sells `ACTIVE`. `DRAFT` = being authored, `ARCHIVED` = retired (kept for order history) |
| `featured` | Storefront curation flag |

`category` — `Restrict`. `cartItems`/`orderItems` reference Product with `Restrict`: products that live in any cart/order line cannot be hard-deleted → **archive instead** (delete endpoint returns 409 with guidance if referenced).

### 3.5 ProductImage (`productImages`)

Gallery images. `sortOrder` ascending defines display order. `Cascade` with product. `imageId/imageUrl` nullable to allow reserving slots during multi-step uploads (service should never persist a row with both null after upload completes).

### 3.6 UserWishlist

Pure M:N join `@@id([userId, productId])`, `addedAt` timestamp, `Cascade` both sides. Adding an existing pair is a no-op (idempotent upsert).

### 3.7 Review (`reviews`)

One review per user per product (`@@unique([userId, productId])`). `ratings` Decimal(2,1) in **1.0–5.0**. `title` optional-ish (defaults `""`). Only users can review; edit/delete own review; ADMIN may delete any (moderation). Every mutation triggers aggregate recompute on the product inside the same transaction.

**Assumption (see §7):** reviews do not require a delivered purchase. Flagged for product decision; current scope = any authenticated user.

### 3.8 Cart (`carts`) & CartItem (`cartItems`)

Server-owned cart, two modes:

| Mode | `userId` | `sessionToken` | `expiresAt` |
|---|---|---|---|
| Registered | set (unique → 1 cart per user) | null | null |
| Anonymous | null | set (unique, backend-generated UUID) | now + 7 days, **sliding** (refreshed on every mutation) |

`totalCartPrice` / `totalPriceAfterDiscount` — recomputed server-side on **every** cart mutation from current `Product.price` / `Product.priceAfterDiscount`. DB check-style invariant (service-enforced): exactly one of `userId` / `sessionToken` is set.

`CartItem`: `quantity ≥ 1`, optional `color`/`size` (must be members of the product's arrays), `price` = snapshot of `priceAfterDiscount` at add-time (display/analytics only — totals always use live prices; checkout uses live prices). Same product + color + size = one line (quantity increments). `product` is `Restrict`.

No coupon field on Cart: **coupons apply at checkout only**, not stored on carts.

### 3.9 Coupon (`coupons`)

Percentage discount codes. `name` unique, stored **UPPERCASE**. `discount` 1–70 (%). `maxUsage` 0 = unlimited; `usedCount` incremented atomically at order creation, decremented when an order is cancelled before payment. `expire` = expiry datetime; `isActive` = kill switch. Discount applies to the **items subtotal (after product discounts)**, never to shipping fees.

> ⚠️ **Schema change required** for the per-user limit — see §4.2.

### 3.10 Order (`orders`) & OrderItem (`orderItems`)

Immutable-ish record of a purchase. Two creation modes:

- **Registered:** `userId` + `shippingAddressId` set; all `anon*` null.
- **Anonymous:** `userId`/`shippingAddressId` null; `anonName/anonPhone/anonEmail` + `anonCountry…anonLongitude` set; `guestToken` (+ `guestTokenExpiresAt`, 30 days) generated and emailed for later claiming.

Key fields:

| Field | Rule |
|---|---|
| `humanOrderId` | `ORD-000001` — from a dedicated Postgres sequence (§4.4), assigned in the creation transaction |
| `status` | Transitions **ADMIN-only** via the documented state machine |
| `paymentMethod` | CASH → `isPaid` flipped manually by ADMIN; CARD → flipped **only** by verified Geidea webhook |
| `shippingFees` | Computed at checkout from ShippingZone lookup (§4.3), snapshotted |
| `totalOrderPrice` | Server-computed: `Σ(item.price × qty) − discountApplied + shippingFees` |
| `discountApplied` | Absolute EGP amount derived from coupon % at checkout time |
| `isPaid/paidAt`, `isDelivered/deliveredAt` | Set by webhook/admin actions; `isDelivered` set when status → DELIVERED |
| `guestToken` | unique, crypto-random; claiming sets `userId` + `claimedByUserId` (audit) and nulls the token |
| `claimedByUserId` | Audit trail of who claimed a guest order (kept even though `userId` is set) |

`OrderItem.price` = snapshot of `priceAfterDiscount` **at order time** (authoritative for the order total forever). `product` is `Restrict` (order history protects products from deletion).

> ⚠️ **Schema change required:** replace Stripe field with Geidea fields — see §4.1.

### 3.11 Notification (`notifications`)

In-app notifications. `type` string (`ORDER_SHIPPED`, `ORDER_DELIVERED`, `ORDER_PAID`, `PROMO`, …), `metadata Json?` for deep-link payloads (e.g. `{ orderId }`). `@@index([userId, read])` supports the unread-badge query. Created by event listeners on order lifecycle events; FCM push mirrors these later.

## 4. Required Schema Changes (Migration 001 — before Phase 6/7)

The provided schema was written against Stripe and without per-user coupon limits or shipping zones. Apply these changes; each is also an implementation-progress item in DEVELOPMENT_PHASES.md.

### 4.1 Order: Geidea instead of Stripe

```prisma
// REMOVE
stripePaymentIntentId String? @unique

// ADD
geideaSessionId String? @unique // Geidea Checkout session id (created by us)
geideaOrderId   String? @unique // Geidea's order id (from callback/response)
```

### 4.2 Coupon per-user limit

```prisma
model Coupon {
  // ...existing fields
  perUserLimit Int @default(1) // 0 = unlimited per user
  usages       CouponUsage[]
}

model CouponUsage {
  id        String   @id @default(cuid())
  couponId  String
  coupon    Coupon   @relation(fields: [couponId], references: [id], onDelete: Cascade)
  userId    String?  // registered purchaser (Clerk id)
  anonEmail String?  // anonymous purchaser — limit enforced per email
  orderId   String   @unique
  createdAt DateTime @default(now())

  @@index([couponId, userId])
  @@index([couponId, anonEmail])
  @@map("couponUsages")
}
```

Usage rows are created in the order-creation transaction and deleted if the order is cancelled before payment. Claimed guest orders keep their `anonEmail` usage row (see FEATURES.md §Coupons).

### 4.3 Shipping zones

```prisma
model ShippingZone {
  id          String   @id @default(cuid())
  country     String
  governorate String
  city        String?  // null = whole governorate
  fee         Decimal  @db.Decimal(10, 2)
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([country, governorate, city])
  @@map("shippingZones")
}
```

Fee lookup = most specific active match: (country, governorate, city) → (country, governorate, null). No match → 422 `SHIPPING_NOT_AVAILABLE`. Bosta integration later replaces/augments the lookup behind the same `ShippingService` interface.

### 4.4 Order number sequence

Raw SQL in the migration:

```sql
CREATE SEQUENCE order_number_seq START 1;
```

Order creation: `SELECT nextval('order_number_seq')` inside the transaction → format `ORD-` + zero-padded 6 digits.

## 5. Indexing Notes

Existing: uniques on slugs/emails/tokens, `@@index([userId, read])` on notifications. Add with Migration 001 (verify with `EXPLAIN` as data grows):

- `products`: `@@index([status, featured])`, `@@index([categoryId, status])` — storefront listing paths
- `orders`: `@@index([userId, createdAt])`, `@@index([status])` — order history + admin filtering
- `reviews`: `@@index([productId])` — product review listing

## 6. Data Ownership Summary

| Data | Owner / writer |
|---|---|
| Identity (email, name, password, sessions) | **Clerk** (synced in) |
| `users.role`, `users.active` | **This DB** (ADMIN actions; role mirrored out to Clerk metadata) |
| Prices, totals, discounts, shipping fees | **Server only** — never client-submitted |
| `Product.quantity` | **OrdersService transactions only** (+ admin restock endpoint) |
| `isPaid` (CARD) | **Geidea webhook only** |
| `isPaid` (CASH) | **ADMIN action only** |
| Rating aggregates | **ReviewsService only** |

## 7. Assumptions / Requires Clarification

1. **Review gating:** currently any authenticated user can review any ACTIVE product. Should reviews require a DELIVERED purchase of that product? *(Recommended: yes, later — listed in Future Enhancements.)*
2. **Phone at sign-up:** Clerk sign-ups may lack a phone; `users.phone` is required + unique. Decision implemented: webhook stores a placeholder is NOT allowed — instead `phone` sync strategy: require phone in Clerk sign-up flow (frontend responsibility). If a webhook arrives without phone, the row is created with a sentinel `pending:<clerkId>` value and the API forces profile completion before checkout. Confirm this is acceptable.
3. **Address snapshot on registered orders:** orders reference `Address` rows (SetNull); if a user edits an address after ordering, the order displays the edited address. Shopify snapshots addresses. *(Recommended future change: copy address fields onto the order at checkout.)*
4. **Refund money movement:** status REFUNDED currently does not trigger an automatic Geidea refund API call; refunds are executed in the Geidea dashboard and then reflected by ADMIN setting status = REFUNDED. Automating via Geidea refund API is a Future Enhancement.
5. **Cart item price snapshot (`CartItem.price`)** is informational only; totals and checkout always use live product prices. Confirm no "price changed since you added" UX is needed at MVP.
