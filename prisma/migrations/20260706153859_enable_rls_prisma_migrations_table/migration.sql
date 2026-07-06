-- `_prisma_migrations` is Prisma's own bookkeeping table, created by the
-- migrate engine itself (not by any migration file) before applying pending
-- migrations, so it does not exist yet when this file replays against
-- Prisma's throwaway shadow database (used to validate `migrate dev`).
-- `IF EXISTS` makes that replay a no-op there, while still taking effect on
-- every real database this migration is applied to, keeping the RLS-enabled
-- guarantee in docs/DATABASE.md §8 reproducible across environments.
ALTER TABLE IF EXISTS "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
