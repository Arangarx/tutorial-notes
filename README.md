## Tutoring Notes

### What this is
A web app for tutors to write session notes fast and share clean updates with parents/students via a link.

### Go-to-market / pilots
See **[docs/GTM-READINESS.md](docs/GTM-READINESS.md)** for a candid “are we ready?” assessment (pilot vs production). For **production hosting (Vercel + Neon) and env checklist**, see **[docs/DEPLOY.md](docs/DEPLOY.md)**. For **local Postgres (Docker or Neon dev)**, see **[docs/LOCAL-DEV.md](docs/LOCAL-DEV.md)**. For **pilot acquisition, onboarding checklist, and email/Google OAuth reminders**, use the pipeline repo’s **`docs/pilot-ops-playbook.md`** (if you use the combined `agenticPipeline` workspace, it’s at the repo root).

### Quickstart
1) Copy env template and fill in **your** URLs (never commit `.env`):

```bash
copy .env.example .env
```

2) Start **PostgreSQL** locally — easiest path is Docker:

```bash
npm run db:up
```

Use the `DATABASE_URL` / `DIRECT_URL` values from `.env.example` (they match `docker-compose.yml`), or use a Neon dev database instead — see **[docs/LOCAL-DEV.md](docs/LOCAL-DEV.md)**.

3) Install deps:

```bash
npm install
```

4) Create tables:

```bash
npm run db:push
```

5) Run the app:

```bash
npm run dev
```

To stop local Postgres: `npm run db:down`

### Login and first-run setup
- **Sign up:** Open **`/signup`** to create a tutor account (email + password). Or use **`/login`** → “Create an account.”
- **First time (local dev):** If no admin exists and you didn’t set `ADMIN_EMAIL`/`ADMIN_PASSWORD`, open `/setup` to create the first admin (password hashed in the DB). If you set `SETUP_SECRET` in `.env`, use `/setup?token=…` with that value instead.
- **First time (production / Vercel):** Set `SETUP_SECRET` (≥16 characters) in the host env, redeploy, then open `/setup?token=…` with the **same** value — the open `/setup` page is **not** available on production without this (prevents a stranger from claiming admin). **Or** set `ADMIN_EMAIL` / `ADMIN_PASSWORD` and sign in at `/login` without using `/setup`.
- **Otherwise:** Sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`, or with any admin account you created via `/setup`.
- **Forgot password:** On `/login`, use **Forgot password?** — works for **database** admins only, and sends email only if Gmail or SMTP is configured (same as “Send update”). Env-only `ADMIN_PASSWORD` login cannot be reset from the app; change server config instead.
- **Profile:** **Admin → Profile** to change the name shown to parents (and in the email “From” line when using Gmail).
- **Legal (footer):** **Privacy** and **Terms** are template pages — customize copy before a broad launch (especially if you submit Google OAuth for verification).

### Email (real send vs outbox)
- **Easiest: Connect Gmail** — Admin → Email settings → **Connect Gmail**, sign in with Google. No SMTP. (Deployer sets `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` once; see .env.example.)
- **Or use SMTP** — Same page, “Or use SMTP”: host, user, password (e.g. Resend/SendGrid). Optional .env `SMTP_*` fallback.
- **Configure in the app:** Go to **Admin → Email settings**. Enter SMTP details and optional “From” address. Save. “Send update” and **password reset** use the same mail path.
- **Optional .env fallback:** Set `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` (and optionally `SMTP_PORT`, `SMTP_SECURE`, `SMTP_FROM`) in `.env`; the app uses in-app settings first, then env.
- **Outbox only:** If neither in-app nor env SMTP is set, “Send update” only records the message at `/admin/outbox` (no email is sent). Password reset emails also require a configured mail path.

### Running tests

Jest uses a **separate test database** (`tutoring_notes_test` by default when using Docker — see `jest.global-setup.ts`). Start Postgres first (`npm run db:up`), or set `TEST_DATABASE_URL` in `.env`.

```bash
npm test        # Jest unit/integration
npm run test:e2e  # Playwright UI smoke tests
npm run test:all  # both
```

### Production build and run

For a production-like run on your own machine or server:

```bash
# 1) Ensure .env is configured (see .env.example).
#    In production, set these as real environment variables instead of a file.

# 2) Build the app
npm run build

# 3) Start the app (defaults to port 3000 unless PORT is set)
npm start
```

Set `NEXTAUTH_URL` to the public URL where the app will be served (e.g. `https://notes.example.com`). On a phone, open that URL in the browser (no separate native app). Configure SMTP (see above) so “Send update” actually delivers email to parents.

