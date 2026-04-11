# Local development — database and `.env`

The Prisma schema is **PostgreSQL only** (committed in `prisma/schema.prisma`). You do **not** flip the provider in git for deploy vs local — you only change **which database URLs** are in your **local `.env`** (gitignored).

## What gets committed vs what does not

| Committed | Not committed |
|-----------|----------------|
| `docker-compose.yml`, `docker/postgres/init/*` | `.env` — your real URLs and secrets |
| `.env.example` — **templates** with placeholder/local-safe values | Production Neon URLs (paste only in Vercel + your private `.env` when needed) |

Using the **same placeholder passwords** in `.env.example` as in `docker-compose.yml` is intentional: they are **local-only** defaults, not production secrets.

## Option A: Docker Postgres (recommended)

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows / macOS) or Docker Engine (Linux).

2. Start Postgres:

   ```bash
   npm run db:up
   ```

   This creates:

   - Database `tutoring_notes` — for `next dev`
   - Database `tutoring_notes_test` — for `npm test` (see `jest.global-setup.ts`)

3. Copy `.env.example` → `.env` and use the **Local Docker** URLs already shown there (`DATABASE_URL` + `DIRECT_URL` pointing at `tutoring_notes` on `127.0.0.1:5432`).

4. Apply the schema:

   ```bash
   npm run db:push
   ```

5. Run the app: `npm run dev`

To stop Postgres: `npm run db:down`  
To reset Docker data completely (wipes DBs): `docker compose down -v` then `npm run db:up` again.

## Option B: Neon dev branch (no Docker)

Create a free Neon project or a **branch** used only for development. Put the **pooled** URL in `DATABASE_URL` and **direct** URL in `DIRECT_URL` in your `.env`. Run `npm run db:push` once.

Jest still defaults to `postgresql://...@127.0.0.1:5432/tutoring_notes_test` unless you set `TEST_DATABASE_URL` in `.env` to a separate Neon database/branch for tests.

## Vercel / production

Set `DATABASE_URL` and `DIRECT_URL` in the Vercel project to your **production** Neon strings. No code change — only host env vars.

## Migrating from old SQLite `dev.db`

If you previously used SQLite, that file is obsolete for this schema. Start Postgres (Docker or Neon), point `.env` at it, run `npm run db:push`, and recreate admin data via `/setup` if needed. Optionally export/import data separately — not automated here.
