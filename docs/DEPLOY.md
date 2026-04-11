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

See `.env.example` for all variables with comments.

---

## Neon database setup

**Before deploying**, switch the Prisma schema from SQLite to PostgreSQL (one-time change):

1. In `prisma/schema.prisma`, change the datasource block to:

   ```prisma
   datasource db {
     provider  = "postgresql"
     url       = env("DATABASE_URL")
     directUrl = env("DIRECT_URL")
   }
   ```

2. Sign up at [neon.tech](https://neon.tech) → create a project → choose a region close to your Vercel region.
3. In the Neon dashboard, copy:
   - **Pooled connection string** → `DATABASE_URL`
   - **Direct connection string** → `DIRECT_URL`
4. Add both to Vercel Environment Variables (Settings → Environment Variables).
5. Run the initial migration **once** from your local machine with both env vars set in a `.env.production.local` file:

   ```bash
   npx prisma db push
   ```

   After that, deploy to Vercel normally — Prisma will use the pooled URL at runtime.

> **Note:** `DIRECT_URL` is required by Prisma for migrations/pushes against Neon's serverless pooler. It is not used at runtime.

> **Local dev:** Continue using `provider = "sqlite"` and `DATABASE_URL="file:./dev.db"` locally. Just don't commit the schema change until you're ready to deploy.

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
2. Import project in Vercel → set all environment variables.
3. Deploy.
4. Run `npx prisma db push` once from local with production env vars set.
5. Visit `https://your-app.vercel.app/setup` → create admin account.
6. Go to `https://your-app.vercel.app/admin/settings/email` → configure email.
7. Send a test "Send update" to confirm email delivery.
8. Add OAuth **test users** (or complete Google verification) if using Connect Gmail — see `docs/pilot-ops-playbook.md`.

---

## Vercel + Neon re-deploy (iterating)

- Push to `main` → Vercel auto-deploys.
- For schema changes: run `npx prisma db push` locally against the production DB **before** deploying code that requires the new schema.
