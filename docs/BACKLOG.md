# Tutoring Notes — Backlog

Living document for open work, pilot feedback, reliability gaps, and deferred product decisions.

## 🎯 Release priorities (Andrew 2026-07-30, option B) — do these first, in order

We are on the **release track**: expand beyond Sarah to unsupervised new pilots. **Re-ranked after Sarah 2026-07-29 meeting** (Andrew chose **B**: Google external before student-detail UX). Ordered priorities:

1. **External Google validation** — Sign-In UI + Calendar scopes / Console prep + hybrid verification (long lead times). Detail below (§ Priority #1).
2. **Student-detail Start / consent / claim findability (P0)** — **DONE** 2026-08-14 (`f08d56b5`, verified). Top `UnclaimedParentClaimBanner` + `SessionStartBlockedCallout`. Optional leftover: flag-off Playwright, mobile viewport, desktop double mint button.
3. **Tutor signup / self-serve auth** — **first chunk DONE** 2026-08-14 (`2f54459f`): Google on `/signup` → WAITLISTED + operator notify; `/login` Google still no-provision without signup-intent. Leftover: pagination, REJECTED UI, invite links.
4. **2FA pilots will finish** — email OTP **DONE** (`ab70f002` enroll + `529f619e` TOTP login email-alt). SMS later; TOTP stays as upgrade.
5. **Finish scheduling** — **native CRUD DONE** 2026-08-14 ([`1bbd9216`](https://github.com/Arangarx/tutoring-notes/commit/1bbd9216)). Google outbound event write later (after Console verification). Two-way sync still P3.
6. **Security MUST for strangers** — release-triage MUST security/ownership holes before unsupervised pilots.
7. **Comprehensive instrumentation** — first-party analytics on COPPA-risk surfaces; third-party (e.g. PostHog) only on non-COPPA (marketing/logged-out). **Terms/Privacy stay 100% honest.** Archived reference: `docs/archive/handoff/posthog-analytics-tier-0-1-bootstrapper.md`.

**Background (not blocking the ordered list):** Wave C/D dedupe (fragile WB/A/V — Opus-grade); agenticPipeline Phase 2; NativeSelect; design-system gallery. Dedupe Wave A/B + tokens already done — new work still = zero new duplication ([`docs/DEDUPE-PLAN.md`](DEDUPE-PLAN.md)).

### QUEUED — `/admin/design-system` component gallery (Andrew 2026-07-27)

**Why:** Andrew’s work days no longer have appetite for full-site manual reviews — hunting every card/subpage to eyeball dedupe/layout is too slow. Agents must give him a **findable, organized** eyeball surface instead of “go look around the app.”

**What:** Operator-gated (platform maintainer only — `OPERATOR_EMAILS` ∪ `ADMIN_EMAIL`; **not** future school/org admins) Next.js gallery at `/admin/design-system`, organized by composition tier:

1. Primitives (`ui/*` variant matrix)
2. Patterns (§1A recipes)
3. Compositions (SectionCard, SubNav, PageShell, …)
4. In-context deep links to live routes
5. Fenced (WB chrome / recording / A/V) — link-outs only; gallery does **not** claim to represent live session chrome

Each specimen: light/dark, canonical path, confidence badge (`isolated` | `composed` | `live-route-only`). Honesty rule: gallery PASS ≠ surface PASS when page-local CSS still overrides.

**Gate:** Same allowlist as feedback/dev-tools — rename/document as **site operator / platform**, never expand with org-admin roles.

**Sequencing:** After feedback anti-spam Phase 1 lands (in flight); thin Tier 1–2 first, then grow with inventory. Sync with [`V1-COMPONENT-LIBRARY.md`](V1-COMPONENT-LIBRARY.md) + [`handoff/DEDUPE-EYEBALL-LIST.md`](handoff/DEDUPE-EYEBALL-LIST.md).

**Status:** `OPEN` — queued for next available executor wave (not Wave C/D fragile).

### Priority #1 — external Google approvals (ACTIVE; ~4–6 week lead)

Audit 2026-07-10; **elevated to #1** (Andrew option B, 2026-07-30). Long external lead times → kick off before dependent features finish.

**Andrew (Google Cloud Console — no code):**
- **Confirm consent-screen status** at [console](https://console.cloud.google.com/apis/credentials/consent): Published/In-production? `gmail.send` verified? (docs claim verified 2026-05-30 — confirm still true; INDEX was stale.)
- **`usemynk.com`** — verify in Google Search Console + re-submit branding if pending ([`LEGAL-SYNC.md`](LEGAL-SYNC.md) re-verification to-do).
- **Redirect URIs** for `usemynk.com` (+ legacy Vercel): `/api/auth/callback/google` (sign-in), `/api/auth/gmail/callback` (existing), **`/api/auth/calendar/callback`** (Calendar connect — add now).
- **Calendar scope model — DECIDED (Andrew 2026-07-10): TWO-WAY sync.** Request `calendar.events` + `calendar.readonly` in the bundled verification. Watch/webhooks later.
- **ONE bundled verification (Andrew 2026-08-14):** hook up Calendar OAuth **now** (connect + token store + honest stub) even if sync is not implemented, so Andrew does **not** re-verify later when sync lands. Do **not** put calendar scopes on NextAuth Sign-In/Sign-Up (`openid email profile` only). Submit review only after the Connect demo is crawlable.

**Sequencing (Andrew 2026-07-10):** Calendar verification = **hybrid** — Console prep **NOW** + MVP demo build, **then** submit bundled verification. **Apple Calendar** = CalDAV / no Google-style app review — **defer**. **Sign in with Apple** = optional (Apple Developer enrollment only if pursued). **Skip Facebook.** **Microsoft** = optional.

**Our code (parallel prep):** `/login` Sign in with Google — **DONE** (`122bf761`). Calendar **connect+stub DONE** 2026-08-14 (`da93ab78`, verified) — scopes exist for the one verification; sync not live. Scheduling backend (Priority #5) is real two-way sync later.

**State:** Gmail send = shipped. Google Sign-In UI = shipped. Calendar connect+stub = shipped. Andrew Console: [`docs/handoff/ANDREW-FOLLOW-UPS.md`](handoff/ANDREW-FOLLOW-UPS.md) — add calendar callback URI + enable Calendar API; submit bundled verification after this commit is on a crawlable URL.

**Follow-ups from Calendar verify (non-blocking):** extract shared Gmail/Calendar OAuth helper before a third Google connect flow; tag `calendar-oauth-connect.spec.ts`; reconcile schedule mock `SessionSyncBadge` “Synced” vs stub honesty.

**Optional follow-ups (non-blocking, from Sign-In verify):** update `login.png` visual baseline; Playwright DOM-order assert (Mortensen notice above button); negative test when Google env unset; pre-existing login `page-has-heading-one` a11y.

### Non-negotiable standards (no exceptions without Andrew's explicit documented waiver — agents may NEVER self-authorize)

1. **ZERO unjustified duplication — no bespoke bullshit.** [`.cursor/rules/composition-no-duplication.mdc`](../.cursor/rules/composition-no-duplication.mdc).
2. **Exhaustive red/green testing to spec on every touched surface.** [`.cursor/rules/exhaustive-testing-mandate.mdc`](../.cursor/rules/exhaustive-testing-mandate.mdc).
3. **Independent agentic verification** of code + tests before done/merge; moving to a fully agentic pipeline. [`.cursor/rules/agentic-verification-pipeline.mdc`](../.cursor/rules/agentic-verification-pipeline.mdc).

### Triage corrections (Andrew 2026-07-10, on the swing-item review)

- **WS-M** (two-device: tutor hears student) — **RESOLVED**, working for a while. Close; drop from MAYBE.
- **DEVICE-PICKER-DEDUPE / mobile Back-Front** — **best-effort; do NOT delay release** over it. Stays MAYBE, non-blocking.
- **Share/copy-link silent clipboard failure** — likely **fixed/moot**; VERIFY then close.
- **ST-05 laser** — bidirectional works; remaining is **color review only** (WB-LASER-ICON-CONTRAST), not functionality.
- **Student bidirectional video / dark-canvas (swing item H)** — status uncertain; **verify whether still an issue** against current `master`.
- **AI prompt v8 — homework → plan (swing item M)** — Andrew (2026-07-10): **PRIORITIZE** the prompt refinement. Promote toward MUST (note-quality moat). (Earlier "already relabeled" referred to form sections, not this.)
- **General:** backlog has stale/slightly-out-of-date rows — a **freshness pass against current `master`** is warranted when picking items up (many were extracted from now-archived docs).

---

**How to use this backlog**

| Symbol | Meaning |
|--------|---------|
| **P0** | Sarah-facing breakage — blocks confident pilot use |
| **P1** | Reliability / important — fix before scaling pilots |
| **P2** | Enhancement — real value, not day-one blocker |
| **P3** | Someday / post-pilot / strategic |

**Area tags:** `[REC]` recorder · `[AV]` live A/V · `[WB]` whiteboard · `[NOTES]` notes/AI · `[AUTH]` identity · `[CONSENT]` consent/COPPA · `[UX]` design/chrome · `[TEST]` harness · `[OPS]` platform · `[LEGAL]` legal · `[GTM]` commercial

**Status:** `OPEN` · `VERIFY` (shipped — confirm on hardware/gates, then close) · `WATCH` (merged — monitor) · `WAIVED` (known, accepted for cut)

**Sequencing:** wave order lives in [`docs/RELEASE-ROADMAP.md`](RELEASE-ROADMAP.md) — do not duplicate here.

**Archive:** `docs/archive/` is cold storage; authoritative open work must appear here.

**Program overlay:** Experience-Driven Wedge (2026-06-12) — WB reliability = gate; continuity + note-quality = moat; instrumentation = first-party post-master. Founding principle: total honesty, no dark patterns. Spec: [`docs/research/continuity-wedge-brainstorm-2026-06-12.md`](research/continuity-wedge-brainstorm-2026-06-12.md).


## Release triage — new-pilot gate (2026-07-10)

Bucketed for expanding beyond Sarah to **unsupervised new pilots** (strangers, not Sarah). **MUST** = data loss, silent failure, broken core flow (record → notes → replay → share → lifecycle), legal/privacy/COPPA honesty violation, security/ownership hole, or untrustworthy-to-a-stranger. **MAYBE** = Andrew's risk-tolerance call. **1.x** = post-release enhancements, scale, org/university, pricing/strategy.

### MUST before new pilots

#### Recording & session lifecycle

- **B11** — release camera/mic tracks on session end (§3)
- **beforeunload guard mid-recording (reliability #9)** —  (§3)
- **Hot-swap mic / track.onended (reliability #7)** —  (§3)
- **In-progress segment IDB on crash (reliability #1)** —  (§3)
- **PRESARAH-1** — always-on recording; remove recording-intent toggles (§1)
- **recording-end-to-end** — review auto-start from 0 (§1)
- **recording-resilience** — SessionRecording rows after reopen (§1)
- **SMOKE-AUDIO-1** — first-acquire mic silent until switch-and-back (§1)
- **SMOKE-END-WINDDOWN** — disarm board + immediate student wind-down on End (§1)
- **Upload-failure blob persistence (reliability #2)** —  (§3)
- **W1-SHIP-B-FINALIZE** — `finalizeOutboxAfterEnd` drops all IDB rows (§3)
- **W1-SHIP-B-STUCK** — `stuck` semantics + UX vs `permanent-fail@50` (§3)
- **WS-B** — tab-kill resume loses pre-kill audio in replay/notes (§1)
- **WS-G** — server-side tutor:mic concat replay master (§3)
- **WS-N-PAGEHIDE** — in-progress segment flush at tab-kill (§3)
- **WS-N5** — resume FSM `armed` window drops stroke capture after reopen (§1)

#### Notes & AI

- **Map/reduce accuracy + abstain-on-low-content + eval harness** —  (§5)
- **SMOKE-NOTES-1** — post-End shimmer; form must stay visible (§1)
- **SMOKE-NOTES-3** — notes fabricate on non-teaching talk (§1)
- **WS-K** — incremental reduce; End ≤2–3s notes ready (§3)

#### Whiteboard, sync & replay

- **AV-REFRESH-LOSS** — student hard-refresh loses A/V (§4)
- **Gate A2** — waiting room (§4)
- **Gate A5** — live bidirectional sync completeness audit (§1)
- **Gate A6** — replay fidelity + AV/timer sync comprehensive pass (§1)
- **Hide replay must pause audio** —  (§4)
- **In-person waiting-room consent projection (Plan #2)** —  (§4)
- **PDF cross-page stroke bleed (regression)** —  (§4)
- **Replay scrub drag** — 429s + frozen scene (§4)
- **SMOKE-BLOCK-5** — solo/in-person stroke capture in armed window (§4)
- **SMOKE-UX-1** — replay auto-play jumps to scrubber end (§1)
- **SSG-2 / PRESARAH-2** — student-detail End → End-and-review (no silent data loss) (§1)
- **SSG-3 / A6-1** — multi-segment replay scrubber + proportional seek (§1)
- **Student canvas file sync (images/PDF)** —  (§4)
- **Student canvas stuck on "Loading scene…"** —  (§4)
- **Student Exit → rejoin presence desync** —  (§4)
- **Student undo/redo non-functional** —  (§4)
- **Unclaimed-student workspace entry redirect** —  (§4)
- **view-whiteboard-new-replay** — parent share strict-mode locator (§1)
- **wb-replay-scrub-seek ×3** —  (§1)
- **WS-T-8** — roster End shows replay CTA when recording-count===0 (§4)
- **WS-T-9** — gate-only End IDB crash (§4)
- **WS-X** — PDF board stroke leak via v3 broadcast tombstone (§1)

#### Live A/V & devices

- **BUG-8** — reconnect media transport not rebuilt after peer leave/rejoin (§1)
- **Phone student A/V** — bidirectional broken (§4)
- **SMOKE-BLOCK-1** — reachability under-reports connected peer (Start dead) (§1)
- **WS-I-PRESTART-MUTE** — tutor mute before audio graph arms (§3)

#### Consent, COPPA & erasure

- **allowWhiteboardRecording real enforcement (WB-CONSENT-UNCONDITIONAL)** —  (§6)
- **assertEffectiveConsent legacy no_snapshot → pass** —  (§6)
- **CH-SMOKE-PLAYWRIGHT-GAP-CONSENT-ERASURE** —  (§6)
- **CLIENT-AUDIO-CONSENT-GATE** — client consent projection completeness (§1)
- **Consent modal removal** — Andrew legal sign-off (§6)
- **CONSENT-COLLECTION-COMPLETENESS (CC-1/CC-2)** —  (§6)
- **CONSENT-HONESTY-SARAH-MERGE-BLOCKER** —  (§6)
- **createChildLearnerAction** — no ConsentRecord at create (§6)
- **Erasure parent/account-holder self-serve UI + CRITICAL_ACTION** —  (§6)
- **Essentials-vs-optional tier ratification** —  (§6)
- **LIVE-SESSION-CONSENT-COPY** —  (§6)
- **Non-technical tombstone/grace copy** —  (§6)
- **Parent self-service erasure (non-admin)** —  (§6)
- **Sarah test-student audit + TEST purge** —  (§6)

#### Legal & privacy

- **Audio recording of minors** — consent flow research (§6)
- **CONSENT-LEGAL-CONSULT** —  (§6)
- **OpenAI vendor ops checklist** —  (§6)
- **PII / privacy policy before public launch** —  (§6)
- **SEC-POLICY-TRUTH** — retention lifecycle enforcement (§1)
- **Umbrella + product privacy retention (§312.10)** —  (§6)

#### Auth, identity & security

- **Account-takeover defense (1/3) email-confirmation signup** —  (§6)
- **Account-takeover defense (2/3) notify-on-password-reset** —  (§6)
- **Account-takeover gap on existing-email signup** —  (§6)
- **Email-infrastructure prerequisite (Resend on usemynk.com)** —  (§6)
- **Gate B2** — parent privacy consent lattice + management UI (§6)
- **Join denial UX** — authenticated wrong principal gets bare 404 (§6)
- **npm audit Tier B (SHOULD-FIX-4)** —  (§6)
- **SEC — /api/test/whiteboard/* gate hardening** — /api/test/whiteboard/* gate hardening (§6)
- **SEC — tutor-asset/route.ts any-origin blob URL** — **DONE** 2026-08-14 ([`0252a889`](https://github.com/Arangarx/tutoring-notes/commit/0252a889)): `isBlobUrlForSession` pins origin via `isAllowedBlobUrl` (all three wb-asset proxies).
- **SMOKE-PRIV-1** — learner sign-out leaves parent session on shared device (§1)
- **VERIFY-ACCT-1** — duplicate-account creation block — **DONE** 2026-08-14 (cross-realm email check; §6)
- **WB-ADULT-JOIN-ENABLEMENT B2-signup / B3 / B4** —  (§6)
- **WB-PARENT-JOIN-AS-CHILD** — parent_session_select picker (§6)

### MAYBE — Andrew to prioritize

#### Recording & session lifecycle

- **Android Chrome matrix fill-in** —  (§8)
- **audioStartedAtMs ordering bug** —  (§3)
- **B6** — audio recovery after external app steals mic (§3)
- **Cross-session stuck/orphaned draft surfacing (1b)** —  (§3)
- **Custom SessionAudioPlayer (D10) + stitch-path retirement** —  (§3)
- **deviceHealth FSM input + `dvc` logging** —  (§3)
- **Draft clear / handleReset edge cases (1d, 1e)** —  (§3)
- **End-session replay: per-student-mic mix UX** —  (§3)
- **finalizeOutboxAfterEnd register path / legacy segment register deprecation** —  (§3)
- **Live transcription (LTX) spike** —  (§3)
- **Long-form transcribe smoke (60–90 min)** —  (§3)
- **macOS ondevicechange debounce** — unvalidated (§3)
- **network_offline FSM input not wired** —  (§3)
- **Pause vs rollover race (reliability #8)** —  (§3)
- **Per-student recording default** —  (§13)
- **Recording auto-pause on student disconnect** —  (§13)
- **Recovery banner stacking** — audio + WB + disconnect (1c) (§3)
- **rid= / lifecycle log coverage (reliability #13, #14)** —  (§3)
- **Sarah forward-migration at re-arch cutover** —  (§3)
- **Session timer drift on iOS (reliability #4)** —  (§3)
- **SMOKE-PERF-1** — Finalizing fixed overhead (~5–10s) (§3)
- **timelineStartMs / unified wall-clock session timeline** —  (§3)
- **TURN (A4 Slice-C)** —  (§3)
- **useRecordingCoordinator extraction** —  (§3)
- **WebM/MP4 duration unreliable for scrubbing (reliability #5)** —  (§3)
- **Whisper CJK / language pin** —  (§3)
- **WS-A-F-1** — outbox register-failure attempt cap (§3)
- **WS-J prod migration apply** —  (§3)
- **WS-K prod migration apply** —  (§3)

#### Notes & AI

- **AI link extraction from spoken URLs** —  (§5)
- **AI link extraction, scrubbing, playback during review, gap detection** —  (§13)
- **AI note generation context hygiene** —  (§5)
- **AI prompt** — literal vs interpretive Assessment (§5)
- **AI prompt v7 remainder** —  (§5)
- **AI prompt v8** — homework → plan (Sarah) (§5)
- **Audio playback during note review** —  (§5)
- **Audio scrubbing / duration 0:00** —  (§5)
- **MB-5 verify** — tutor_only notes path (§5)
- **Recorder gap detection in pending list** —  (§5)
- **REQ-S3-1** — Formatted markdown `.ai-prose` (§5)
- **REQ-S3-2 / REQ-S3-2a** — Save notes semantics + Cancel session (§5)
- **REQ-S3-4** — canonical notes schema (§5)
- **Slice-3 N1–N4 deferred findings** —  (§5)
- **Slice-3 S3** — notes reduce job-in-flight lock (§5)
- **SMOKE-NOTES-2** — live/progressive notes during session (§5)
- **Tutor-initiated join-link rotation** —  (§13)
- **Whisper CJK false positive** —  (§5)
- **Whisper repetition-loop hallucination** —  (§5)
- **Whisper transcription accuracy / short phrase misses** —  (§5)

#### Whiteboard, sync & replay

- **Active-ping 409 after End** —  (§4)
- **Asymmetric viewport when follow OFF** —  (§4)
- **CH-SMOKE-REPLAY-PLAYPAUSE-OVERLAP** —  (§4)
- **Cold refresh vs server truth** —  (§4)
- **Eraser bulk delete dimmed-not-deleted** —  (§4)
- **Eraser cursor vs delete path (TM-08)** —  (§4)
- **Event log + replay multi-page** —  (§4)
- **Excalidraw recovery "Load draft" popup** —  (§4)
- **Exit→rejoin A/V slow / ghost** —  (§4)
- **Freedraw latency PR-01** —  (§4)
- **Gate A3** — Pass-2 in-context end-session / review shell (§4)
- **Gate A3a** — PDF page-tab indicator (§4)
- **Gate A3b** — SR-04a video-tile sizing (§4)
- **Ghost viewport bounds overlay (VP-01 / SMOKE-POST-1)** —  (§4)
- **Graph JSXGraph swap follow-ups** —  (§4)
- **Local dev join URL parity** —  (§4)
- **MathInsertButton first-open white-box** —  (§4)
- **Mobile AV pip** — SR-16 (§4)
- **Multi-part recording warning banner stale on replay** —  (§4)
- **Native image insert broken on drag/drop** —  (§4)
- **NR-07** — transform handles with native chrome hidden (§4)
- **p3-video-seam** —  (§4)
- **PDF open** — fit tutor vs student view (§4)
- **PDF position lock / pan-clamp design spike** —  (§4)
- **Per-board undo/redo history** —  (§4)
- **Per-page view state** — student validation (§4)
- **Post–sync-redesign smoke findings** —  (§4)
- **Preview-before-Start canvas wipe race** —  (§4)
- **Promote math insert to toolbar + library persistence** —  (§4)
- **Re-enable Playwright invariant 8 (PDF center+fit)** —  (§4)
- **Replay audio loading CLS** —  (§4)
- **Replay board tabs missing PDF icons** —  (§4)
- **Replay disabled top-bar buttons dimming** —  (§4)
- **Replay page strip PDF section grouping** —  (§4)
- **Replay pause→hide→reopen state** —  (§4)
- **Replay theme click → unexpected nav** —  (§4)
- **Room policy & joiner UX** —  (§4)
- **Session time logging** —  (§13)
- **Session type selection UX (in-person vs remote)** —  (§4)
- **SMOKE-BUG-10** — in-person "waiting for student" banner (§4)
- **SMOKE-BUG-2** — stale "Call Reconnecting" pill (§4)
- **SMOKE-BUG-3** — student text cross-page sync (§4)
- **SMOKE-BUG-5** — replay board-tab context (§4)
- **SMOKE-BUG-7 / CH-SMOKE-STUDENT-MIC-PERSIST** —  (§4)
- **SMOKE-UX-3** — replay ±10s skip (§4)
- **Snapshot link discoverability** —  (§4)
- **Snapshot multi-page coverage** —  (§4)
- **ST-05 / WB-LASER-ICON-CONTRAST** — laser colors + bidirectional visibility (§4)
- **Start/end session "flash reload" feel** —  (§4)
- **Student `[student-apply]` console spam** —  (§4)
- **Student bidirectional video (tiles flash/disappear)** —  (§4)
- **Student dark-theme canvas background stuck white** —  (§4)
- **Student default AV peer-only (self-view off)** —  (§4)
- **Student desktop mic level meter missing** —  (§4)
- **Student mobile tool/chrome parity** —  (§4)
- **Student naming paradigm** — single-student fallback (§13)
- **Student waiting room screen design** —  (§4)
- **Thin-viewport top-bar compaction** —  (§4)
- **TM-09** — tutor-mobile expectations notice + host gate (§4)
- **TU-11** — keyboard-shortcut routing parity (§4)
- **TU-12 / Excalidraw theme follows app data-theme** —  (§4)
- **Tutor tab doesn't follow new session creation** —  (§13)
- **Tutor-vs-student insert origin (viewport-center)** —  (§4)
- **WB-AV-STUDENT-INITIALS-ONLY** —  (§2)
- **WB-COMPONENTS-PASS** —  (§4)
- **WB-FINISH-REVIEW-COPY-CONTEXT** —  (§4)
- **WB-HAND-TOOL-MISSING (NR-01)** —  (§4)
- **WB-IDLE-SESSION-GUARD** —  (§3)
- **WB-IMAGE-IMPORTER** — image insert missing (§4)
- **WB-LINE-END-TOUCH** —  (§4)
- **WB-MENU-CLICK-THROUGH** —  (§4)
- **WB-PDF-BLOB-TOKEN** —  (§2)
- **WB-REPLAY-PDF-PLACEHOLDER** —  (§2)
- **WB-REPLAY-REOPEN-START-AT-0** —  (§2)
- **WB-REVIEW-DELETE-COPY** —  (§4)
- **WB-REVIEW-THUMBNAIL-PDF** —  (§4)
- **WB-SHARE-REPLAY-VIEWPORT-PHONE** —  (§4)
- **WB-STROKE-BLEED** —  (§2)
- **WB-STROKE-BLEED watch** —  (§4)
- **WB-STUDENT-BOARD-TABS** —  (§4)
- **WB-STUDENT-VIEW-LOCK-WHEN-SYNCED** —  (§4)
- **wb-tab-kill-audio-durability ×2** — empty tutor:mic segments (§1)
- **WB-TUTOR-REPLAY-PHONE-LAYOUT** —  (§4)
- **Whiteboard session audio wire** —  (§4)
- **Whiteboard undo touch + visible button** —  (§13)
- **Workspace SSR 500** —  (§13)
- **WS-U 1.4** — empty review screen copy (§4)
- **WS-U-FRAGILE 2.4/2.5** — LIVE badge + sync pill visibility (§4)

#### Live A/V & devices

- **BUG-9** — camera hotswap mid-session does not recover cleanly (§1)
- **DEVICE-PICKER-DEDUPE / WB-DEVICE-PICKER-DUPES** —  (§8)
- **DEVICE-PICKER-MOBILE-FACINGMODE** —  (§8)
- **Mic hot-plug requires hard refresh (B1-B4 smoke)** —  (§8)
- **Slow first peer connect** —  (§3)
- **SMOKE-BUG-11** — tutor mic picker not initialized from tn-mic-device-id (§8)
- **WS-M** — two-device hardware smoke (tutor hears student) (§3)

#### Consent, COPPA & erasure

- **allowEducationalUse toggle + enforcement (BL-B)** —  (§6)
- **BL-A** — tutor-visible per-student consent projection (§6)
- **CH-SMOKE-DQ-CONSENT-CALLOUT-LIVE** —  (§6)
- **CH-SMOKE-DQ-ERASURE-2FA** —  (§6)
- **CH-SMOKE-DQ-ERASURE-ACCOUNT-LOOKUP** —  (§6)
- **CH-SMOKE-DQ-ERASURE-COPY-JARGON** —  (§6)
- **CH-SMOKE-DQ-MULTI-STUDENT-LIVE** —  (§6)
- **CH-SMOKE-SETTINGS-SAVE-ON-TOGGLE** —  (§6)
- **CH-SMOKE-STUDENT-MIC-PERSIST** —  (§6)
- **Erasure 2FA step-up** —  (§6)
- **Erasure operator lookup UX (MB-2)** —  (§6)
- **ERASURE-ADMIN-METADATA** —  (§6)
- **ERASURE-CLIENT-STORE-UNREACHABLE** —  (§6)
- **ERASURE-INFLIGHT-CHECKPOINT** —  (§6)
- **ERASURE-ORPHAN-AUDIO-BLOBS** —  (§6)
- **WB-NOTES-EMAIL-SUBSCRIPTION-REFRAME** —  (§6)

#### Auth, identity & security

- **2FA remember-device open decisions** —  (§6)
- **ADMIN-PARENT-BLOCK-LIVE** —  (§6)
- **BL-ADMIN-UUID-PICKER** — 2FA reset target picker (§6)
- **BL-RESET-DOMAIN** — reset email respects originating host (§6)
- **BL-RESET-GENERATE** — Chrome suggest-password on /reset-password (§6)
- **BL-VERIFY-SUCCESS-COPY** — post-verify affirmation (§6)
- **Claim flow: self-learner shouldn't see child PIN setup** —  (§6)
- **Claim interstitial** — verify claim-email host vs preview (§6)
- **Gate B1** — approval-gating / waitlist (§6)
- **Gate B3** — security checks + final cleanups (§6)
- **In-memory rate limiters → Neon** —  (§6)
- **Notes first-class authenticated chrome (P2-AC-12/13)** —  (§6)
- **Parent→self-learner toggle post-create** —  (§6)
- **PLAYWRIGHT-GAP** — /join #k= fragment preservation (§6)
- **SEC-1 R3** — cross-preview impersonation SSO (§6)
- **Signup waitlist pagination + Google OAuth auto-provision** —  (§6)
- **Signup waitlist REJECTED + revocation UI** —  (§6)
- **WB-FLAKE-JOIN-STALECOOKIE** —  (§6)
- **WB-JOIN-LEARNER-SESSION-PERSISTENCE** —  (§6)

#### UX & design system

- **DESIGN-SYSTEM-GALLERY** — `/admin/design-system` platform-maintainer-only component gallery (Andrew 2026-07-27). See Release priorities § QUEUED. Enables eyeball without full-site hunting. (§7)
- **2FA inline verify-at-login** —  (§7)
- **ADMIN-STUDENT-DETAIL-MOBILE-DISCOVER** —  (§7)
- **ADMIN-STUDENT-DETAIL-MOBILE-ICONS** —  (§7)
- **Cohesive pass open questions** —  (§7)
- **Component-duplication + @layer base CSS cleanup** —  (§7)
- **dark: → semantic token migration** —  (§7)
- **Double scrollbars on admin pages** —  (§7)
- **Error/legal/public shells legacy cleanup** —  (§7)
- **Formalize IA decisions in UX-AND-A11Y-SPEC §15** —  (§7)
- **Foundation pass** — promote surface-local shells to library (§7)
- **Gate A1** — cohesive visual review + mock-faithful composition (§7)
- **Keyboard undo Ctrl+Z misbehaves (pilot B1)** —  (§7)
- **Known issues & roadmap** — top-level sidebar link (§7)
- **Known issues page placement/tone** —  (§7)
- **Known-issues section headers too muted** —  (§7)
- **L3** — student WB chrome parity on /join (§7)
- **L6** — WbStatusPill / connected-sync status (§7)
- **Learner/student logged-in top-bar oversized** —  (§7)
- **Live board ⋯ More PDF affordance discoverability** —  (§7)
- **Live board Sign out row dimmed/clipped** —  (§7)
- **MarketingHeader inline styles → primitives** —  (§7)
- **Missing primitives** —  (§7)
- **Mobile color palette dismiss I7** —  (§7)
- **Parent consent editor save wiring** —  (§7)
- **Parent dashboard Manage button alignment** —  (§7)
- **Part 3 student Sign out in top-bar ⋯** —  (§7)
- **Password fields show/hide toggle** —  (§7)
- **Pen panel too large (pilot-2026-06-06 U5)** —  (§7)
- **PreSessionPanel / StartWhiteboardSession mock alignment** —  (§7)
- **Recovered-audio prompt** — always keep, no Discard (§7)
- **REQ-S3-3** — Identity chip + test-account badge (§7)
- **Scheduler Group F visual-only** —  (§7)
- **Share/copy link silent clipboard failure (pilot B2)** —  (§7)
- **Start/end session flash reload feel** —  (§7)
- **T2** — accent-recipe pass (§7)
- **Tailwind aliases rounded-panel, border-strong** —  (§7)
- **TFA2** — 2FA setup/verify pages v1 redesign (§7)
- **Thinner default pen stroke (U6)** —  (§7)
- **Time-alert UX** — visible alert clock + settings (§7)
- **Tutor toolbar reorder U4 / shape dropdowns U5-U6** —  (§7)
- **Unclaimed student claim link buried** —  (§7)
- **Verify-email success copy** —  (§7)
- **WB-REPLAY-PAUSE-COPY** —  (§2)
- **WB-WTR-DEVICE-LOADING** —  (§2)
- **WS-J richer per-session billing display** —  (§7)
- **WS-Q tutor settings** — alert defaults (§7)
- **WS-U-FRAGILE taste/IA batch (2.8–2.15)** —  (§7)
- **X2** — v1 design via shared components (DRY) (§7)
- **X3** — AV pip on/off clarity (§7)

#### Testing & harness

- **Admin notes UX Phase 0 visual regression matrix** —  (§9)
- **audio-rollover Playwright not in CI gate** —  (§9)
- **Block B remote-surgical mixdown hardware oracle** —  (§9)
- **F-1 outbox register retry cap** —  (§9)
- **installControllableUploadStub duplication** —  (§9)
- **iOS matrix S1–S14** — real hardware unfilled (§1)
- **JEST-ISOLATION-CLASS-2** —  (§9)
- **phase0-stop** — break CSS deploy-abort verify (§9)
- **PIPELINE-1** — agentic pipeline before release (§9)
- **Recorder test refactor Phases 4–6** —  (§9)
- **RELAY-MARATHON-SHARDS** —  (§9)
- **Site-wide coverage P1 gaps** —  (§9)
- **TEST-REAL-INTEGRATION-SUPERSEDES-SMOKE** —  (§9)
- **upload-outbox.test parallel-race flake** —  (§9)
- **waitForPendingUploads debug surface removal** —  (§9)
- **WS-V / Part-2 site-wide mechanical test buildout** —  (§9)

#### Platform & ops

- **(SARAH-CALL-PREP.md)** —  (§13)
- **Cost observability Phase 2** —  (§10)
- **Cost-event durability hardening** —  (§10)
- **Full product usage instrumentation** — NEAR-IMMEDIATE POST-MASTER (§10)
- **Historical SessionNote timezone backfill** —  (§10)
- **Outbox permanent-failure Datadog/Sentry breadcrumbs** —  (§3)
- **S5** — scheduled topic + notes visible in live session (§11)
- **Scheduling** — backend wiring + calendar sync (§11)
- **Session log billing rate / billed* column naming** —  (§10)
- **Session timer vs billed time during disconnect gaps** —  (§10)
- **Session-log + Wyzant/UVU export (SESSION-LOG-EXPORT)** —  (§10)
- **Solo / in-person production enable + B-5 consent copy** —  (§10)
- **Time-storage / billing display (billed*Local)** —  (§10)
- **Vercel Skew Protection enablement** —  (§10)

#### Commercial & GTM

- **Notes quality moat elevation timing** —  (§5)
- **Public wedge messaging** —  (§5)

### 1.x — can wait

| Group | Count | Notable IDs |
|-------|------:|-------------|
| **§1 Sarah/master-cut ops** | 5 | CUT-1, CUT-4, CUT-5, CUT-6, Ship-to-Sarah gate checklist (Andrew confirms) |
| **§10 Ops/scheduling** | 15 | PostHog analytics Tier 0+1, Operator scoped test-data wipe + orphaned blob sweep, scripts/smoke-long-form-transcribe.mjs headless harness, RECORDER-LIFECYCLE.md preview-before-Start doc drift, docs/WHITEBOARD-ROADMAP-NEXT.md supersede?, Dev-tools adopt manual test user as fixture, … |
| **§11 Scheduling** | 6 | S3, S4, Two-way calendar sync, Google OAuth bundling with calendar scopes, Apple CalDAV vs EventKit path, Reminders / timezone policy |
| **§12 Org/university** | 10 | BYU / institutional pitch track separate from Sarah solo story, Stripe / subscription billing, Operator dashboard scaffolding, University department pitch infrastructure, Wyzant + UVU export formatters, Org-aware billing rounding, … |
| **§13 Strategy/pilot** | 6 | Homework image import workflow, Rethink claim-screen layout, Self-service account deletion, Replay speaker indication, Collapse DRAFT/READY/SENT, Auto-email scheduling |
| **§14 Deferred/someday** | 13 | WB-SCREEN-WAKE-LOCK / WB-THUMBNAIL-GRAPH / WB-OLD-PHONE-PERF, WB-GRAPH-PLACEHOLDER, WB-ENDSESSION-THUMBNAIL-TABS, Desmos live-state capture Phase 1.5, Debounced-disconnect pause trigger confirm, Engagement/dopamine surfaces, … |
| **§2 Post-cut cleanup & WATCH** | 2 | MASTER-CUT-2026-07-09, NOTES-QUALITY-HOLD-DETAIL |
| **§3 Recorder re-arch & scale** | 11 | Wire-level mute coordination, Remote video track recording, SFU for N>5 peers, Large-mesh CPU profiling, Tier 2 transcribe queue / VAD background job, Speaker diarization (Phase 6 task 6), … |
| **§4 WB enhancements** | 25 | WB-LEGACY-STUDENT-CLIENT-DELETE, Laser pointer in replay, Student tab crash, Measure wire bandwidth on real session, GitHub Actions wb-regression workflow, relayShowsCollaborator copy parity, … |
| **§5 Notes/GTM someday** | 4 | Formal eval harness + flywheel, AI edit signal Phase 1, CONTINUITY-V1-CARRYOVER, MAP-ACC |
| **§6 Consent/auth P3** | 28 | allowMessaging / allowVideoRecording when features ship, Child-facing ConsentRestriction UI, CONSENT-UX-REDESIGN / save-on-toggle, Mid-session learner swap (Phase 3), 90-day unclaimed-real-student sunset, Mid-session consent-change poll, … |
| **§7 UX P3 & strategic** | 13 | T9, T10, Consent floor-block checkbox contrast, BG2, Impersonation pip clarity, Video tile docking (SR-04 follow-up), … |
| **§8 Device matrix P3** | 5 | SMOKE-AUDIO-2, SMOKE-AUDIO-3, WS-H NB-1–NB-5, Device-picker cleanup, Firefox untested |
| **§9 Test harness P3** | 2 | Plan1 authed-join hardware failures, Preview email loopback |

**1.x total: 145 items** (all P3/DEFERRED/WAIVED/PROCESS, §12–14 strategy/commercial, master-cut/Sarah-only ops, and enhancements explicitly deferrable for first stranger pilots).

---

## 1. NOW / Sarah-facing

Hotlist: P0/P1 items affecting the live pilot. Post-cut REAL-FAIL cluster at end.

### Recording & session lifecycle

**[P0][REC] SMOKE-AUDIO-1 — first-acquire mic silent until switch-and-back**  
Hardware PASS on attempt #4 (`3468262d`); **VERIFY** on Sarah Brio path. Residual: cold-start camera picker empty for several seconds — see **WB-WTR-DEVICE-LOADING**. Playwright surrogate + silent-RMS oracle; full fix = unify acquire path (`audio-capture-policy` / `useLiveAV`). [automated partial: `wb-tutor-recording-mute.spec.ts`]

**[P0][NOTES] SMOKE-NOTES-1 — post-End shimmer; form must stay visible**  
REOPEN @ `3cffbb7`. Prior hide-the-form regression. Spec: all fields visible with per-field shimmer; placeholder only on empty fields. Playwright-to-spec required. Cross-ref **WB-NOTES-SKELETON** (historical).

**[P0][WB] SMOKE-UX-1 — replay auto-play jumps to scrubber end**  
REOPEN on hardware; green Jest did not catch. Independent oracle: scrubber position vs `audioDurationSettled`. Waived at master cut — still Sarah-facing. Related: **SSG-3**, **WB-REPLAY-REOPEN-START-AT-0**.

**[P0][REC] WS-B — tab-kill resume loses pre-kill audio in replay/notes**  
Master-cut #11: post-resume segment only in transcribed notes. WS-N landed partial durability; full pre-kill segment assembly still open.

**[P1][REC] SMOKE-END-WINDDOWN — disarm board + immediate student wind-down on End**  
Andrew decided 2026-07-09; merged `e58e0826` / `69eacbf6`. **VERIFY** on hardware: `wb-end-winddown.spec.ts` `@wb-presence` `@wb-recording`. PERF-1 snapshot de-await deferred.

**[P1][AV] SMOKE-BLOCK-1 — reachability under-reports connected peer (Start dead)**  
Fix on branch `wb-av-reachability-detection-fix` @ `a962171` **PARKED** unmerged. A/V-required Start gate is correct by design; bug is false `reachableParticipants===0`. Cross-ref **BUG-8** on reconnect.

**[P1][AV] BUG-8 — reconnect media transport not rebuilt after peer leave/rejoin**  
FRAGILE — `peer-mesh.ts` / `useLiveAV.ts`. Pre-existing; surfaced 2026-07-03 re-smoke. Plan + hardware validation before merge.

**[P1][AV] BUG-9 — camera hotswap mid-session does not recover cleanly**  
Same fragile surface as BUG-8. Deferred pending plan.

**[P1][CONSENT] CLIENT-AUDIO-CONSENT-GATE — client consent projection completeness**  
Block B **base shipped** (`audio-capture-policy.ts`, mode-aware server audio, banners). **OPEN:** shallow client enforcement on upload/IDB/transcription paths; per-speaker lane extension (**p3-consent-recording**). Verify `enqueueChunkTranscriptionAction` gates before calling Sarah blocker closed.

**[P1][REC] PRESARAH-1 — always-on recording; remove recording-intent toggles**  
Locked decision. `userWantsRecording` + `StudentRecordingDefaultToggle` still in tree; gate on `phaseActive && audioCapturePolicy`. Fragile FSM surface — Sonnet 5-axis on diff.

**[P1][REC] WS-N5 — resume FSM `armed` window drops stroke capture after reopen**  
On reopen FSM re-enters `armed` → `wbCaptureActive` false. Related to solo/in-person stroke gap; distinct from audio-only fix.

**[P1][WB] WS-X — PDF board stroke leak via v3 broadcast tombstone**  
PARKED `wb-wave5-ws-x-wip`. `applyRemoteToCanvas` tombstone + v3 broadcast does not filter `isDeleted`. Distinct from E2/E4/E5 fixes.

**[P1][NOTES] SMOKE-NOTES-3 — notes fabricate on non-teaching talk**  
Map/reduce accuracy + abstain path. Prompt @ `cefc5cd` PASS for teaching; refinement flagged. Cross-ref **MAP-ACC** (#1 post-master).

**[P1][WB] Gate A5 — live bidirectional sync completeness audit**  
Enumerated bidirectional pass: strokes, shapes, text, eraser, move, pages, PDF, math, graph, undo, assets, **ST-05 laser verify**. Partial: `whiteboard-live-sync-regression.spec.ts` inv 1–12. **Laser wire shipped** (`broadcastPointer`, `useCollaboratorPointers`) — remaining work = hardware verify + color/visibility (**WB-LASER-ICON-CONTRAST**), not "never built."

**[P1][WB] Gate A6 — replay fidelity + AV/timer sync comprehensive pass**  
Partial tests exist; enumerated completion still open. Cross-ref **SMOKE-UX-1**, **SSG-3**.

**[P1][AUTH] SMOKE-PRIV-1 — learner sign-out leaves parent session on shared device**  
Dual-cookie by design; Andrew 2026-07-04: sign-out must not leave someone else's session. Options: learner-only logout landing, device lock clearing both cookies.

**[P1][LEGAL] SEC-POLICY-TRUTH — retention lifecycle enforcement**  
Interim honest copy on `/privacy` (PASS recheck); no enforcing cron / account-closed state modeled. Do not claim fixed retention on `master` until built.

**[P1][OPS] CUT-1 — comprehensive both-theme pre-master smoke**  
Deferral ledger KEEP; full MASTER-CUT style run before next master cut.

**[P1][OPS] CUT-4 — claim Sarah pilot family before NOTES_AUTH_WALL**  
Pre-cut prerequisite; SKIP in master-cut smoke (Sarah camping).

**[P1][OPS] CUT-5 — production env scoping confirm before master cut**  
Open Andrew-confirm.

**[P1][AUTH] CUT-6 — 2FA re-smoke on merged integration tip**  
Not run in master-cut smokebook.

**[P1][TEST] iOS matrix S1–S14 — real hardware unfilled**  
[`docs/PHASE-2-IOS-SMOKE-MATRIX.md`](PHASE-2-IOS-SMOKE-MATRIX.md) all rows empty. S3/S4/S7 dispositive on Sarah iPhone.

**[P0][WB] SSG-2 / PRESARAH-2 — student-detail End → End-and-review (no silent data loss)**  
`ActiveWhiteboardSessionsList` must offer Resume / End and review / Cancel and delete; no silent `endStaleWhiteboardSession` orphan path. In-session End copy reverted to "End session" (distinct surface).

**[P1][WB] SSG-3 / A6-1 — multi-segment replay scrubber + proportional seek**  
DEFERRED post-Sarah per deferral ledger; still REAL-FAIL cluster. Partial: `replay-audio-timeline.ts`, WS-L. **WS-G** concat may unblock clean end-state.

**[P1][REC] Ship-to-Sarah gate checklist (Andrew confirms)**  
Proposed gates a–d: End never silent-deletes; replay scrubber; monolithic notes path retired; waiting→WB→end stable. **PENDING** ratification ([`sarah-pilot-feedback-2026-06-16-orchestrator-report.md`](handoff/sarah-pilot-feedback-2026-06-16-orchestrator-report.md)).

### Post-cut REAL-FAIL cluster (active cleanup)

**[P1][REC] recording-end-to-end — review auto-start from 0**  
Waived at cut; overlaps **SMOKE-UX-1**, **WB-REPLAY-REOPEN-START-AT-0**.

**[P1][REC] recording-resilience — SessionRecording rows after reopen**  
Waived at cut.

**[P1][WB] wb-replay-scrub-seek ×3**  
Waived at cut; scrub drag 429 + frozen scene (**Replay scrub drag** row in §4).

**[P1][WB] view-whiteboard-new-replay — parent share strict-mode locator**  
Waived at cut.

**[P1][WB] wb-tab-kill-audio-durability ×2 — empty tutor:mic segments**  
Likely harness; waived at cut.

---

## 2. Post-master-cut cleanup (2026-07-09)

**[WAIVED] MASTER-CUT-2026-07-09 — Andrew waived red `test:wb-sync` for Sarah delivery**  
Merge `v1-redesign` → `master` @ `1c07b5ba` (~22:39 MT). **Green:** `next build`, `test:regression` (117). **Red (isolation):** 9 REAL-FAIL + 2 ENV-FLAKE — triage as cleanup, not Sarah blockers.

| # | Spec | Issue |
|---|------|-------|
| 1 | `recording-end-to-end` | Review auto-start from 0 |
| 2 | `recording-resilience` | SessionRecording rows after reopen |
| 3–5 | `wb-replay-scrub-seek` ×3 | Scrub seek failures |
| 6 | `view-whiteboard-new-replay` | Share locator strict-mode ×4 |
| 7 | `wb-cancel-pending-session` | cancel→B copy link (Andrew smoke PASS) |
| 8–9 | `wb-tab-kill-audio-durability` ×2 | Empty tutor:mic segments (harness suspect) |
| ENV | cam-off initials tile; cancel→roster URL | Flakes |

**Product knowns waived with cut:** reopen-at-0 (**WB-REPLAY-REOPEN-START-AT-0**), share PDF placeholders (**WB-REPLAY-PDF-PLACEHOLDER**), **WB-WTR-DEVICE-LOADING**.

**[WATCH] WB-PDF-BLOB-TOKEN** — multi-page PDF import partial fail. Merged `bed79060`; 4-attempt backoff. Watch-only.

**[WATCH] WB-STROKE-BLEED** — E5 `b8f786c8`; Andrew evening did not repro. Keep PW gate.

**[WATCH] WB-AV-STUDENT-INITIALS-ONLY** — camOn acquire gate merged `e5e71900`.

**[P2][WB] WB-REPLAY-PDF-PLACEHOLDER** — parent share PDF boards show placeholders. Asset hydrate / share proxy.

**[P2][WB] WB-REPLAY-REOPEN-START-AT-0** — pause/hide then Replay starts at 0. Non-blocking for Sarah; REAL-FAIL waived.

**[P2][UX] WB-WTR-DEVICE-LOADING** — waiting-room loading affordance during long mic/cam settle. Post-AUDIO-1 UX.

**[P2][UX] WB-REPLAY-PAUSE-COPY** — share uses "Pause"; tutor review keeps "Pause and hide replay."

**[PROCESS] NOTES-QUALITY-HOLD-DETAIL** — do not scale back reduce detail without target feedback. Prompt_wins PASS @ recheck.

---

## 3. Reliability — recorder / A/V / lifecycle / outbox

### Outbox & end-session

**[P0][REC] W1-SHIP-B-FINALIZE — `finalizeOutboxAfterEnd` drops all IDB rows**  
`finalize()` deletes every row; no `status === "uploaded"` filter. Stuck rows silently lost at End. Distinct from upload-on-retry-exhaustion (#2).

**[P1][REC] W1-SHIP-B-STUCK — `stuck` semantics + UX vs `permanent-fail@50`**  
Design: 12 attempts → `stuck`, blob retained, Retry UI. Code: 50 attempts, observer `failed`, no stuck banners.

**[P1][REC] SMOKE-PERF-1 — Finalizing fixed overhead (~5–10s)**  
De-await snapshot PNG on blocking path (biggest win). `countEventsInBlobUrl` triple-fetch; serialized drain. Andrew tolerates; not Sarah blocker.

**[P1][REC] network_offline FSM input not wired**  
FSM supports `network_offline`; host passes `networkOk: true` hardcoded (`WhiteboardWorkspaceClient.tsx`).

**[P1][REC] WS-N-PAGEHIDE — in-progress segment flush at tab-kill**  
N1–N3 landed; full in-progress segment flush at kill boundary still open.

**[P2][REC] WS-A-F-1 — outbox register-failure attempt cap**  
Unbounded retries on persistently-failing register (~10-line fix).

**[P2][REC] deviceHealth FSM input + `dvc` logging**  
W1 Ship C design; not in `src/`.

**[P2][REC] timelineStartMs / unified wall-clock session timeline**  
`getAudioMs` freeze-on-pause; no `timelineStartMs` on outbox. Re-arch D3/D4.

**[P2][REC] audioStartedAtMs ordering bug**  
Written at enqueue from `Date.now()` vs segment start.

**[P2][OPS] Outbox permanent-failure Datadog/Sentry breadcrumbs**  
`obx=` console only.

**[P2][REC] finalizeOutboxAfterEnd register path / legacy segment register deprecation**  
`registerWhiteboardSessionAudioSegmentAction` still in `actions.ts`.

### Capture & device

**[P1][REC] Hot-swap mic / track.onended (reliability #7)**  
`MediaRecorder` continues on silence after device unplug. Subscribe `track.onended`, banner, auto-pause.

**[P1][REC] Upload-failure blob persistence (reliability #2)**  
Blob lost on navigation after retry exhaustion. W1 Ship B.

**[P1][AV] WS-I-PRESTART-MUTE — tutor mute before audio graph arms**  
**VERIFY shipped:** `WbTopBarMicControl.tsx:65-68` mute-before-acquire; `wb-tutor-recording-mute.spec.ts`. Close backlog row after gate green.

**[P1][AV] WS-M — two-device hardware smoke (tutor hears student)**  
`createMicPublishGraph` shipped; real two-device smoke before declaring done.

**[P2][REC] In-progress segment IDB on crash (reliability #1)**  
Workspace draft store shipped (Ship A); in-progress `MediaRecorder` chunks still memory-only.

**[P2][REC] Cross-session stuck/orphaned draft surfacing (1b)**  
Backlogged; shape with W1 never-delete principles.

**[P2][REC] Recovery banner stacking — audio + WB + disconnect (1c)**  
Consolidate presentation only; keep per-system Keep/Discard.

**[P2][REC] Draft clear / handleReset edge cases (1d, 1e)**  
Spurious recovery banner; duplicate audio risk.

**[P2][REC] B6 — audio recovery after external app steals mic**  
Discord overlap; `ondevicechange` feasibility.

**[P1][REC] B11 — release camera/mic tracks on session end**  
Sarah blocked re-entering Discord. `RECORDER-LIFECYCLE` Surface 2.

**[P2][REC] macOS ondevicechange debounce — unvalidated**  
500ms debounce on Safari unvalidated.

**[P3][REC] Wire-level mute coordination**  
Tutor mute local only; remote still receives RTP.

**[P3][REC] Remote video track recording**  
Audio-only `remote-stream-recorder`.

**[P3][AV] SFU for N>5 peers**  
Mesh only; deferred.

**[P3][AV] Large-mesh CPU profiling**  
No Chromebook profiling.

**[P2][REC] End-session replay: per-student-mic mix UX**  
Segments land; playback mixing post-v1.

**[P2][REC] Custom SessionAudioPlayer (D10) + stitch-path retirement**  
`replay-audio-timeline.ts` still used.

**[P2][REC] Sarah forward-migration at re-arch cutover**  
No migration tooling.

**[P2][REC] Live transcription (LTX) spike**  
Not on master; timeline assembly gap.

**[P2][REC] Long-form transcribe smoke (60–90 min)**  
[`SMOKE-LONG-FORM-TRANSCRIBE.md`](handoff/SMOKE-LONG-FORM-TRANSCRIBE.md); BLOCKER-PROD watch.

**[P3][REC] Tier 2 transcribe queue / VAD background job**  
Deprioritized unless long-form smoke fails.

**[P3][REC] Speaker diarization (Phase 6 task 6)**  
Deferred.

**[P3][REC] vad-min-tune — lower VAD_MIN_SEGMENT_SECONDS after concat**  
25s→8–10s after WS-G.

**[P3][REC] p3-vad-chunking — per-speaker VAD silence chunking**  
`segment-policy.ts` on tutor path; per-speaker lanes open.

**[P2][REC] useRecordingCoordinator extraction**  
FSM + mixdown still in `WhiteboardWorkspaceClient.tsx`. `useLiveAvCoordinator` shipped separately.

**[DEFERRED][REC] True pause (D5)**  
Tutor Pause calls stop+teardown; route through `MediaRecorder.pause()`.

**[DEFERRED][REC] Recording clock anchor / drop 10s blind gate (D3)**  
Start clock on activity; drop `AUDIO_FLOW_GATE_TIMEOUT_MS`.

**[DEFERRED][REC] On-page recording-permissions removal**  
Remove `AVPermissionsPrompt`; browser-native only.

**[P2][REC] Session timer drift on iOS (reliability #4)**  
Reconcile on `visibilitychange`; see §8 iOS matrix.

**[P2][REC] WebM/MP4 duration unreliable for scrubbing (reliability #5)**  
Server-side remux or stored duration.

**[P2][REC] Pause vs rollover race (reliability #8)**  
Manual Pause during auto-rollover finalize.

**[P2][REC] beforeunload guard mid-recording (reliability #9)**  
Pair with IDB persistence.

**[P1][REC] rid= / lifecycle log coverage (reliability #13, #14)**  
Partial `rid=` on actions; recording lifecycle log format incomplete.

**[P2][REC] TURN (A4 Slice-C)**  
STUN-only; slow first peer connect.

**[P2][AV] Slow first peer connect**  
Instrumentation + optional TURN; camera-grant-before-join UX.

**[P2][REC] Whisper CJK / language pin**  
Pin `language: "en"` in `transcribe.ts`.

**[P2][WB] WB-IDLE-SESSION-GUARD**  
Session-level idle auto-end / cost guard.

**[P2][REC] WS-J prod migration apply**  
`20260705140000_wsj_billable_rounding` — Andrew greenlight for prod.

**[P2][REC] WS-K prod migration apply**  
`20260705000000_wsk_live_reduce_watermark`.

**[P1][NOTES] WS-K — incremental reduce; End ≤2–3s notes ready**  
`notes-worker.ts` live reduce landed partially; **OPEN:** End fast-path invariant ≤2–3s not dedicated backlog row until now. Worker + watermark migration exist; verify End latency on hardware.

**[P1][REC] WS-G — server-side tutor:mic concat replay master**  
`concatBlobUrl` / `buildReplayAudioPayload` partial; formal `tutor:mic:concat` replay master per plan not complete.

### Shipped (reference — do not re-open)

Phase 1b outbox + atomic end-session · Phase 1c snapshot · Phase 4a–4d live A/V · gapless rollover B5 · Tier 1 parallel transcribe · recording re-arch Phase 1 core · audio consolidation ffmpeg · W1 Ship A workspace draft · per-chunk map extraction · VAD segment-policy · `session-clock.ts` p3-clock · per-speaker A/B/C (`useRemoteMicRecorders`, worker-driven `transcriptionOnly` enqueue) · WS-N N1–N3 · WS-L scrubber partial · IN_PERSON audio without peer (`wb-in-person-audio-start.spec.ts`) · WS-F waiting-room exit · WS-J billable rounding UI · WS-P deploy freshness · tab-kill N4 gate/roster finalize.

---

## 4. Whiteboard — chrome / sync / replay / PDF

### Sync & capture

**[P1][WB] WS-T-8 — roster End shows replay CTA when recording-count===0**  
`canReplay` vs DB recording-count oracle mismatch.

**[P1][WB] WS-T-9 — gate-only End IDB crash**  
Intermittent "IDB object store not found"; `wb-review-overlay-3paths.spec.ts` fixme.

**[P1][WB] SMOKE-BLOCK-5 — solo/in-person stroke capture in armed window**  
**Audio + inPersonMode shipped** (`wb-in-person-audio-start.spec.ts`). **OPEN:** FSM `armed/awaiting_first_participant` → `wbCaptureActive` false → empty event log when no remote peer. Fix: `everHadSessionActivity` / WS-N5 family.

**[P2][WB] SMOKE-BUG-10 — in-person "waiting for student" banner**  
`sessionMode` not consulted for banner copy. `derivePresentation` partial.

**[P1][WB] Ghost viewport bounds overlay (VP-01 / SMOKE-POST-1)**  
Label-only stub (`wb-ghost-viewport-label`); bounds geometry deferred. Pre-release required.

**[P1][WB] ST-05 / WB-LASER-ICON-CONTRAST — laser colors + bidirectional visibility**  
**Wire shipped** (`broadcastPointer`, `useCollaboratorPointers`). **VERIFY** per-role colors on hardware; tutor blue / student red asymmetry.

**[P1][WB] PDF cross-page stroke bleed (regression)**  
Post-PDF-import strokes on wrong board; "solved twice" per Andrew.

**[P1][WB] Student Exit → rejoin presence desync**  
Tutor shows disconnected after student rejoins.

**[P1][WB] Student undo/redo non-functional**  
Smokebook 1b; tutor undo may break when presence wrong.

**[P1][AV] Phone student A/V — bidirectional broken**  
Item 19 FAIL wave5 polish; PLAYWRIGHT-GAP.

**[P2][WB] Student bidirectional video (tiles flash/disappear)**  
Hardware cluster; overlaps WB-AV-GAPs.

**[P2][WB] Replay scrub drag — 429s + frozen scene**  
Debounce drag; abort superseded fetches; cache segments.

**[P2][WB] Hide replay must pause audio**  
Product rule: hide = pause playback.

**[P2][WB] Event log + replay multi-page**  
Flat stream; no `pageSwitch` in log.

**[P2][WB] Replay page strip PDF section grouping**  
`deriveReplayPageListFromLog` sets `isPdf: false` always.

**[P2][WB] PDF position lock / pan-clamp design spike**  
Deferred in PHASE-PDF-STATUS.

**[P2][WB] Tutor-vs-student insert origin (viewport-center)**  
`insert-asset.ts` local Excalidraw state only.

**[P2][WB] Promote math insert to toolbar + library persistence**  
Popover-only today.

**[P2][WB] WB-IMAGE-IMPORTER — image insert missing**  
Unify smoke regression.

**[P2][WB] WB-STROKE-BLEED watch**  
E5 merged; keep regression gate.

**[P2][WB] WB-HAND-TOOL-MISSING (NR-01)**  
Hand/pan discoverable on student shell.

**[P2][WB] WB-LINE-END-TOUCH**  
Finish multi-segment line on touch.

**[P2][WB] Eraser cursor vs delete path (TM-08)**  
Mobile pointer-transform hit offset.

**[P2][WB] NR-07 — transform handles with native chrome hidden**  
Verify periodic regression.

**[P2][WB] Re-enable Playwright invariant 8 (PDF center+fit)**  
Skipped pending pdfjs headless load.

**[P2][WB] Thin-viewport top-bar compaction**  
Controls leave viewport before ⋯; End should stay visible. **WB-STUDENT-TOPBAR-CONTRACTION**.

**[P2][WB] Student desktop mic level meter missing**  
Wave5 polish item 15.

**[P2][WB] Student `[student-apply]` console spam**  
**WB-STUDENT-CONSOLE-NOISE**.

**[P2][WB] WB-STUDENT-BOARD-TABS**  
Student sees only Board 1 tab.

**[P2][WB] WB-STUDENT-VIEW-LOCK-WHEN-SYNCED**  
Student view lock when synced.

**[P2][WB] AV-REFRESH-LOSS — student hard-refresh loses A/V**  
Not proven fixed post-wave5.

**[P2][WB] Exit→rejoin A/V slow / ghost**  
Unify smoke item 21.

**[P2][WB] SMOKE-BUG-2 — stale "Call Reconnecting" pill**  
Clear when reachable.

**[P2][WB] SMOKE-BUG-3 — student text cross-page sync**  
Text carry on page switch.

**[P2][WB] SMOKE-BUG-5 — replay board-tab context**  
Which board during replay switch.

**[P2][WB] SMOKE-BUG-7 / CH-SMOKE-STUDENT-MIC-PERSIST**  
Student mic not persisted across sessions.

**[P2][WB] SMOKE-UX-3 — replay ±10s skip**  
Deferred post-Sarah.

**[P2][WB] CH-SMOKE-REPLAY-PLAYPAUSE-OVERLAP**  
Play/Pause overlaps Board tab.

**[P2][WB] Freedraw latency PR-01**  
Option A+E shipped; watch on hardware.

**[P2][WB] Student dark-theme canvas background stuck white**  
`viewBackgroundColor` not synced on theme return.

**[P2][WB] Student mobile tool/chrome parity**  
Mobile missing tools; top bar clipped.

**[P2][WB] Student canvas stuck on "Loading scene…"**  
Intermittent join sync.

**[P2][WB] Preview-before-Start canvas wipe race**  
Low reachability; escape hatches work.

**[P2][WB] Native image insert broken on drag/drop**  
Skip `uploadWhiteboardAsset` path.

**[P2][WB] Cold refresh vs server truth**  
Excalidraw IDB vs app checkpoints.

**[P2][WB] Excalidraw recovery "Load draft" popup**  
Suppress or single restore story.

**[P2][WB] Whiteboard session audio wire**  
Strokes-only workspace path (legacy row — verify if superseded by live session).

**[P2][WB] Snapshot multi-page coverage**  
Single-page snapshot only.

**[P2][WB] Snapshot link discoverability**  
Muted footer link.

**[P2][WB] Active-ping 409 after End**  
Benign; cleanup options.

**[P2][WB] MathInsertButton first-open white-box**  
MathLive race on first open.

**[P2][WB] Per-page view state — student validation**  
Tutor shipped; student follow untested.

**[P2][WB] Local dev join URL parity**  
`WHITEBOARD_SYNC_URL` vs app host triangle.

**[P2][WB] Student canvas file sync (images/PDF)**  
BinaryFiles not mirrored to student.

**[P2][WB] Room policy & joiner UX**  
1:1 vs multi-joiner; joiner list.

**[P2][WB] Mobile AV pip — SR-16**  
Fixed top-right on touch; no drag/resize.

**[P2][WB] Per-board undo/redo history**  
Cleared on page switch by design; remount strategy if Sarah asks.

**[P2][WB] PDF open — fit tutor vs student view**  
Owner-requested if Sarah raises.

**[P2][WB] Post–sync-redesign smoke findings**  
Page insert order; mobile hit offset; student mic picker (partially addressed).

**[P2][WB] Eraser bulk delete dimmed-not-deleted**  
Excalidraw upstream; workaround second tap.

**[P2][WB] WB-MENU-CLICK-THROUGH**  
Menu dismiss falls through to canvas.

**[P2][WB] WB-COMPONENTS-PASS**  
Unified `WbTopBar`; kill `whiteboard-chrome.css` monolith.

**[P2][WB] WB-LEGACY-STUDENT-CLIENT-DELETE**  
✅ DONE — unified shell.

**[P2][WB] Graph JSXGraph swap follow-ups**  
Desmos removal when complete.

**[P2][WB] p3-video-seam**  
Per-participant video finalize/replay — capture NOT built.

**[P3][WB] Laser pointer in replay**  
Not in events.json.

**[P3][WB] Student tab crash — IDB pageDataRef**  
If student-authored content grows.

**[P3][WB] Measure wire bandwidth on real session**  
Delta payload contingency.

**[P3][WB] GitHub Actions wb-regression workflow**  
Phase 2 CI gate.

**[P3][WB] relayShowsCollaborator copy parity**  
Optional tutor-presence copy.

**[P3][WB] PDF large imports on mobile Safari**  
Manual-only gap.

**[P3][WB] Rename everHadAudioFlow → everHadSessionActivity**  
FSM input rename.

**[P3][WB] Replay empty-state armedReason copy**  
vs generic "nothing recorded".

**[P3][WB] NR-09 shortcuts help**  
Optional `?` in Mynk overflow.

**[P3][WB] NR-12 verify native S/G popups**  
Periodic regression.

**[P3][WB] Q9 map chrome controls to v1 tokens**  
No one-offs.

**[P3][WB] XPPen / TM-04 hardware verification**  
Sarah hardware smoke.

**[P3][WB] Graph embed — student expression entry**  
Product decision.

**[P3][WB] Tutor scratchy audio B4**  
Record-side; not replay blocker.

**[P3][WB] Mobile alt-shape picker discoverability**  
Long-press vs tap.

**[P3][WB] Multi-point line rubber-band / close-at-origin**  
Touch UX.

**[P3][WB] BL-LEARNER-JOIN-LINK**  
Learner-side join link backup.

**[P3][WB] BL-WB-SEPARATE-TAB-OPTIN**  
Desktop-only separate-tab WB.

**[P3][WB] Phone/tablet default zoom design**  
Ghost viewport coupling.

**[P3][WB] Whiteboard Phase 2 surfaces**  
Collab essay, code, Office, Wolfram — gated on Sarah 3-session demo ([`docs/WHITEBOARD-STATUS.md`](WHITEBOARD-STATUS.md)).

### Waiting room & session shell

**[VERIFY][WB] Gate A2 — waiting room**  
**SHIPPED:** `WaitingRoomOverlay.tsx`, `sessionPhase` PENDING→ACTIVE, `wtr` logs. Functional wiring beyond visual = verify against Gate A2 acceptance. In-person consent projection Plan #2 still open.

**[P2][WB] Gate A3 — Pass-2 in-context end-session / review shell**  
`SessionReviewMode.tsx` still legacy `.card`. Shell flip architecture shipped partially.

**[P2][WB] Gate A3a — PDF page-tab indicator**  
`PageStripRow.isPdf` propagation.

**[P2][WB] Gate A3b — SR-04a video-tile sizing**  
Auto-expand multi-tile.

**[P2][WB] TM-09 — tutor-mobile expectations notice + host gate**  
Desktop-only tutoring copy + block non-desktop Start.

**[P2][WB] Student default AV peer-only (self-view off)**  
Design §7.5.1; code still `defaultShowLocalVideo: true`.

**[P2][WB] Session type selection UX (in-person vs remote)**  
Open Q1 session-shell design.

**[P2][WB] Student waiting room screen design**  
Open Q2 — tutor side done.

**[P2][WB] Asymmetric viewport when follow OFF**  
Open Q7.

**[P2][WB] TU-11 — keyboard-shortcut routing parity**  
Desktop + student mobile.

**[P2][WB] TU-12 / Excalidraw theme follows app data-theme**  
Pre-master; `useExcalidrawThemeFromSystem` → app theme.

**[P3][WB] SMOKE-POST-2 — in-app text chat**  
Waiting room + live session.

**[P3][WB] SMOKE-POST-3 — tutor "Start anyway" degraded mode**  
After SMOKE-BLOCK-1 fix.

**[P3][WB] Waiting room 10-minute learner timeout**  
Deferred.

**[P2][WB] In-person waiting-room consent projection (Plan #2)**  
`WaitingRoomOverlay` explicit deferral.

**[P2][WB] Unclaimed-student workspace entry redirect**  
Replace bare `notFound()` with actionable redirect.

### Replay & review chrome

**[P2][WB] WB-REVIEW-THUMBNAIL-PDF**  
Hero thumbnail placeholder for PDF boards.

**[P2][WB] WB-REVIEW-DELETE-COPY**  
"Delete session data" not "Cancel and delete…"

**[P2][WB] WB-FINISH-REVIEW-COPY-CONTEXT**  
"Finish review" odd when opened from notes link.

**[P2][WB] WB-TUTOR-REPLAY-PHONE-LAYOUT**  
Notes eat half screen on tutor phone replay.

**[P2][WB] WB-SHARE-REPLAY-VIEWPORT-PHONE**  
✅ MERGED `8a6ab878`; verify share path.

**[P2][WB] Replay pause→hide→reopen state**  
Should resume scrub position.

**[P2][WB] Multi-part recording warning banner stale on replay**  
Remove when N/A.

**[P2][WB] Replay audio loading CLS**  
Layout jump below scrubber.

**[P2][WB] Replay theme click → unexpected nav**  
Intermittent.

**[P2][WB] Replay disabled top-bar buttons dimming**  
Match sidebar disabled style.

**[P2][WB] Replay board tabs missing PDF icons**  
Live tabs have them.

**[P3][WB] WB-REPLAY-UNVISITED-BOARDS**  
Unvisited boards absent from replay strip (OK post-Sarah).

**[P2][WB] WS-U-FRAGILE 2.4/2.5 — LIVE badge + sync pill visibility**  
Presentation binding gaps.

**[P2][WB] WS-U 1.4 — empty review screen copy**  
No audio/notes empty state.

**[P2][WB] Start/end session "flash reload" feel**  
Perceived perf.

---

## 5. Notes & AI quality

**[P1][NOTES] Map/reduce accuracy + abstain-on-low-content + eval harness**  
Pre-merge quality bar; formal eval harness deferred post-master (#1 follow-up). `ai-models.ts` + prompts shipped.

**[P1][NOTES] WS-K — see §3** (incremental reduce + End latency).

**[P2][NOTES] SMOKE-NOTES-2 — live/progressive notes during session**  
DEFERRED post-Sarah. Incremental reduce + live surface; distinct from WS-K End fast-path.

**[P2][NOTES] AI prompt v7 remainder**  
(a) input reframe as Whisper transcript; (c) speaker-inference hint; fixture suite. Core reaction-aware Assessment shipped `2026-05-20-v7`.

**[P2][NOTES] AI prompt — literal vs interpretive Assessment**  
Gated on Sarah/parent feedback or fixture suite.

**[P2][NOTES] AI prompt v8 — homework → plan (Sarah)**  
Collapse homework section; plan forward-looking. `ai.ts` still emits `homework`; `NewNoteForm` renders Homework.

**[P2][NOTES] Whisper transcription accuracy / short phrase misses**  
"good job" → "did a term"; word-list-only bias option.

**[P2][NOTES] Whisper CJK false positive**  
Pin `language: "en"`.

**[P2][NOTES] Whisper repetition-loop hallucination**  
Trim loops; warn on high trim fraction.

**[P2][NOTES] AI link extraction from spoken URLs**  
Normalize domains; no brand-only guesses.

**[P2][NOTES] AI note generation context hygiene**  
Stale UI / cross-session bleed tests.

**[P2][NOTES] Audio playback during note review**  
Preview disappears after AI fill.

**[P2][NOTES] Recorder gap detection in pending list**  
>500ms gap warning chip.

**[P2][NOTES] Audio scrubbing / duration 0:00**  
WebM/MP4 seek index; server remux.

**[P2][NOTES] Slice-3 S3 — notes reduce job-in-flight lock**  
Orphan DRAFT `SessionNote` race.

**[P2][NOTES] Slice-3 N1–N4 deferred findings**  
See recording-slice3 adversarial review.

**[P2][NOTES] MB-5 verify — tutor_only notes path**  
Smoke PARTIAL; re-verify without impersonation.

**[P2][NOTES] REQ-S3-1 — Formatted markdown `.ai-prose`**  
`FormattedNotesBody` not in `src/`.

**[P2][NOTES] REQ-S3-2 / REQ-S3-2a — Save notes semantics + Cancel session**  
`RecapEditor` not shipped; SSG-2 related.

**[P2][NOTES] REQ-S3-4 — canonical notes schema**  
Map-reduce vs `NewNoteForm` field alignment.

**[P3][NOTES] Formal eval harness + flywheel**  
Phase 11; post-master.

**[P3][NOTES] AI edit signal Phase 1**  
Unbuilt. Full spec: [`docs/archive/handoff/ai-edit-signal-phase-1-bootstrapper.md`](archive/handoff/ai-edit-signal-phase-1-bootstrapper.md) — `AiNoteEditSignal`, `npe` logging, per-field AI-draft columns.

**[P1][GTM] CONTINUITY-V1-CARRYOVER — continuity engine V1**  
Banner-only today. First spine: open loops, pre-session brief, "would you agree?" — spec [`docs/research/continuity-wedge-brainstorm-2026-06-12.md`](research/continuity-wedge-brainstorm-2026-06-12.md).

**[P2][GTM] Public wedge messaging**  
"Structured memory" not "whiteboard+" — marketing copy open.

**[P2][GTM] Notes quality moat elevation timing**  
Pull forward vs Gate A only.

**[PROCESS] MAP-ACC — notes quality tuning #1 post-master**  
Deferral ledger; prompt fix landed — recheck PASS.

---

## 6. Auth / identity / consent / privacy / legal / COPPA

### Consent collection & enforcement

**[P0][CONSENT] CONSENT-COLLECTION-COMPLETENESS (CC-1/CC-2)**  
**Largely shipped:** `assertConsentRecordExists`, claim decline path, tests. **VERIFY** Playwright e2e gaps (**CH-SMOKE-PLAYWRIGHT-GAP-CONSENT-ERASURE**).

**[P1][CONSENT] CONSENT-HONESTY-SARAH-MERGE-BLOCKER**  
**Largely shipped:** `consent-toggle-copy.ts`, hidden dead toggles. Andrew legal comfort sign-off on modal removal may still be open.

**[P1][CONSENT] createChildLearnerAction — no ConsentRecord at create**  
Learner exists before parent visits consent editor.

**[P1][CONSENT] Sarah test-student audit + TEST purge**  
Operator action before V1.

**[P1][CONSENT] Essentials-vs-optional tier ratification**  
§4.1 PROPOSED — awaiting Andrew.

**[P1][LEGAL] CONSENT-LEGAL-CONSULT**  
VPC method, OpenAI processor status, retention timeframe. Pack: [`docs/coppa-compliance-research-2026-05-31.md`](handoff/coppa-compliance-research-2026-05-31.md) → [`docs/LEGAL-SYNC.md`](LEGAL-SYNC.md).

**[P1][LEGAL] Umbrella + product privacy retention (§312.10)**  
Honest interim on `/privacy`; mortensenapps sync.

**[P2][CONSENT] allowEducationalUse toggle + enforcement (BL-B)**  
Not in schema; spine-locked in lifecycle design.

**[P2][CONSENT] allowWhiteboardRecording real enforcement (WB-CONSENT-UNCONDITIONAL)**  
Toggle hidden; frozen false — gates parent replay only, not capture paths.

**[P2][CONSENT] BL-A — tutor-visible per-student consent projection**  
Read-only `ConsentRecord` on student detail + scheduler chip.

**[P2][CONSENT] assertEffectiveConsent legacy no_snapshot → pass**  
Pre-CC-1 sessions; verify end-path fail-closed.

**[P2][CONSENT] LIVE-SESSION-CONSENT-COPY**  
Honest `allowLiveSession` copy — shipped in `consent-toggle-copy.ts`; verify.

**[P2][CONSENT] WB-NOTES-EMAIL-SUBSCRIPTION-REFRAME**  
`allowNoteSending` not email privacy gate; manual tutor email ungated interim.

**[P3][CONSENT] allowMessaging / allowVideoRecording when features ship**  
`NOT_SHIPPING_PERMISSIONS`.

**[P3][CONSENT] Child-facing ConsentRestriction UI**  
Schema only.

**[P3][CONSENT] CONSENT-UX-REDESIGN / save-on-toggle**  
Guided setup; **CH-SMOKE-SETTINGS-SAVE-ON-TOGGLE**.

**[P3][CONSENT] Mid-session learner swap (Phase 3)**  
No `activeSwapId`; design only.

**[P3][CONSENT] 90-day unclaimed-real-student sunset**  
No cron.

**[P3][CONSENT] Mid-session consent-change poll**  
Defer unless Sarah asks.

**[P3][CONSENT] Orphaned IDB audio admin re-register**  
Post-consent admin path.

**[P3][CONSENT] INTERIM MASTER GATE captureAttestationAt**  
Never built; superseded by CC-1/CC-2.

**[P3][CONSENT] H-1/H-2 canvas carry-forward on swap**  
Product decisions.

**[P3][CONSENT] PARENT-INITIATED-TUTOR-REQUEST**  
Post-Sarah.

**[P3][CONSENT] WB-INPERSON-AUDIO-SUBTOGGLE**  
Future in-person sub-toggle.

**[P3][CONSENT] WB-SESSION-CONSENT-OVERRIDE**  
Won't build for Sarah.

**[P3][CONSENT] P3 Neon test-account migration script**  
`forward-migrate-p3-test-accounts.ts` not in repo.

**[P2][CONSENT] Consent modal removal — Andrew legal sign-off**  
If not ratified in smoke.

### Erasure (grace = **access suspension**, NOT tutor read-access)

**[P1][CONSENT] Parent self-service erasure (non-admin)**  
`requestLearnerErasureAction` not built; admin-only today.

**[P1][CONSENT] Erasure parent/account-holder self-serve UI + CRITICAL_ACTION**  
Plan §3.1.

**[P1][CONSENT] Non-technical tombstone/grace copy**  
**CORRECT:** during grace, tutor access is **suspended** (`assertStudentNotErased`, `erasure-tutor-gate.spec.ts`) — NOT read-access. Admin/operator copy must not claim grace read-access.

**[P2][CONSENT] Erasure operator lookup UX (MB-2)**  
**CH-SMOKE-DQ-ERASURE-ACCOUNT-LOOKUP**.

**[P2][CONSENT] Erasure 2FA step-up**  
**CH-SMOKE-DQ-ERASURE-2FA**.

**[P2][CONSENT] ERASURE-ORPHAN-AUDIO-BLOBS**  
Inventory gaps.

**[P2][CONSENT] ERASURE-CLIENT-STORE-UNREACHABLE**  
Client IDB not server-purgeable.

**[P2][CONSENT] ERASURE-INFLIGHT-CHECKPOINT**  
In-flight checkpoint at erasure.

**[P2][CONSENT] ERASURE-ADMIN-METADATA**  
Operator metadata gaps.

**[P3][CONSENT] Tutor notification when learner erased**  
Open item.

**[P3][CONSENT] WhiteboardAsset enumeration at scale (H-3)**  
events.json parse timeout risk.

**[P3][CONSENT] At-rest envelope encryption**  
Spike: not COPPA-mandated; optional hardening.

### Identity & join

**[P1][AUTH] Gate B2 — parent privacy consent lattice + management UI**  
Schema shipped; B2-AC-1/2 per-tutor re-consent at claim. Parent editor shipped (`saveParentConsentAction`).

**[P1][AUTH] WB-ADULT-JOIN-ENABLEMENT B2-signup / B3 / B4**  
B1 won't-fix. B2-signup `isSelfLearner`; B3 child-only claim PIN; B4 parent→self-learner toggle.

**[P1][AUTH] WB-PARENT-JOIN-AS-CHILD — parent_session_select picker**  
Interim `ParentJoinGapCallout` shipped.

**[P1][AUTH] Join denial UX — authenticated wrong principal gets bare 404**  
Notes path has `/account/not-my-notes`; join still `notFound()`.

**[P1][AUTH] VERIFY-ACCT-1 — duplicate-account creation block**  
Same email parent + tutor. **Shipped 2026-08-14** (`feat/verify-acct-cross-realm-email`): shared `findEmailRealmPresence` blocks cross-realm signup (tutor credentials, parent API, Google tutor provision with signup-intent). Jest: `src/__tests__/identity/cross-realm-email.test.ts`; Playwright: `tests/integration/identity/cross-realm-email.spec.ts`. Google OAuth cross-realm round-trip remains **PLAYWRIGHT-GAP** (Jest surrogate on `signIn` callback).

**[P2][AUTH] BL-RESET-DOMAIN — reset email respects originating host**  
`getPublicBaseUrl` vs request Host.

**[P2][AUTH] BL-RESET-GENERATE — Chrome suggest-password on /reset-password**  
`ba2012a` reverted.

**[P2][AUTH] BL-ADMIN-UUID-PICKER — 2FA reset target picker**  
Typeahead for admin UUID.

**[P2][AUTH] BL-VERIFY-SUCCESS-COPY — post-verify affirmation**  
Silent landing after verify.

**[P2][AUTH] WB-JOIN-LEARNER-SESSION-PERSISTENCE**  
Tab-switch re-login.

**[P2][AUTH] WB-FLAKE-JOIN-STALECOOKIE**  
Join route cold-compile flake.

**[P2][AUTH] PLAYWRIGHT-GAP — /join #k= fragment preservation**  
Middleware may drop hash before `JoinAuthGate`.

**[P2][AUTH] Claim interstitial — verify claim-email host vs preview**  
Before AuthGate fix.

**[P2][AUTH] Parent→self-learner toggle post-create**  
Waiting-polish item 7.

**[P2][AUTH] Claim flow: self-learner shouldn't see child PIN setup**  
Adult self-learner claim UX.

**[P2][AUTH] Signup waitlist REJECTED + revocation UI**  
B1 approval gating shipped; operator revocation not built.

**[P2][AUTH] Signup waitlist pagination + Google OAuth auto-provision**  
Google signup → WAITLISTED **first chunk shipped** (`feat/google-signup-waitlisted`). Pagination + REJECTED UI still deferred.

**[P2][AUTH] 2FA remember-device open decisions**  
`__Secure-` prefix; max devices; backup codes interaction.

**[P1][AUTH] SEC-1 R3 — cross-preview impersonation SSO**  
usemynk cutover deferred.

**[P3][AUTH] AUTH-IDENTITY-REDESIGN**  
Unified login/signup post-Sarah. Spec: [`docs/AUTH-IDENTITY-REDESIGN.md`](AUTH-IDENTITY-REDESIGN.md).

**[P3][AUTH] AUTH-FAMILYID-* / AUTH-AGE-NO-HARD-CUTOFF**  
Dot-in-segment routing; counsel on age copy.

**[P3][AUTH] Cross-realm email uniqueness + Google OAuth signup**  
IAC-14.

**[P3][AUTH] Operator / true-admin login**  
Distinct from tutor login; `/operator/*`.

**[P3][AUTH] Identity Phase 3–6**  
Messaging, ShareLink sunset, AH 2FA enrollment.

**[P3][AUTH] Auth-form unification (8 credential forms)**  
Password primitive drift.

**[P3][AUTH] WB-IMPERSONATION-SESSION**  
Continue in-progress WB after impersonation switch.

**[P3][AUTH] BL-IMP-REAL — impersonate real accounts**  
Hard-blocked today; needs step-up, audit, legal.

**[P3][AUTH] SEC-1 nice-to-haves**  
Test-account UI, active-session list, env-only admin warning.

**[P3][AUTH] Real email provider (P2b)**  
`stubSendAccountHolderEmail` still stub.

**[P2][AUTH] Notes first-class authenticated chrome (P2-AC-12/13)**  
`/s/*` wall shipped; full parent chrome integration deferred.

**[P2][AUTH] ADMIN-PARENT-BLOCK-LIVE**  
Ajax refresh parent block after claim.

### Gate B fast-follow

**[P1][AUTH] Gate B1 — approval-gating / waitlist**  
**Shipped** `TutorApprovalStatus`, pending-approval. REJECTED path + revocation UI open.

**[P2][AUTH] Gate B3 — security checks + final cleanups**  
Tier B audit remainder.

### Consent-honesty smoke follow-ups (CH-SMOKE-*)

**[P2][CONSENT] CH-SMOKE-PLAYWRIGHT-GAP-CONSENT-ERASURE**  
CC-1/CC-2 + erasure admin e2e gaps. Matrix in EXTRACT-D.

**[P2][CONSENT] CH-SMOKE-DQ-ERASURE-ACCOUNT-LOOKUP** · **CH-SMOKE-DQ-ERASURE-2FA** · **CH-SMOKE-DQ-ERASURE-COPY-JARGON** · **CH-SMOKE-DQ-MULTI-STUDENT-LIVE** · **CH-SMOKE-DQ-CONSENT-CALLOUT-LIVE** · **CH-SMOKE-SETTINGS-SAVE-ON-TOGGLE** · **CH-SMOKE-STUDENT-MIC-PERSIST** · **CH-SMOKE-REPLAY-PLAYPAUSE-OVERLAP**  
Details in [`consent-honesty-smoke-findings-2026-07-01.md`](handoff/consent-honesty-smoke-findings-2026-07-01.md). Andrew-only Notes fields blank in smokebooks.

### Security

**[P1][AUTH] npm audit Tier B (SHOULD-FIX-4)**  
22 vulns; `npm audit fix` no-op on peer conflicts.

**[P1][AUTH] Account-takeover gap on existing-email signup**  
Mitigations: email-confirmation signup, notify-on-reset.

**[P2][AUTH] Email-infrastructure prerequisite (Resend on usemynk.com)**  
Transactional sender for confirmation + reset notify.

**[P2][AUTH] Account-takeover defense (1/3) email-confirmation signup**  
`emailConfirmedAt`, token table.

**[P2][AUTH] Account-takeover defense (2/3) notify-on-password-reset**  
Inform existing holder.

**[P3][AUTH] Account-takeover defense (3/3) notify-on-new-device-signin**  
Defense in depth.

**[P2][AUTH] In-memory rate limiters → Neon**  
`api:<ip>`, `setup:<ip>` remain. Learner PIN + auth + 2FA **shipped** durable.

**[P2][SEC] SEC — tutor-asset/route.ts any-origin blob URL**  
**DONE** 2026-08-14 ([`0252a889`](https://github.com/Arangarx/tutoring-notes/commit/0252a889)): origin pin in `isBlobUrlForSession` via `isAllowedBlobUrl`.

**[P2][SEC] SEC — /api/test/whiteboard/* gate hardening**  
Pin `PLAYWRIGHT_TEST_SECRET` in prod.

**[P3][LEGAL] Phase 10-pre external pen-test**  
Before first paying customer.

**[P2][LEGAL] Audio recording of minors — consent flow research**  
Per jurisdiction before scale.

**[P2][LEGAL] OpenAI vendor ops checklist**  
DPA, ZDR, prod path verification.

**[P2][LEGAL] PII / privacy policy before public launch**  
Beyond pilot stub.

---

## 7. UX / design system / brand / a11y

### Gate A1 — pre-master visual / component pass

**[P0][UX] Gate A1 — cohesive visual review + mock-faithful composition**  
Andrew-confirms open. `v1-design-gap-inventory` baseline; many surfaces still legacy `.card`/`.btn`.

**[P0][UX] X2 — v1 design via shared components (DRY)**  
Kill per-page hardcoded styling; [`V1-COMPONENT-LIBRARY.md`](V1-COMPONENT-LIBRARY.md) §2.12.

**[P1][UX] Component-duplication + @layer base CSS cleanup**  
Unlayered `globals.css` beats Tailwind utilities. CheckboxField label weight follow-up.

**[P1][UX] dark: → semantic token migration**  
~10 files still `dark:`; TU-12 Excalidraw theme.

**[P1][UX] TFA2 — 2FA setup/verify pages v1 redesign**  
Still `className="card"`; `TwoFactorSetupForm` dark: variants.

**[P1][UX] L3 — student WB chrome parity on /join**  
Student join lacks full `mynk-wb-chrome`.

**[P1][UX] L6 — WbStatusPill / connected-sync status**  
Student legacy inline pills.

**[P2][UX] X3 — AV pip on/off clarity**  
Tutor `WbAVCluster` vs student floating controls.

**[P2][UX] Foundation pass — promote surface-local shells to library**  
`PublicDocumentShell`, `ParentShareShell`, etc.

**[P2][UX] Missing primitives**  
Chip, SheetMenuRow, SettingsRow, week grid, sync Badge.

**[P2][UX] Tailwind aliases rounded-panel, border-strong**  
Still `rounded-[10px]` in places.

**[P2][UX] MarketingHeader inline styles → primitives**  
Group A follow-up.

**[P2][UX] PreSessionPanel / StartWhiteboardSession mock alignment**  
PARTIAL vs mock.

**[P2][UX] Parent consent editor save wiring**  
**Shipped** `saveParentConsentAction` — morning status visual-only note obsolete.

**[P2][UX] Scheduler Group F visual-only**  
See §11 Scheduling.

**[P2][UX] Error/legal/public shells legacy cleanup**  
`not-found.tsx`, `error.tsx`.

**[P2][UX] Cohesive pass open questions**  
Settings density, validation-state coloring.

**[P2][UX] REQ-S3-3 — Identity chip + test-account badge**  
Partial; test-account badge missing.

**[P2][UX] T2 — accent-recipe pass**  
Proposal branch awaiting Andrew.

**[P2][UX] Formalize IA decisions in UX-AND-A11Y-SPEC §15**  
Scheduling=no, session-centric model — rows 2–5 still open.

**[P2][UX] Tutor toolbar reorder U4 / shape dropdowns U5-U6**  
Custom chrome required; Excalidraw 0.18.1 cannot reorder native toolbar.

**[P2][UX] Mobile color palette dismiss I7**  
Click-away dismiss on student-mobile.

**[P2][UX] Pen panel too large (pilot-2026-06-06 U5)**  
Quarter-screen takeover.

**[P2][UX] Thinner default pen stroke (U6)**  
Stroke width presets.

**[P2][UX] Keyboard undo Ctrl+Z misbehaves (pilot B1)**  
Desktop regression vs on-screen undo.

**[P2][UX] Share/copy link silent clipboard failure (pilot B2)**  
Toast + error on failure.

**[P2][UX] Learner/student logged-in top-bar oversized**  
Mis-scoped fix @ `f412767`; target learner shell bar.

**[P2][UX] ADMIN-STUDENT-DETAIL-MOBILE-DISCOVER**  
✅ MERGED `b5472ab8`; verify.

**[P2][UX] ADMIN-STUDENT-DETAIL-MOBILE-ICONS**  
✅ MERGED `a97722df`.

**[P2][UX] Double scrollbars on admin pages**  
Single architectural root.

**[P2][UX] Known issues & roadmap — top-level sidebar link**  
Not buried in Settings.

**[P2][UX] Unclaimed student claim link buried**  
Top-level affordance. **Part of Priority #2 epic** (after Google #1): Start/consent/claim findability — `ConsentRequiredCallout` salience + claim mint not buried in Parent tab (Sarah 2026-07-29).

**[P2][UX] Parent dashboard Manage button alignment**  
Polish.

**[P2][UX] Known-issues section headers too muted**  
Optional polish.

**[P2][UX] Live board Sign out row dimmed/clipped**  
Student chrome.

**[P2][UX] Live board ⋯ More PDF affordance discoverability**  
Chrome.

**[P2][UX] Password fields show/hide toggle**  
Phone priority.

**[P2][UX] Verify-email success copy**  
Polish confirm item 3.

**[P2][UX] Recovered-audio prompt — always keep, no Discard**  
Part1 checkpoint preference.

**[P2][UX] WS-U-FRAGILE taste/IA batch (2.8–2.15)**  
Student Exit confirm, admin Outbox rename, etc.

**[P2][UX] Known issues page placement/tone**  
Draft shipped `/admin/settings/known-issues`; Andrew review.

**[P2][UX] Start/end session flash reload feel**  
Nav perceived perf.

**[P2][UX] Time-alert UX — visible alert clock + settings**  
Master-cut #7 PARTIAL.

**[P2][UX] WS-Q tutor settings — alert defaults**  
Configurable interval, chime, DB columns.

**[P2][UX] WS-J richer per-session billing display**  
Beyond label pass.

**[P2][UX] Part 3 student Sign out in top-bar ⋯**  
Touch layouts; ORCHESTRATOR-STATE tracked.

### v1 design-system smoke follow-ups

**[P2][UX] 2FA inline verify-at-login**  
Distinct from TFA2 setup page.

**[P3][UX] T9 — theme toggle on signup pages**  
Missing vs authenticated shells.

**[P3][UX] T10 — per-tutor names collapsible subsection**  
Parent child detail.

**[P3][UX] Consent floor-block checkbox contrast**  
Light borders on same background.

**[P3][UX] BG2 — students-roster search inner effect**  
Needs Andrew clarification.

**[P3][UX] Impersonation pip clarity**  
Mask icon, click-to-exit.

**[P3][UX] Video tile docking (SR-04 follow-up)**  
Post-V1; SR-04 base shipped.

**[P3][UX] Triangle / n-gon shapes v1.1**  
No native Excalidraw triangle.

**[P3][UX] Age/grade-adaptive interface complexity**  
2.0 / post-V1.

**[P3][UX] Parents marketing page Phase D v2**  
Parent-targeted page backlogged.

**[P3][UX] Per-org data-org theming**  
University pilot bonus.

**[P3][UX] Spacing/radius/motion tokens**  
DESIGN-TOKENS-PLAN out-of-scope partial.

**[P3][UX] Default light vs dark theme**  
DESIGN-TOKENS Phase 0 kickoff Q.

**[P3][STRATEGIC] Pricing transparency — AI cost stance**  
Strategy discussion only.

### Shipped design reference

Phase 0 tokens · Phase A fonts/palette · Phase B1/B2 auth+dashboard · A′ theme plumbing · Groups A–G surface fan-out · Phase D landing · OAuth notice · CheckboxField · StudentAvatar · Waiting room overlay visual · Parent consent POST · Continue button color X7.

---

## 8. Device pickers / hardware

**[P1][AV] SMOKE-AUDIO-1** — see §1 (Brio first-acquire).

**[P2][AV] SMOKE-BUG-11 — tutor mic picker not initialized from tn-mic-device-id**  
Capture restores; UI reads `pickedMicSlot` never bridged.

**[P2][AV] DEVICE-PICKER-DEDUPE / WB-DEVICE-PICKER-DUPES**  
Collapse duplicate enumerateDevices entries via groupId + label normalization.

**[P2][AV] DEVICE-PICKER-MOBILE-FACINGMODE**  
Phone: Back/Front only via facingMode.

**[P2][AV] Mic hot-plug requires hard refresh (B1-B4 smoke)**  
Asymmetric vs camera; W1 ondevicechange policy.

**[P3][AV] SMOKE-AUDIO-2 — phantom tutor self-unmute**  
Watch item.

**[P3][AV] SMOKE-AUDIO-3 — wrong mic after cancel→rejoin**  
Cancel path fixed 2026-07-09; mic wrong-device watch.

**[P3][AV] WS-H NB-1–NB-5**  
Per-attempt timeout, log enumerate error, stale groupId clear, collision test.

**[P3][AV] Device-picker cleanup — phone front/back only**  
Sarah ask; usersmoke quicklist.

**[P1][TEST] iOS matrix** — see §1.

**[P2][REC] Android Chrome matrix fill-in**  
Second pilot.

**[P3][REC] Firefox untested**  
Lower priority.

---

## 9. Testing & harness (PLAYWRIGHT-GAPs)

**[P1][TEST] WS-V / Part-2 site-wide mechanical test buildout**  
P1-WB-1…10 serial relay batches; P1-ID-1…4. Pure-jest tranche DONE @ 2026-07-05.

**[P1][TEST] CH-SMOKE-PLAYWRIGHT-GAP-CONSENT-ERASURE**  
See §6.

**[P1][TEST] Block B remote-surgical mixdown hardware oracle**  
jsdom cannot prove student absent from mixdown while heard live.

**[P2][TEST] RELAY-MARATHON-SHARDS**  
~20min serial marathon; shard runner exists (`fb3c039` merge fix).

**[P2][TEST] JEST-ISOLATION-CLASS-2**  
`--workers=1` gate; eliminate fire-and-forget DB stragglers.

**[P2][TEST] Site-wide coverage P1 gaps**  
Blob token in PW gate, recording E2E, replay scrub gate, billing activeMs E2E, etc. (~15 items self-skip without `BLOB_READ_WRITE_TOKEN`). [`site-wide-coverage-audit.md`](handoff/site-wide-coverage-audit.md).

**[P2][TEST] TEST-REAL-INTEGRATION-SUPERSEDES-SMOKE**  
Real multi-instance harness post-master.

**[P2][TEST] Admin notes UX Phase 0 visual regression matrix**  
axe + 4-viewport screenshots not enrolled.

**[P2][TEST] F-1 outbox register retry cap**  
Pre-merge optional.

**[P2][TEST] audio-rollover Playwright not in CI gate**  
`tests/e2e/audio-rollover.spec.ts` opt-in.

**[P2][TEST] upload-outbox.test parallel-race flake**  
50ms sleep concurrency test.

**[P2][TEST] waitForPendingUploads debug surface removal**  
Test/ops cleanup.

**[P2][TEST] installControllableUploadStub duplication**  
Extract shared test helper.

**[P2][TEST] Recorder test refactor Phases 4–6**  
MicControls shell split; audio-rollover PW; Opus pass.

**[P2][TEST] phase0-stop — break CSS deploy-abort verify**  
Visual gate ritual.

**[P2][TEST] PIPELINE-1 — agentic pipeline before release**  
Agents auditing agents; tests-to-spec discipline.

**[P3][TEST] Plan1 authed-join hardware failures**  
Dual-device takeover; waiting-room A/V.

**[P3][TEST] Preview email loopback**  
Signup on preview lands on production.

**[P2][TEST] PLAYWRIGHT-GAP — hermetic Google OAuth signup round-trip**  
No IdP in the identity harness. Surrogate: jest `google-signup-waitlisted.test.ts` (signup-intent + `signIn` provision/reject) + `cross-realm-email.test.ts` (cross-realm `signIn` deny) + Playwright `/signup` Google UI. Named gap: `tests/integration/identity/tutor-signup-waitlisted.spec.ts`, `cross-realm-email.spec.ts` (Google cross-realm block).

### PLAYWRIGHT-GAP hardware oracles (summary)

| ID | Surface | Oracle |
|----|---------|--------|
| WB-AV-GAP-1 | enumerate×acquire corruption | Windows hardware only |
| WB-AV-GAP-2 | tutor can't hear student E2E | real WebRTC hardware only |
| WB-AV-GAP-3 | Brio silent-first-acquire | hardware |
| Phone student A/V item 19 | bidirectional A/V on phone | hardware |

Surrogates shipped in jest/dom; hardware rows remain named gaps per playwright-on-fix rule.

---

## 10. Platform / ops / cost / observability

**[P2][OPS] Cost observability Phase 2**  
OpenAI `/v1/usage` reconciliation cron, monthly blob storage cron, Vercel compute API. Phase 1 **shipped:** `/admin/cost`, `CostEvent`, `rate-card.ts`.

**[P2][OPS] Cost-event durability hardening**  
`tutorKey`, `isTestFixture`, recent events table — V1-gating follow-ons.

**[P2][OPS] Full product usage instrumentation — NEAR-IMMEDIATE POST-MASTER**  
First-party, learner-type-keyed; sub-learner zero 3rd-party egress. Reframes PostHog bootstrapper.

**[P3][OPS] PostHog analytics Tier 0+1**  
**Unbuilt** (`posthog` absent in `src/`). Event taxonomy reference: [`docs/archive/handoff/posthog-analytics-tier-0-1-bootstrapper.md`](archive/handoff/posthog-analytics-tier-0-1-bootstrapper.md). Product direction = first-party instrumentation above.

**[P3][OPS] AI edit signal Phase 1**  
See §5 + archive bootstrapper.

**[P2][OPS] Vercel Skew Protection enablement**  
Andrew dashboard action; WS-P deliverables otherwise shipped.

**[P2][OPS] SEC-POLICY-TRUTH** — see §1.

**[P3][OPS] Operator scoped test-data wipe + orphaned blob sweep**  
No `operator:wipe` in `package.json`. Blob/branch CLIs **shipped:** `scripts/blob-cleanup.mjs`, `scripts/branch-sweep.mjs` (`blb`/`brs` in AGENTS.md).

**[P3][OPS] scripts/smoke-long-form-transcribe.mjs headless harness**  
UI Server Action only today.

**[P3][OPS] RECORDER-LIFECYCLE.md preview-before-Start doc drift**  
Ended sessions mount `SessionReviewMode`.

**[P3][OPS] docs/WHITEBOARD-ROADMAP-NEXT.md supersede?**  
Doc housekeeping.

**[P3][OPS] Dev-tools adopt manual test user as fixture**  
`arangarx+test1@gmail.com` not `isTestFixture`.

**[P3][OPS] Dev-tools impersonation list placement**  
Undecided UX.

**[P3][OPS] ROAD-TO-GA Gate 1**  
LLC, business bank, sales tax — [`docs/ROAD-TO-GA.md`](ROAD-TO-GA.md).

**[P3][OPS] ROAD-TO-GA Gate 2 cash**  
Scoped legal counsel consult.

**[P3][OPS] ROAD-TO-GA cheap-but-early**  
Monitoring/alerting, DR runbook drill, email deliverability.

**[P3][OPS] Usage tracking prerequisite**  
`UsageLedger` for marginal vs fully-loaded cost.

**[P3][OPS] Workspace SSR 500 dig**  
Transient; needs Vercel log correlation.

**[P3][OPS] p-test-account-reset at master cut**  
Preserve Andrew + Sarah admins.

**[P3][OPS] Log prefixes slg / exp registration**  
Before session-log B3 UI.

**[P2][OPS] Session-log + Wyzant/UVU export (SESSION-LOG-EXPORT)**  
Date-range search, consolidated export, Wyzant 25-word + UVU pay-period aggregates. Market review OQ2/O6; stubs until artifacts. [`docs/research/market-analysis-strategic-review-2026-06-12.md`](research/market-analysis-strategic-review-2026-06-12.md).

**[P2][OPS] Session log billing rate / billed* column naming**  
Andrew confirm before Wave 2.5 migration; `ratePerHour` / `billedAmount` open Q.

**[P2][OPS] Historical SessionNote timezone backfill**  
Lossy backfill vs accept UTC for old notes.

**[P2][OPS] Session timer vs billed time during disconnect gaps**  
Displayed timer pause vs billed-only subtraction.

**[P2][OPS] Solo / in-person production enable + B-5 consent copy**  
FSM supports `IN_PERSON`; production gating review.

**[P2][OPS] Time-storage / billing display (billed*Local)**  
B3 `/sessions` route not shipped.

**[P3][OPS] Phase 11 blocked until umbrella legal paragraphs**  
AI edit signal + instrumentation.

---

## 11. Scheduling & calendar (post-V1)

**Decision (Andrew 2026-06-08):** post-V1, pre-release (before recruiting new pilots). Requirements: [`docs/handoff/scheduling-requirements-2026-06-11.md`](handoff/scheduling-requirements-2026-06-11.md) (canonical; may move to archive with backlog pointer).

**[P2][OPS] Scheduling — backend wiring + calendar sync**  
**Visual-only shipped:** `src/lib/schedule/mock-data.ts`, `SchedulePageClient.tsx`, `CalendarIntegrationsPanel.tsx`. No DB models, OAuth routes, or real sync. **OPEN:** native-first scheduling + Apple + Google integrations.

**[P2][OPS] S5 — scheduled topic + notes visible in live session**  
"Today's plan" panel; depends on scheduler→session linkage.

**[P3][OPS] S3 — Agenda as default scheduler view**  
Possible tutor login landing.

**[P3][OPS] S4 — Month view density for full-time tutors**  
Visual prototype only.

**[P3][OPS] Two-way calendar sync**  
Google watch / Apple CalDAV + conflict policy — unresolved.

**[P3][OPS] Google OAuth bundling with calendar scopes**  
Connect+stub shipped (`da93ab78`). Andrew submits **one** bundled verification after demo is crawlable. Two-way sync later does not add scopes.

**[P3][OPS] Apple CalDAV vs EventKit path**  
Not started.

**[P3][OPS] Reminders / timezone policy**  
Not started.

In-app schedule layer, student/parent join surface, soft session length — still relevant from 2026-06-08 proposal (see requirements doc).

---

## 12. Org / university pilot & commercial launch (future)

**[P2][GTM] BYU / institutional pitch track separate from Sarah solo story**  
Org MVP Wave 5; demo flow.

**[P3][GTM] Stripe / subscription billing**  
Checkout, webhook, `subscriptionStatus`.

**[P3][GTM] Operator dashboard scaffolding**  
`/operator/*` beyond tutor admin.

**[P3][GTM] University department pitch infrastructure**  
Aug 2026 soft deadline per [`docs/RELEASE-ROADMAP.md`](RELEASE-ROADMAP.md).

**[P3][GTM] Wyzant + UVU export formatters**  
See **SESSION-LOG-EXPORT** §10.

**[P3][GTM] Org-aware billing rounding**  
When multi-tutor.

**[P3][GTM] Marketplace substrate**  
Explicitly deferred; design-compatible-only.

**[P3][GTM] Parent progress arc / engagement surfaces**  
Deferred per wedge program.

**[P3][GTM] COMMERCIAL-LAUNCH-CHECKLIST items**  
See [`docs/COMMERCIAL-LAUNCH-CHECKLIST.md`](COMMERCIAL-LAUNCH-CHECKLIST.md).

**[P3][GTM] Master plan Phases 7–12**  
Status model, Stripe, org MVP, etc. — roadmap waves 4–5.

---

## 13. Strategy / positioning / pricing / research

### Product positioning (ratified)

Independent tutors, subscription, not marketplace. Wedge: AI notes from recording + tutor keeps 100% rate + parent share link. Wyzant has lesson recordings (~30 days) — lead with notes + economics, not recording alone. Pitch: *"Keep 100% of your rate. Better tools than Wyzant, ~$20/month."*

### Pilot feedback — action items (selected open)

**[P2][NOTES] End-session discard / SSG-2** — see §1.

**[P2][REC] Recording auto-pause on student disconnect**  
✅ SHIPPED structurally in lifecycle FSM; verify replay gap-marker rendering.

**[P2][REC] Per-student recording default**  
✅ Shipped `recordingDefaultEnabled`; coordinate with consent B2.

**[P2][WB] Whiteboard undo touch + visible button**  
✅ Shipped tutor+student; verify iOS Safari touch.

**[P2][WB] Session time logging**  
✅ Shipped `startTime`/`endTime`; timezone follow-up in adversarial section.

**[P2][NOTES] AI link extraction, scrubbing, playback during review, gap detection**  
See §5.

**[P2][NOTES] Tutor-initiated join-link rotation**  
`rotateJoinToken` affordance.

**[P2][WB] Student naming paradigm — single-student fallback**  
Tile shows student name not `Student · hash`.

**[P2][WB] Tutor tab doesn't follow new session creation**  
Navigate tutor tab on create/resume.

**[P2][WB] Workspace SSR 500**  
See §10.

**[P3][WB] Homework image import workflow**  
Camera roll vs email vs scanner.

**[P3][GTM] Rethink claim-screen layout**  
Post-Sarah.

**[P3][AUTH] Self-service account deletion**  
Parents/students.

**[P3][WB] Replay speaker indication**  
With video-record work.

### Pending / received pilot input

**[`docs/SARAH-CALL-PREP.md`](SARAH-CALL-PREP.md)** — living home for next-call questions (Q4 pain point, Wyzant/UVU artifacts, primary device, scheduling=no, log-the-time, wedge). Add: session-log billing rate question; homework import workflow.

### Pricing & unit economics (research — not decisions)

- **RATIFIED 2026-06-11:** platform→tutor metering = wall-clock for cash + session tokens.
- Minimum viable subscription; anchor vs Wyzant 25% cut; tier structure; per-feature gating / metering for AI+transcription.
- **True API costs:** gpt-4o-mini negligible per note; **Whisper ~$0.36/hr** = cost-watch; whiteboard sync TBD.
- Per-user AI quotas; CAC/LTV unknown until ≥3 months paying users.
- Draft tier table (Starter/Pro/Growth/Studio) — sanity reference only.
- Founding-tutor lock-in pattern; don't price so low it signals missing product.
- Cost instrumentation: marginal vs fully-loaded $/hr separately.
- Competitive surface: TutorBird, TutorCruncher, Teachworks, etc.
- Naming shortlist + pre-commitment checklist (Mynk brand).
- Wyzant 0% on bring-your-own-student vs 25% marketplace.
- Crowded ≠ overserved — session memory moat mantra.

### Marketing / acquisition (research)

Tutor subreddits, Facebook groups; referral nudge; paid ads deferred. Mynk brand capture mostly done; YouTube pending; TikTok deferred.

### Legal / trust (research)

Audio of minors jurisdiction-sensitive. PII honest privacy policy before public launch.

### Feedback handling discipline

3–5 tutor advisory; watch-them-use-it sessions; ≥2 tutors for roadmap; track metric not thanks.

### Status-model rethink + auto-email (paired, post-Phase-5)

**[P3][NOTES] Collapse DRAFT/READY/SENT**  
Design in backlog §815–845 legacy; revisit when triggered.

**[P3][NOTES] Auto-email scheduling**  
Depends on status-model rethink.

### Adversarial review UX gaps (2026-04-19)

Real bugs: admin audio proxy env-only admin; share seen-tracking; time-storage display. Slow-burn: orphan session cleanup cron, storage ledger. Scaling: rate limits partially migrated. UX tutor/parent gaps in original audit — many addressed by v1 redesign; remainder cross-linked above.

### Component redesign B2 smoke (2026-06-01)

NewNoteForm clear bugs, outbox responsive, a11y id/name, bold-on-teal verify — spot-check during Gate A1.

### V1 marketing Phase D

Public surfaces brand sign-off pending.

### Strategic lessons (ChatGPT brainstorm 2026-05-15)

Captured in pricing subsection; transcript local only.

### Tonight / days / weeks / months buckets (historical sequencing)

Many items above supersede these buckets. Remaining highlights:

- **Weeks/moat:** Phase 1 WB largely shipped per [`docs/WHITEBOARD-STATUS.md`](WHITEBOARD-STATUS.md); session timer 1.6 pending.
- **Months polish:** discount system, native/PWA, whiteboard sync hardening at scale.
- **Later in-person:** iPad whiteboard, two-device handoff, PDF annotation.

---

## 14. Deferred / someday

**[P3][WB] WB-SCREEN-WAKE-LOCK / WB-THUMBNAIL-GRAPH / WB-OLD-PHONE-PERF**  
Unify plan out-of-scope.

**[P3][WB] WB-GRAPH-PLACEHOLDER**  
Review hero graph thumbnail.

**[P3][WB] WB-ENDSESSION-THUMBNAIL-TABS**  
End-session thumbnail tabs.

**[P3][WB] Desmos live-state capture Phase 1.5**  
[`docs/RELEASE-ROADMAP.md`](RELEASE-ROADMAP.md) backlog.

**[P3][REC] Debounced-disconnect pause trigger confirm**  
~6s `PEER_EVICTION_TIMEOUT_MS` vs 8s freeze — Andrew confirmed freeze path.

**[P3][GTM] Engagement/dopamine surfaces**  
Mascot, charts, streaks — design-compatible-only.

**[P3][GTM] Parent progress arc**  
Deferred.

**[P3][GTM] Durability-B seasonal presence**  
Pull/in-app, never email-default.

**[P3][GTM] School-handoff bigger bet**  
Deferred.

**[P3][AUTH] AUTH-AGE-NO-HARD-CUTOFF + counsel**  
Self-attested capacity.

**[P3][TEST] Duplicate solo_recording plan files**  
Process cleanup.

**[P3][DOCS] Docs cleanup pass**  
[`docs/INDEX.md`](INDEX.md) § archival policy; whiteboard chrome sources swept to requirements doc.

**[P3][DOCS] Usersmoke quicklists**  
[`docs/handoff/usersmoke-2026-07-08-problem-quicklist.md`](handoff/usersmoke-2026-07-08-problem-quicklist.md), [`usersmoke-2026-07-09-recheck-quicklist.md`](handoff/usersmoke-2026-07-09-recheck-quicklist.md) — living triage until master cut complete.

**Resolved / do not re-open (reference):** CONSENT_ENFORCEMENT flag removed · anonymous `/w` join retired to redirect · phantom stroke bug · Slice-3 B4 save model · Auth role-refresh · Parent-create-learner path · Weak PIN validators · Gate B1 core waitlist · SEC-1 impersonation pillar · Tier A security quick wins · Note save vs transcribe race (#6) · B5 gapless rollover · Client-direct blob upload B1 · Multi-recording schema · Share seen-tracking baseline · Billable WS-J · Housekeeping CLIs · Cost admin dashboard · Waiting room overlay · Per-speaker C transcription · In-person audio without peer · 2FA remember device · IAC-13 tutor disconnect parent · Session wrong-identity RC-A · Erasure Option A tombstone + cancel-restore · CF-1–CF-4 consent-honesty blockers · PRESARAH-1 partial (toggle removal not done) · SMOKE-BLOCK-2/3/4 · SMOKE-BUG-1/6 · SMOKE-UX-2/4 · Many wave5 polish items per known-issues DRAFT appendix.

---

*Last reorganized: 2026-07-09 (doc-cleanup master). Sources: EXTRACT-A through J2, prior BACKLOG.md, RELEASE-ROADMAP.md. Item count reflects deduplicated open work — verify shipped rows before deleting.*
