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

### Tests

```bash
npm test
```

