# 00 — Conventions (read first)

Everything in this guide assumes the conventions on this page.

## Base URL & versioning

All endpoints are prefixed with **`/api/v1`**. Paths in the module docs are relative to that prefix (for example, `GET /products` means `GET https://<api-host>/api/v1/products`).

## Authentication — three modes

The backend issues **no tokens of its own**. Authenticated requests use a short-lived Clerk session JWT:

```
Authorization: Bearer <clerk-session-token>
```

Fetch a fresh token from the active Clerk session for each request rather than caching it.

| Mode | Meaning | Examples |
|---|---|---|
| **Public** | No token is needed. A Bearer token does not change the operation. | Products, categories, shipping fee, public review list, guest-order lookup |
| **Optional** | Works as a guest; a valid token adds the current user identity. | Cart, coupon preview, guest checkout |
| **Auth** | A valid Clerk Bearer token is required. | Wishlist, addresses, registered checkout, my orders, profile |

For optional-auth routes, a missing or invalid Bearer token is treated as anonymous. A disabled account still receives `403 ACCOUNT_DISABLED` when its token resolves successfully.

### Auth failures

| HTTP | `code` | Meaning | Frontend handling |
|---|---|---|---|
| 401 | `UNAUTHENTICATED` | Missing, invalid, or expired token on an Auth route | Re-authenticate through Clerk, then retry |
| 403 | `FORBIDDEN` | Authenticated but not allowed (for example, editing another user's review) | Hide the action or show "no access" |
| 403 | `ACCOUNT_DISABLED` | The signed-in account was deactivated | Sign out and show the account-disabled state |

## Guest cart identity — web & mobile

Anonymous carts use a server-minted UUID session token.

| Client | Transport | Client responsibility |
|---|---|---|
| Web | httpOnly `cart_session` cookie | Use credentialed requests (`credentials: "include"`). JavaScript cannot and should not read the token cookie. |
| React Native / mobile | `X-Cart-Session: <token>` header | Store the one-time response `sessionToken` in secure storage and attach it to later cart-aware calls. |

If both are present, **`X-Cart-Session` wins over the cookie**. Never put the session token in a URL, analytics event, or log.

The first anonymous `POST /cart/items` creates the cart, sets the web cookie, and includes `sessionToken` once in the response `data` for mobile. Later responses omit it. Anonymous carts expire after seven days of inactivity; each cart mutation slides `expiresAt` forward by another seven days.

### Anonymous → user cart merge

The merge runs automatically on the first **authenticated cart-aware request that loads the cart** while the anonymous cookie/header is still present. Today that means any `/cart` operation or `POST /coupons/validate`:

- If the user has no cart, the anonymous cart becomes the user cart.
- If both carts exist, equal `(productId, color, size)` lines are summed and capped at current stock; distinct lines are appended.
- When both carts exist, the resulting user-cart totals are recomputed from current prices and the anonymous cart is deleted. When the user has no cart, the anonymous cart is adopted as-is: only its ownership/session fields change, so its stored totals are not recomputed during adoption and can remain stale until the next cart mutation.
- In either case, the web cookie is cleared by `Set-Cookie`.
- Replays are safe: once merged, the anonymous cart no longer exists.

There is **no merge endpoint**. After sign-in, call `GET /cart` before registered checkout so the merge is completed and the returned user cart is the one the UI displays. Mobile clients should delete their stored token after that authenticated response; web clients receive the server's cookie-clearing header automatically.

## Response envelope

Every JSON response is wrapped. Success:

```json
{
  "status": "success",
  "message": "Success",
  "data": { "...payload..." },
  "meta": { "...pagination, only on paginated lists..." }
}
```

DTO/query validation error:

```json
{
  "status": "error",
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "errors": [
    {
      "field": "quantity",
      "constraints": { "min": "quantity must not be less than 1" }
    }
  ]
}
```

- Branch on `code`, **never** on `message`.
- `errors` is optional. DTO/query validation entries use `{ field, constraints }`; business errors can use their own documented structured line-level shapes.
- Successful `DELETE` routes documented as 204 return **`204 No Content` with an empty body**. Do not parse JSON from them.
- Module examples show the `data` payload only unless the envelope or pagination `meta` matters.

## Pagination

Paginated list endpoints accept:

| Query param | Default | Constraints |
|---|---|---|
| `page` | `1` | integer ≥ 1 |
| `limit` | `20` | integer 1–100 |

and return:

```json
"meta": { "page": 1, "limit": 20, "totalItems": 143, "totalPages": 8, "hasNext": true, "hasPrev": false }
```

Categories and wishlist are intentionally unpaginated. Cart items are returned as one complete array.

## Data formats

- **Money and record decimals are JSON strings**, but their scale varies by endpoint. Product, wishlist, and cart values may omit trailing zeros (for example, `"2400"` or `"2040.5"`), while shipping-fee, coupon-validation, and order responses use two decimal places (for example, `"65.00"`). Parse them with a decimal-safe approach, format them for display in the client, and do not assume or validate a fixed scale.
- **Dates** are ISO 8601 UTC strings: `"2026-07-18T12:00:00.000Z"`.
- **IDs** are cuid strings (`"ckvprod123…"`) except user IDs, which are Clerk IDs (`"user_2abc…"`). Guest cart tokens are UUIDs; order claim tokens are 64-character hex strings.
- The server is the source of truth for prices, discounts, shipping fees, stock, and order totals. Client-side calculations are display estimates only.

## Validation behavior

- Unknown body fields are rejected with `422 VALIDATION_ERROR`; send only documented properties.
- Query parameters are type-coerced (`?page=2` and `?featured=true` are strings on the URL and are accepted).
- Field failures appear in `errors[]` as `{ field, constraints }`. `field` is the property path (nested DTO paths use dotted names such as `contact.email`), and `constraints` maps validator rule names to messages. Map the path to form fields where possible.
- `quantity` is at least 1. Use the delete route rather than sending zero.

## Rate limiting

Limits are per IP. Do not automatically retry a 429 in a tight loop; respect a backoff and preserve the user's form/cart state.

| Route | Limit |
|---|---|
| All routes without an override | 100 requests / 60 s |
| `POST /orders` | 5 / 60 s |
| `POST /orders/guest` | 5 / 60 s |
| `POST /orders/claim` | 5 / 60 s |
| `POST /coupons/validate` | 10 / 60 s |
| `GET /orders/guest/:token` | 10 / 60 s |
| `POST /orders/:id/cancel` | Global limit (100 / 60 s) |

Exceeding a limit returns `429 RATE_LIMITED`.

## Shared enums

### `OrderStatus`

`PENDING | PROCESSING | SHIPPED | DELIVERED | CANCELLED | REFUNDED`

### `PaymentMethod`

`CASH | CARD`

`CARD` exists in the schema and DTO enum but is currently gated at checkout with `422 PAYMENT_METHOD_UNAVAILABLE`. Only send `CASH` until Phase 7 ships.

## Storefront error codes

Handle the generic block globally. Endpoint-specific tables in the module docs explain the remaining codes in context.

| HTTP | `code` | When |
|---|---|---|
| 400 | `BAD_REQUEST` | Malformed JSON or request syntax |
| 401 | `UNAUTHENTICATED` | Auth route has no valid Clerk token |
| 403 | `FORBIDDEN` | Authenticated caller is not allowed |
| 403 | `ACCOUNT_DISABLED` | Authenticated account is inactive |
| 404 | `RESOURCE_NOT_FOUND` | Resource is missing or deliberately not visible to the caller |
| 409 | `DUPLICATE_RESOURCE` | A unique value conflicts, such as profile phone |
| 422 | `VALIDATION_ERROR` | DTO/query validation failed; inspect `errors[]` |
| 429 | `RATE_LIMITED` | Route throttle exceeded |
| 500 | `INTERNAL_ERROR` | Unexpected server error |
| 503 | `SERVICE_UNAVAILABLE` | A required dependency is unavailable |

| HTTP | `code` | Storefront meaning |
|---|---|---|
| 422 | `INVALID_VARIANT` | Product is inactive/missing at checkout or a selected color/size is no longer valid |
| 409 | `INSUFFICIENT_STOCK` | Requested quantity exceeds current stock; `errors[]` identifies failed lines |
| 422 | `CART_EMPTY` | Checkout has no usable cart lines |
| 422 | `SHIPPING_NOT_AVAILABLE` | No active shipping zone matches the destination |
| 422 | `COUPON_EXPIRED` | Coupon expiry has passed |
| 422 | `COUPON_INACTIVE` | Coupon was deactivated |
| 409 | `COUPON_EXHAUSTED` | Coupon global usage cap was reached |
| 409 | `COUPON_USER_LIMIT` | Current user or guest email reached the per-customer cap |
| 422 | `PAYMENT_METHOD_UNAVAILABLE` | `CARD` selected before Geidea is implemented |
| 404 | `CLAIM_TOKEN_INVALID` | Guest-order token is invalid, expired, or already consumed |
| 409 | `REVIEW_EXISTS` | Current user already reviewed the product |
| 409 | `INVALID_STATUS_TRANSITION` | Order cannot be cancelled from its present state |

### Structured cart/checkout errors

Stock failures return line data:

```json
{
  "status": "error",
  "message": "Insufficient stock for one or more items",
  "code": "INSUFFICIENT_STOCK",
  "errors": [{ "productId": "ckvprod123", "requested": 5, "available": 3 }]
}
```

At checkout, invalid lines return:

```json
{
  "status": "error",
  "message": "One or more cart lines are no longer available",
  "code": "INVALID_VARIANT",
  "errors": [{ "productId": "ckvprod123", "color": "Black", "size": "M", "code": "INVALID_VARIANT" }]
}
```

Match `productId` back to the rendered cart line, show the available quantity where supplied, refresh the cart, and let the customer correct or remove each failed line.
