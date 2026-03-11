## Tutoring Notes (local-first MVP)

### What this is
A local-first web app for tutors to write session notes fast and share clean updates with parents/students via a link.

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

### Login
Use `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`.

### Dev email “outbox”
Sending an update writes to a local outbox so you can preview the exact email content at `/admin/outbox`.

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

Set `NEXTAUTH_URL` to the public URL where the app will be served (e.g. `https://notes.example.com`). On a phone, open that URL in the browser (no separate native app).

Emails are **not** actually sent in this MVP; the "Send" button writes to the dev outbox only so you can review what would be sent. A real email transport can be wired in later behind the same flow.*** End Patch】} -->

