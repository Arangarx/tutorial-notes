# Andrew follow-ups — drop-in checklist

> **For you when you’re back after a gap.** Agents keep this current. Code work continues without waiting on these unless a row says “blocks code.”

**Last refreshed:** 2026-08-14  
**Canonical priorities:** [`docs/BACKLOG.md`](../BACKLOG.md) § Release priorities (option B)  
**Living orchestrator state:** [`ORCHESTRATOR-STATE.md`](ORCHESTRATOR-STATE.md)

---

## Do these when you have 15–30 minutes (Google Console)

These are **Andrew-only** (no agent can finish them). They do **not** block the Sign-in-with-Google UI code chunk.

| # | Action | Why | Blocks code? |
|---|--------|-----|--------------|
| 1 | Open [OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent) — note status (Testing / In production) and whether `gmail.send` is still verified | Confirms we can ship Sign-In + plan calendar verify | No |
| 2 | Confirm redirect URIs include `{host}/api/auth/callback/google` for **prod** (`usemynk.com`) and **localhost** (and any preview hosts you care about) | Sign-In button will 302 to Google; bad URI → `oauth_error` on `/login` | No for UI merge; **yes for live Sign-In smoke** |
| 3 | Confirm `{host}/api/auth/gmail/callback` still listed (existing Gmail connect) | Don’t break Sarah’s Gmail | No |
| 4 | [Search Console](https://search.google.com/search-console) — `usemynk.com` verified? Branding re-submit if pending ([`LEGAL-SYNC.md`](../LEGAL-SYNC.md)) | Needed before bundled calendar verification | No |
| 5 | Later: enable Google Calendar API + prepare ONE bundled verification round (`calendar.events` + `calendar.readonly`) — **hybrid**: Console prep now, submit after MVP demo exists | Long pole for scheduling | Yes for calendar feature submit |

**Paste status here when done** (agents will fold into BACKLOG/STATE):

```
Consent screen: 
gmail.send verified?: 
Sign-in callback URIs OK?: 
Search Console usemynk.com?: 
Notes:
```

---

## Background eyeballs (not merge-blocking)

| Item | Doc | Notes |
|------|-----|-------|
| Dedupe Wave A/B + tokens visual pass | [`DEDUPE-EYEBALL-LIST.md`](DEDUPE-EYEBALL-LIST.md) | Partial 2026-07-27; finish when convenient |
| Design-system gallery | BACKLOG § QUEUED | Not built yet — queued |

---

## What agents are doing without you

| Priority | Work | Status |
|----------|------|--------|
| **#1** | `/login` Sign in with Google + Playwright | **DONE** — merged [`122bf761`](https://github.com/Arangarx/tutoring-notes/commit/122bf761) |
| #1 next | Calendar OAuth MVP (after Console path clearer) | Queued — needs your Console rows above before submit |
| #2 | Student-detail Start / consent / claim findability | **DONE** — merged [`f08d56b5`](https://github.com/Arangarx/tutoring-notes/commit/f08d56b5) |
| #3 | Tutor signup / self-serve auth | **In flight** — Google signup → WAITLISTED + operator notify (`feat/google-signup-waitlisted`). `/login` Google stays existing-users-only. |
| #4–7 | Email OTP 2FA, scheduling, security MUST, instrumentation | Queued per BACKLOG |

**You do not need to smoke** Sign-In UI until feature DONE (Playwright green + verify + merge). Then one hardware pass: real Google account that already exists as `AdminUser` → `/login` → Google → land past 2FA setup as today.

**Live Sign-In smoke (after merge) also needs:**
- Redirect URI: `https://<host>/api/auth/callback/google` (prod `usemynk.com`) and `http://localhost:3100/api/auth/callback/google` (or your local port)
- `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` set on the Vercel env for that deployment
- Same Mortensen Apps umbrella OAuth client as Gmail; scopes `openid email profile` only
- Google does **not** auto-provision — email must already be an `AdminUser`

**Known leftover (not this PR):** visual `login.png` baseline + pre-existing login `page-has-heading-one` a11y (`AuthShell` title is a `<div>`). Follow-up, not a Sign-In blocker.

---

## One-liner “where are we?”

> Release track option B. Sign-In UI + student-detail Start/claim **shipped**. Agents on **#3 Google signup → WAITLISTED**. Your open work = **Console checklist above**.
