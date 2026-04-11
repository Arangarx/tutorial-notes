# Production deploy — Tutoring Notes

Use this with **[GTM-READINESS.md](./GTM-READINESS.md)** (what "ready" means for pilots vs scale).

## Recommended stack (free tier, zero income)

| Layer | Service | Notes |
|---|---|---|
| Hosting | **Vercel** (free) | Perfect for Next.js; zero-config deploys from GitHub |
| Database | **Neon** (free tier) | Serverless Postgres; 0.5 GB storage, scales to zero |
| Email | **Resend** (free tier) | 3 000 emails/month free; simple SMTP relay |

---

## Required environment variables

| Variable | Notes |
|----------|--------|
| `DATABASE_URL` | Neon **pooled** connection string (use for queries in serverless) |
| `DIRECT_URL` | Neon **direct** (unpooled) connection string (required for migrations) |
| `NEXTAUTH_SECRET` | Long random string; unique per environment |
| `NEXTAUTH_URL` | Public origin, e.g. `https://notes.example.com` — required for reset links + OAuth |
| `SETUP_SECRET` | **Production:** long random string (≥16 chars). Required to use `/setup` — open `/setup?token=…` with the **same** value so the first admin cannot be claimed by a random visitor. Optional locally (omit for an open `/setup` on dev). |

See `.env.example` for all variables with comments.

---

## Neon database + automated migrations

The app uses **PostgreSQL** in all environments; you switch dev vs production by **environment variables only** (see **[LOCAL-DEV.md](./LOCAL-DEV.md)**).

### What runs automatically

Every **`npm run build`** on Vercel runs:

`prisma generate` → **`node scripts/migrate-with-retry.mjs`** (`prisma migrate deploy` with retries) → `next build`

So **you do not need to SSH or run SQL by hand** for normal schema changes: commit migration files under `prisma/migrations/` (see below) and push — the next deploy applies pending migrations to the database configured in Vercel (`DATABASE_URL` + `DIRECT_URL`).

### One-time: Neon + Vercel env

