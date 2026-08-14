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
| 5 | **Add** `{host}/api/auth/calendar/callback` (prod + localhost) — **do not submit verification yet** | Agents are wiring Calendar connect (scopes only; sync stubbed) so this URI will be live | No for code; **yes for live Calendar connect smoke** |
| 6 | Enable **Google Calendar API** on the Mortensen Apps client. Add scopes `calendar.events` + `calendar.readonly` to the consent screen. **Submit ONE bundled verification** only after the Connect-Calendar demo is on a crawlable URL (honest stub is enough — no two-way sync required for the screencast) | Andrew 2026-08-14: **one re-verify only** when scopes change | Yes for Google review submit |

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
| #1 next | Calendar OAuth **connect + stub** | **DONE** — merged [`da93ab78`](https://github.com/Arangarx/tutoring-notes/commit/da93ab78). Add callback URI + enable Calendar API; **submit one bundled verification** when this is on prod/preview |
| #2 | Student-detail Start / consent / claim findability | **DONE** — merged [`f08d56b5`](https://github.com/Arangarx/tutoring-notes/commit/f08d56b5) |
| #3 | Tutor signup / self-serve auth | **DONE** (first chunk) — merged [`2f54459f`](https://github.com/Arangarx/tutoring-notes/commit/2f54459f). Google from `/signup` → WAITLISTED; you approve at `/admin/tutor-approvals`. |
| #4 | Email OTP 2FA (TOTP stays) | **DONE** — enroll [`ab70f002`](https://github.com/Arangarx/tutoring-notes/commit/ab70f002) + TOTP login email-alt [`529f619e`](https://github.com/Arangarx/tutoring-notes/commit/529f619e) |
| #5 | Native schedule CRUD | **DONE** — merged [`1bbd9216`](https://github.com/Arangarx/tutoring-notes/commit/1bbd9216). Google outbound write waits on your Console verification. |
| #6 | Security MUST for strangers | Origin pin + VERIFY-ACCT-1 + `/api/test/*` hard-404 **DONE** [`bb6d3095`](https://github.com/Arangarx/tutoring-notes/commit/bb6d3095). Exploring next MUST chunk. |

**You do not need to smoke** Sign-In UI until feature DONE (Playwright green + verify + merge). Then one hardware pass: real Google account that already exists as `AdminUser` → `/login` → Google → land past 2FA setup as today.

**Live Sign-In smoke (after merge) also needs:**
- Redirect URI: `https://<host>/api/auth/callback/google` (prod `usemynk.com`) and `http://localhost:3100/api/auth/callback/google` (or your local port)
- `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` set on the Vercel env for that deployment
- Same Mortensen Apps umbrella OAuth client as Gmail; scopes `openid email profile` only
- Google does **not** auto-provision — email must already be an `AdminUser`

**Known leftover (not this PR):** visual `login.png` baseline + pre-existing login `page-has-heading-one` a11y (`AuthShell` title is a `<div>`). Follow-up, not a Sign-In blocker.

---

## One-liner “where are we?”

> Release track option B. Through #5 + three #6 security chunks shipped. Agents picking next MUST. Your open work = calendar callback URI + **one** Google verification when live.
