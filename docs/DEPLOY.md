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

The app uses **PostgreSQL** in all environments; you switch dev vs production by **environment variables only** (see **[LOCAL-DEV.md](./LOCAL-DEV.md)**). The Prisma schema in git is already `postgresql` + `directUrl` — no manual schema edits per deploy.

1. Sign up at [neon.tech](https://neon.tech) → create a project → choose a region close to your Vercel region.
2. In the Neon dashboard, copy:
   - **Pooled connection string** → `DATABASE_URL` in Vercel
   - **Direct connection string** → `DIRECT_URL` in Vercel
3. Run the initial schema sync **once** against that database (from your machine with production URLs in env, or using Vercel CLI with env pulled):

   ```bash
   npx prisma db push
   ```

   After tables exist, deploy to Vercel as usual.

> **Note:** `DIRECT_URL` is required for `prisma db push` / `migrate` against Neon's pooler. At runtime the app uses `DATABASE_URL` (pooled) from Vercel.

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
