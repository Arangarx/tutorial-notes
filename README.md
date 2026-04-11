## Tutoring Notes (local-first MVP)

### What this is
A local-first web app for tutors to write session notes fast and share clean updates with parents/students via a link.

### Go-to-market / pilots
See **[docs/GTM-READINESS.md](docs/GTM-READINESS.md)** for a candid “are we ready?” assessment (pilot vs production). For **production hosting, Postgres vs SQLite, and env checklist**, see **[docs/DEPLOY.md](docs/DEPLOY.md)**. For **pilot acquisition, onboarding checklist, and email/Google OAuth reminders**, use the pipeline repo’s **`docs/pilot-ops-playbook.md`** (if you use the combined `agenticPipeline` workspace, it’s at the repo root).

### Quickstart
1) Copy env file:

```bash
copy .env.example .env
```

2) Install deps:

```bash
npm install
```

3) Create the local DB + tables:

```bash
npm run db:push
```

4) Run the app:

```bash
npm run dev
```

### Login and first-run setup
- **First time:** If no admin account exists and you haven’t set `ADMIN_EMAIL`/`ADMIN_PASSWORD` in `.env`, open `/setup` to create the first admin (stored in DB, password hashed). Optionally set **your name** so parents see it in update emails. Then sign in at `/login`.
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

