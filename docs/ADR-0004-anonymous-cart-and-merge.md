# ADR-0004: Server-Owned Anonymous Carts + Merge-on-Login

**Status:** Accepted · **Date:** 2026-07-03 · **Deciders:** Mohamed Ghaly (delegated), Claude (proposal)

## Context
Guests on web **and** mobile must build carts and check out anonymously. The schema already models this (`Cart.sessionToken` + `expiresAt`). Open questions delegated to this ADR: token transport, who mints it, and the merge strategy on login.

## Decision
1. **Server-owned carts for everyone.** Client-side-only guest carts were rejected: anonymous checkout, price truth, and web↔mobile parity all require the server to hold the cart.
2. **Token minting:** backend generates a UUID v4 `sessionToken` on the first anonymous cart mutation.
3. **Transport:** dual-channel for platform fit —
   - Web: httpOnly, Secure, SameSite=Lax cookie `cart_session` (XSS-safe, automatic).
   - Mobile: token echoed once in the response body; app stores it in secure storage and sends `X-Cart-Session` header.
   - Resolution order: valid Clerk JWT → user cart; else header/cookie token → anonymous cart.
4. **TTL:** `expiresAt = now() + 7d`, sliding (refreshed on every mutation); daily purge cron.
5. **Merge-on-login (Shopify-consistent, automatic):** on the first authenticated cart request that also carries an anonymous token:
   - user has no cart → re-key the anonymous cart to the user (cheapest path);
   - both exist → merge into the user cart: same `(productId, color, size)` sums quantities capped at stock, distinct lines append; recompute totals from live prices; delete the anonymous cart; expire the cookie.
   - Idempotent: replays find no anonymous cart → no-op.

## Options Considered
**A — Backend cart + dual token transport (chosen):** works identically for web/mobile, httpOnly keeps web XSS-safe, matches schema. Cons: middleware complexity, cookie+CORS credentials config.
**B — Client-side guest cart, server cart only after login:** no anonymous checkout without a big cart-upload step; price drift; rejected.
**C — Merge policy "anonymous wins / replace user cart":** loses items the user added on another device; summing is the least surprising (Shopify behavior).

## Consequences
- Easier: one cart API for all clients; checkout always reads a server cart; anonymous checkout is a natural extension.
- Harder: e2e tests must cover cookie and header flows plus the three merge scenarios (Phase 4 acceptance criteria).
- Revisit if: cart traffic makes Postgres hot → Redis-backed carts behind the same CartService interface.
