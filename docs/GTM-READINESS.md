# Go-to-market readiness — Tutoring Notes (no-holds-barred)

This is an **honest** checklist: what is solid enough for a **small private pilot**, what is **not** production-grade yet, and what blocks **broad** launch.

Pipeline rule: do not treat a release as “ready” for an audience while **known** gaps here could **lose trust or clients** unless the product owner **waives in writing** for that audience. See [trust-launch-bar.md](../../../docs/trust-launch-bar.md) in the agentic pipeline repo.

---

## Verdict (short)

| Stage | Ready? | Why |
|-------|--------|-----|
| **Private pilot (3–10 tutors you trust)** | **Mostly yes**, with caveats | Core loop works; deploy with durable DB + correct `NEXTAUTH_URL`; configure email for reset; handle Google OAuth test users; replace template Privacy/Terms if pilots expect formal policy. |
| **Paid “real” customers at scale** | **Closer; still gated** | Password reset + in-app Privacy/Terms templates are in place; you must still customize legal copy, choose durable DB/hosting, add billing/monitoring, and harden for your threat model. |
| **Self-serve signup from the internet** | **No** | Single-admin / per-deploy model, no marketing site, OAuth consent likely still “Testing.” |

---

## What is genuinely in good shape

- **Core product loop:** Students → notes → share link → parent view; send update email with a real name and clearer copy; outbox fallback.
- **Auth model for a solo tutor:** First-run `/setup`, hashed passwords, optional env fallback for dev.
- **Email:** Gmail API path + Profile display name; pipeline learning captured (`docs/learning-email-gmail.md` in agenticPipeline).
- **In-app config:** Email (Gmail + SMTP) without asking pilots to edit `.env` for day-to-day use.
- **Feedback:** In-app feedback path (pipeline principle).
- **Automated quality:** Jest + Playwright smoke; intent-driven testing discipline in the pipeline.
- **Mobile expectation:** Responsive web; pilots use browser on phone — aligned with `docs/pilot-and-mobile.md`.

---

## Critical gaps before you call this “production”

### 1. Hosting + database (blocker for naive deploy)

- **SQLite + `file:./dev.db`** is fine for **one machine / one container with a persistent disk**.
- On **typical serverless** (e.g. Vercel without persistent storage), the DB file is **ephemeral or non-durable** — you can **lose data** or see inconsistent behavior across instances.
- **For pilot:** Deploy to **one** environment with a **persistent volume** (Fly.io, Railway with volume, single VPS, Docker on a host with mounted volume) **or** migrate to **Postgres** (e.g. Neon, Supabase) before serverless deploy.

### 2. Password reset

- **Implemented:** Token link by email (`/forgot-password` → `/reset-password`) for **database** admins. Requires **configured email** (Gmail connect or SMTP), same as “Send update.”
- **Env-only login** (`ADMIN_EMAIL` / `ADMIN_PASSWORD` with no DB admin) **cannot** be reset in-app — change server config.
- **Before paid launch:** Confirm reset was tested on the **production URL** (`NEXTAUTH_URL`); consider rate limits and support playbook.

### 3. Google OAuth consent mode

- While the app is in **Testing**, only **listed test users** can Connect Gmail.
- For **each pilot** using Connect Gmail, they must be added as test users **or** you complete **Google verification** (privacy policy, scopes, review time).
- **Your recurring job:** Keep test users updated **or** plan verification before scaling.

### 4. Secrets in the database

- **SMTP credentials** (and similar) stored in SQLite — protect **DB backups** and **server access**. Not unique to you, but not “bank-grade.” Acceptable for pilot; document for handoff.

### 5. Legal / trust

- **In-app:** `/privacy` and `/terms` plus footer links — **template copy** suitable for internal pilots; replace with counsel-reviewed text before **broad** launch or Google OAuth production verification.
- You’re handling **student names, parent emails, educational notes** — be ready to explain retention and deletion.

### 6. Billing and positioning

- No **Stripe** (or other) — you cannot take money in-product yet.
- For pilot you can **invoice manually** or “free for feedback” — that’s fine; don’t confuse that with “launched.”

### 7. Operations

- No **error monitoring** (Sentry, etc.), no **uptime** checks, no **backup** runbook in repo.
- **Pilot-acceptable** if you check the app weekly; **not** acceptable for unattended SaaS.

### 8. README / duplicate copy

- README still has **overlapping email sections** — cleanup before sending repo to a technical pilot.

---

## What “ready to run a pilot” actually means (minimum)

1. **Deployed URL** with `NEXTAUTH_URL` = that URL; `NEXTAUTH_SECRET` strong and unique.
2. **Persistent DB** (volume or Postgres) — not disposable SQLite on serverless.
3. **Google:** Gmail API enabled; OAuth client has **production redirect URI**; test users added **or** verification path started.
4. **You** set **Profile** name on the deployed instance (or ask pilot to set after setup).
5. **Pilot brief:** one-pager — “Create account → add student → note → send update → parent opens link.”
6. **Support channel:** your email or Calendly for **15‑min feedback** calls.
7. **Your calendar:** reminders for OAuth test users, domain renewal, and “ping pilots” (see agenticPipeline `docs/pilot-ops-playbook.md`).

---

## Suggested order of work (aggressive but sane)

1. **This week:** Choose host + **persistent DB story**; deploy; smoke-test on real URL.
2. **Before 10+ pilots:** Customize Privacy/Terms for your entity; trim README; verify reset + email on production URL.
3. **Before charging at scale:** Postgres, Stripe, monitoring, Google verification if using Gmail connect widely.

---

*Last updated as a candid assessment for pipeline / product owner; revise after each major release.*
