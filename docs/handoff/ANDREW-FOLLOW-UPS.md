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
| **#1** | `/login` Sign in with Google + Playwright | **In flight** (2026-08-14) |
| #1 next | Calendar OAuth MVP (after Console path clearer) | Queued |
| #2 | Student-detail Start / consent / claim findability | Queued after Google Sign-In UI lands |
| #3–7 | Tutor signup, email OTP 2FA, scheduling, security MUST, instrumentation | Queued per BACKLOG |

**You do not need to smoke** Sign-In UI until feature DONE (Playwright green + merge). Then one hardware pass: real Google account that already exists as `AdminUser` → `/login` → Google → land past 2FA setup as today.

---

## One-liner “where are we?”

> Release track option B. Agents on **Priority #1 Google Sign-In UI**. Your open work = **Console checklist above**. Next after Sign-In UI = calendar prep + Priority #2 Sarah student-detail Start/claim.
