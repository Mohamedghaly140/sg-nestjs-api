# SG Couture Backend

NestJS + PostgreSQL + Prisma REST API for the SG Couture e-commerce storefront
and admin dashboard.

## Prerequisites

- Node.js `^20.19`, `^22.12`, or `>=24` (the versions supported by Prisma 7)
- pnpm
- PostgreSQL

This repository uses pnpm only.

## Quick start

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Configure `.env` with the Phase 0 variables:

   ```dotenv
   NODE_ENV=development
   PORT=3000
   DATABASE_URL=postgresql://...
   CORS_ORIGINS=http://localhost:3001
   CLERK_SECRET_KEY=...
   CLERK_WEBHOOK_SECRET=...
   # Optional direct connection for Prisma CLI database commands
   DIRECT_URL=postgresql://...
   ```

   Additional variables are typed or defaulted in
   `src/config/env.validation.ts` and become required as their owning phases are
   implemented. See `docs/CODING_STANDARDS.md` §7 for the full list.

3. Apply migrations, seed development fixtures, and start the API:

   ```bash
   pnpm exec prisma migrate dev
   pnpm run seed
   pnpm start:dev
   ```

## Quality checks

```bash
pnpm test
pnpm test:e2e
pnpm test:cov
pnpm lint
pnpm format
```

## Local endpoints

- Swagger UI: [http://localhost:3000/api/docs](http://localhost:3000/api/docs)
- Health check:
  [http://localhost:3000/api/v1/health](http://localhost:3000/api/v1/health)

For deeper project context, see `docs/ARCHITECTURE.md`,
`docs/API_SPECIFICATION.md`, and `docs/DEVELOPMENT_PHASES.md`. `AGENTS.md` and
`CLAUDE.md` contain repository guidance for AI-assisted development.
