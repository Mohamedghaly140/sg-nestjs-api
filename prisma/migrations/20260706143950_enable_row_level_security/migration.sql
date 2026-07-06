-- This backend never uses Supabase client libraries or the anon/authenticated
-- Postgres roles; all access goes through this API via a direct connection as
-- the table-owning `postgres` role, which bypasses RLS regardless of policies.
-- Supabase auto-exposes every `public` schema table through PostgREST using
-- the `anon`/`authenticated` roles, so with RLS disabled (Postgres default)
-- those roles could read/write every row if the project's API keys were ever
-- reachable. Enabling RLS with no policies defined makes every table
-- default-deny for `anon`/`authenticated` while leaving this backend's own
-- (RLS-bypassing) connection unaffected. See docs/DATABASE.md §Security.
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "addresses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subCategories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "productImages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "productSubCategories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserWishlist" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "carts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cartItems" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "coupons" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "couponUsages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shippingZones" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "orderItems" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;

-- `_prisma_migrations` is Prisma's own bookkeeping table, created outside any
-- migration file, so it doesn't exist yet when this migration replays against
-- Prisma's shadow database — it can't be referenced here. Its RLS is enabled
-- separately as a one-off statement against the real database; see
-- docs/DATABASE.md §Security.