1. Sign up at [neon.tech](https://neon.tech) → create a project (e.g. **tutoring-notes**).
2. Copy into **Vercel → Environment variables** (Production):
   - **Pooled** connection string → `DATABASE_URL`
   - **Direct** connection string → `DIRECT_URL`
3. Deploy. The **first** deploy applies migration `prisma/migrations/*` and creates tables.

> **`DIRECT_URL`** is required so `prisma migrate deploy` can talk to Neon correctly. At runtime the app queries via **`DATABASE_URL`** (pooled).

### When you still do things manually

- **Emergency / broken CI:** run `npx prisma migrate deploy` locally with the same env vars, or use `scripts/push-schema-neon.ps1` / `db push` only as a fallback (documented in LOCAL-DEV).
- **Neon MCP / agents:** optional convenience; if tools hang or UAC appears, use the console + commands above instead.

### Preview deployments (PRs)

If Vercel **Preview** uses the **same** `DATABASE_URL` as Production, migrations from a branch can affect prod data. Safer: set a **separate** Neon branch + different env vars for **Preview**, or disable Preview DB access until you have that split.

### Troubleshooting: “relation already exists” / messy first migration

If you created tables earlier with `db push` or manual SQL, the first `migrate deploy` can error. Options: use a **fresh** Neon database for production, or follow [Prisma baselining](https://www.prisma.io/docs/orm/prisma-migrate/workflows/baselining) / `prisma migrate resolve` so the `_prisma_migrations` table matches reality.

### Troubleshooting: `P1002` (timeout) during `migrate deploy` on Vercel

Neon can **auto-suspend** compute; the first connection after idle may exceed Prisma’s default wait. Mitigations:

1. **Append a longer connect timeout** to both URLs in Vercel (libpq / Prisma accept this on the query string). If the string already has `?sslmode=require`, add:
   - `&connect_timeout=60`
   - Example: `...neondb?sslmode=require&channel_binding=require&connect_timeout=60`

2. **Retries:** the build runs `node scripts/migrate-with-retry.mjs`, which retries `prisma migrate deploy` (default **8** attempts, **30s** between attempts — helps cold start and short lock contention). Override with env: `PRISMA_MIGRATE_ATTEMPTS`, `PRISMA_MIGRATE_RETRY_MS`.

3. In the Neon console, open the project and **wake** the branch (run a query) once, then **Redeploy** in Vercel.

### Troubleshooting: advisory lock / `pg_advisory_lock` (10s timeout)

Prisma Migrate takes a **Postgres advisory lock** so two migrates cannot run at once. The wait is **fixed at 10 seconds** (not configurable). If you see:

`Timed out trying to acquire a postgres advisory lock … Timeout: 10000ms`

**1. Use two different Neon URLs in Vercel (most common fix)**

| Variable | Neon dashboard | Hostname hint |
|----------|----------------|---------------|
| `DATABASE_URL` | **Pooled** connection | Usually contains **`-pooler`** in the host |
| `DIRECT_URL` | **Direct** connection | Same endpoint **without** `-pooler` |

If **`DIRECT_URL` is accidentally the pooled string**, session locks break and migrate can fail. On **Vercel**, the migrate script **fails fast** if `DIRECT_URL`’s hostname contains **`-pooler`**. Locally it only **warns** (so Docker URLs are unaffected). Fix: paste Neon’s **Direct** string into `DIRECT_URL` only.

See Neon: [Schema migrations with Prisma](https://neon.tech/docs/guides/prisma-migrations).

**2. Overlapping Vercel builds**

Two deploys running `migrate deploy` at the same time contend on the same lock; one waits 10s and errors. **Wait** for the other build to finish and **Redeploy**, or avoid triggering multiple production builds at once (push + manual redeploy while CI is still running). The retry script defaults to **8** attempts × **30s** spacing (`PRISMA_MIGRATE_ATTEMPTS`, `PRISMA_MIGRATE_RETRY_MS`) so a short queue can clear.

**3. Last resort (know the tradeoff)**

Prisma supports `PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK` — **only** consider if you are sure **one** migrate runs at a time; disabling removes protection against concurrent migrates. Prefer fixing URLs and deploy overlap first.

---

## Email setup (Resend — recommended for pilots)

1. Sign up at [resend.com](https://resend.com) → create an API key.
2. In the app admin settings (or via env), set:
   - `SMTP_HOST=smtp.resend.com`
   - `SMTP_PORT=465`
   - `SMTP_SECURE=true`
   - `SMTP_USER=resend`
   - `SMTP_PASS=<your Resend API key>`
   - `SMTP_FROM=noreply@yourdomain.com` (must be a verified sender domain in Resend)
3. Send a test "Send update" from the app to confirm delivery.

Resend's free tier covers 3 000 emails/month — more than enough for early pilots.

---

## Password reset

Reset emails use the same SMTP/Gmail config as other emails. If email is not configured, the reset link will not be delivered — configure email before advertising this feature to users.

---

## First deploy checklist

1. Push repo to GitHub.
2. Import project in Vercel → set all environment variables (`DATABASE_URL`, `DIRECT_URL`, `NEXTAUTH_*`, etc.).
3. Deploy — **migrations run during the build** (`prisma migrate deploy`).
4. **First admin:** Set `SETUP_SECRET` in Vercel, redeploy, then visit `https://your-app.vercel.app/setup?token=<same secret>` and create the admin. **Or** set `ADMIN_EMAIL` + `ADMIN_PASSWORD` and sign in at `/login` (no `/setup`). The public `/setup` form is **disabled** in production until `SETUP_SECRET` is set, so nobody can squat the first account.
5. Go to `https://your-app.vercel.app/admin/settings/email` → configure email.
6. Send a test "Send update" to confirm email delivery.
7. Add OAuth **test users** (or complete Google verification) if using Connect Gmail — see `docs/pilot-ops-playbook.md`.

---

## Schema changes after launch

1. Edit `prisma/schema.prisma`.
2. Locally (with a dev DB): `npx prisma migrate dev --name describe_change` — creates a new folder under `prisma/migrations/`.
3. Commit and push. Vercel’s next build runs `migrate deploy` and applies pending migrations.

---

## Vercel + Neon re-deploy (iterating)

- Push to `main` → Vercel auto-deploys; pending migrations apply on build.
- If a migration fails, fix forward with a new migration or restore from backup — avoid editing already-applied migration SQL in git.
