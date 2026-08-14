# Tutoring notes — agent context

You are working in the **tutoring-notes** app: a **standalone `git` repo** that
lives next to the **`agenticPipeline`** monorepo under a shared parent (typical
layout: `…/dev/agentic-projects/tutoring-notes`). Same reliability expectations as
before — this is the live commercial app Sarah (our pilot tutor) uses for real
sessions.

## North star

> *"People need to use the app with confidence. Sarah is being patient,
> but that won't last forever."*

If a tutor would need to run a backup recorder alongside our app, the
feature is not done. See [reliability-bar.mdc](../../agenticPipeline/.cursor/rules/reliability-bar.mdc)
for the full reliability standard. **Every feature plan in this app must
include an adversarial review against the 5 reliability axes, with
BLOCKERs folded into Phase-1 acceptance — not deferred to follow-ups.**

**Fresh orchestrator chat:** read [`docs/handoff/ORCHESTRATOR-STATE.md`](docs/handoff/ORCHESTRATOR-STATE.md) first — it is the single canonical current-state bootstrap (what's done, where we are, what's next, how we work). No catch-up from Andrew should be needed.

**If you are an Opus orchestrator chat:** before doing anything in-chat
that smells like execution (reading code, writing code/tests, drafting
handoff docs, multi-step refactors), STOP and read
[.cursor/rules/orchestrator-discipline.mdc](.cursor/rules/orchestrator-discipline.mdc).
That rule defines the dispatch-vs-do boundary and the strict carve-outs
for in-chat tool calls. Full tier-assignment + escalation criteria live
in § "Model usage protocol" below.

The whiteboard plan
([../../agenticPipeline/docs/whiteboard-plan](../../agenticPipeline/docs/whiteboard-plan)
or `~/.cursor/plans/whiteboard_-_match_wyzant_for_sarah_plus_our_wedge_*.plan.md`)
and `docs/WHITEBOARD-STATUS.md` are the working example of this pattern.

## Non-negotiable standards + release track (ratified Andrew 2026-07-10)

Master is delivered to Sarah; the doc/backlog is cleaned + release-triaged. We are now on the **release track** (expand beyond Sarah to unsupervised new pilots). From this point, three standards are **non-negotiable** — no exceptions without Andrew's **explicit, documented waiver** (agents may **never** self-authorize):

1. **ZERO unjustified duplication — no bespoke bullshit.** One canonical primitive of each kind site-wide; every component a composition of primitives; every component owns its own CSS (variation only via props/inputs); one canonical implementation of each service/hook/util. [`.cursor/rules/composition-no-duplication.mdc`](.cursor/rules/composition-no-duplication.mdc) (alwaysApply). The old "agent may document a justified duplication" latitude is **revoked** — Andrew-waiver-only.
2. **Exhaustive testing.** Nothing is done without comprehensive **red-before/green-after** tests written **to spec** (independent oracle), at the **right layer** (Playwright for layout/media/sync/geometry; jest is necessary-not-sufficient). [`.cursor/rules/exhaustive-testing-mandate.mdc`](.cursor/rules/exhaustive-testing-mandate.mdc) (alwaysApply).
3. **Independent agentic verification.** Code/tests written by one agent are verified by a **separate specialized agent** (tests-to-spec + code soundness + no-duplication) before "done"/merge. Moving toward a fully agentic pipeline. Deferrable only with Andrew's approval if it blocks a release, never permanently. [`.cursor/rules/agentic-verification-pipeline.mdc`](.cursor/rules/agentic-verification-pipeline.mdc) (alwaysApply).

**Release priorities (ordered, Andrew 2026-07-30 option B)** — canonical list at top of [`docs/BACKLOG.md`](docs/BACKLOG.md):

1. **External Google validation** — Sign-In UI + Calendar scopes / Console (long lead times).
2. **Student-detail Start / consent / claim findability** (Sarah 2026-07-29).
3. **Tutor signup / self-serve auth** (incl. Google on login).
4. **2FA pilots will finish** — email OTP first; SMS later; TOTP as upgrade.
5. **Finish scheduling** (depends on #1 calendar).
6. **Security MUST for strangers.**
7. **Comprehensive instrumentation** (first-party on COPPA-risk surfaces).

Dedupe Wave C/D + agenticPipeline Phase 2 = **background**. Everything else is release-triaged in `docs/BACKLOG.md` § Release triage (MUST / MAYBE / 1.x). Freshness pass vs `master` when picking items up.

## Key docs

- [docs/INDEX.md](docs/INDEX.md) — **start here.** Literal "where do I
  look for X" map: every canonical doc, spoke, and smoke runbook indexed
  by topic (sequencing, reliability, brand/UX, pilot feedback, deploy,
  legal, security, smoke runbooks, recorder lifecycle gate, handoff docs).
  Updated 2026-05-27 doc-cleanup pass.
- [docs/RELEASE-ROADMAP.md](docs/RELEASE-ROADMAP.md) — canonical
  sequencing source. Wave-by-wave ordering from solo-tutor reliability
  floor to Aug 2026 university-pitch readiness. Re-validate quarterly or
  after major Sarah feedback.
- [docs/BACKLOG.md](docs/BACKLOG.md) — pilot feedback, known follow-ups,
  reliability gaps audit.
- [docs/RECORDER-LIFECYCLE.md](docs/RECORDER-LIFECYCLE.md) — **read
  before touching `lifecycle-machine.ts`, `upload-outbox.ts`,
  `endWhiteboardSession`, or workspace `handleEndSession`.** Maps the
  three pillars (FSM, outbox, atomic end-session) plus Phase 1c
  surfaces (snapshot PNG, preview-before-Start), the end-session
  flow diagram, and the cheat sheet for common questions.
- [docs/RECORDER-REFACTOR-STATUS.md](docs/RECORDER-REFACTOR-STATUS.md) —
  pattern for STATUS docs (per-feature handoff between sessions).
- [docs/WHITEBOARD-STATUS.md](docs/WHITEBOARD-STATUS.md) — current
  whiteboard build status, guardrails, adversarial review, demo gate.
- [docs/LIVE-AV.md](docs/LIVE-AV.md) — **read before touching
  `peer-mesh.ts`, `useLiveAV.ts`, `mic-recorder-audio.ts`, or anything
  claiming to "simplify" peer connection or remote audio recording.**
  Live A/V architecture cheat sheet — peer-mesh, signaling, recording
  outbox integration, participants-reconcile effect.
- [docs/PHASE-1B-STATUS.md](docs/PHASE-1B-STATUS.md) — outbox + atomic
  end-session branch handoff (Pillars 2 + 3).
- [docs/PHASE-4A-STATUS.md](docs/PHASE-4A-STATUS.md) — live-A/V peer-mesh
  + signaling foundation branch handoff (Pillar 6, first of 4 Phase 4 sub-chats).
- [docs/DEPLOY.md](docs/DEPLOY.md) — Vercel + Neon deploy notes.
- [docs/LOCAL-DEV.md](docs/LOCAL-DEV.md) — local setup.
- [docs/PLATFORM-ASSUMPTIONS.md](docs/PLATFORM-ASSUMPTIONS.md) — **read
  before migrating to a different compute platform / managed-service tier,
  or onboarding a new external dependency.** Single inventory of every
  load-bearing infra, runtime, browser, and OS assumption (Vercel Pro
  300s ceiling, Neon branching, Vercel Blob shared store, CSP origins,
  Node 20+, ffmpeg-static, Excalidraw API surface, etc.) + a migration
  checklist.
- [docs/LEGAL-SYNC.md](docs/LEGAL-SYNC.md) — **read before touching
  `src/app/privacy/page.tsx`, `src/app/terms/page.tsx`, the Gmail OAuth
  consent flow, or any external policy reference.**
- [docs/SARAH-CALL-PREP.md](docs/SARAH-CALL-PREP.md) — rolling doc for
  pilot questions: next-call open questions + answered questions from
  all prior calls (newest at top). Read before any Sarah call or when
  acting on pilot questions.
- [docs/handoff/sarah-pilot-feedback-2026-05-26-orchestrator-report.md](docs/handoff/sarah-pilot-feedback-2026-05-26-orchestrator-report.md) —
  latest pilot call capture (2026-05-26, commit `c75e946`): Sarah's 3
  questions, key themes, strategic reframe (notes as institutional
  memory), action items, brand-awareness check deferral.

## Conventions

- **Per-session ID logging is mandatory.** Audio uses `rid=<id>`; whiteboard
  uses `wbsid=<id>`. New capture/sync features pick a 3-letter prefix and
  log every state transition. Without this, prod debugging is impossible.
  Currently in use: `rid` (audio recorder), `wbsid` (whiteboard session),
  `wba` (whiteboard apply-path — paired with `author=tutor` or `author=student`
  on every apply-path log line), `obx` (upload-outbox row), `dft` (recording-draft
  IndexedDB checkpoint row), `snp` (snapshot generation), `pvw`
  (workspace preview-before-Start), `pvs` (per-page whiteboard pan/zoom —
  Phase 5 task 8), `avx` (live-A/V session — Phase 4a;
  per-peer events also carry `peer=<peerId>`), `cev` (cost-event row —
  OpenAI usage observability), `pev` (product-event row — first-party
  tutor funnel in Neon), `blb` (blob cleanup CLI), `brs` (branch
  sweep CLI), `imp` (impersonation lifecycle — SEC-1; every start/exit
  writes `[imp] imp=<logId> ...`), `tfa` (TOTP 2FA lifecycle — Identity
  Phase 1; every enroll/verify/reset transition writes `[tfa] ...
  adminUserId=<id> action=<action>`), `lpr` (LearnerProfile ownership-
  assertion denials + learner login/lock events — `assertOwnsLearnerProfile`
  `[lpr] lpr=<id> assert_owns_denied ...`; login route writes
  `[lpr] lpr=<profileId> action=login device=<sessionId>`,
  `[lpr] lpr=unknown action=login_failed handle=<familyId>:<username> attempt=<n>`,
  `[lpr] lpr=unknown action=hard_lock_triggered handle=<familyId>:<username>`,
  `[lpr] lpr=<profileId> action=hard_lock_cleared_by_parent credKey=<familyId>:<username>`;
  hard lock state is durable in `LearnerLoginThrottle` Neon table — survives cold starts
  and is shared across instances),
  `nsi` (notes-session-integration bridge — DRAFT `SessionNote` auto-creation/update
  at reduce completion, Save/finalize DRAFT→READY, delete-session-and-data; every
  transition writes `[nsi] wbsid=<sessionId> action=<action> ...`),
  `wjg` (whiteboard join gate lifecycle — student new-shell path; every transition
  writes `[wjg] wjg=<joinToken:8> wbsid=<id> action=<action> ...` — mount, key_ok,
  key_missing, sync_connect, sync_disconnect, excalidraw_api_ready, loading_cleared,
  loading_stuck, student_reload, session_ended),
  `wtr` (waiting room — PENDING-phase overlay lifecycle; writes
  `[wtr] wbsid=<id> role=<tutor|student> action=<action>` for:
  `waiting_shown` (overlay first shown), `student_connected` (bothPartiesInRoom
  flips true while PENDING), `start_clicked mode=<live|in_person>` (tutor
  taps Start), `live_entered mode=<live|in_person>` (overlay dismissed, phase
  flips to ACTIVE)),
  `slc` (session lifecycle — `createWhiteboardSession` /
  `startWhiteboardSession` / `endWhiteboardSession`; every transition writes
  `[slc] wbsid=<id> action=session_created|session_started|session_ended ...`),
  `rol` (JWT role-refresh — auth-options jwt callback
  periodic DB re-check; writes `[rol] sub=<id> role_corrected role=<old>-><new>` when
  stale role is corrected, `[rol] sub=<id> refresh=account_deleted fail_closed` when
  the DB row is missing, `[rol] sub=<id> refresh_error fail_open` on transient DB error),
  `sal` (share-link access — `src/lib/share-access-scope.ts`; emitted on every
  `/s/*` page and API access decision; writes
  `[sal] sal=<token:8> action=access_granted principal=account_holder|learner studentId=<id>`,
  `[sal] sal=<token:8> action=access_granted_anon_grace studentId=<id>`,
  `[sal] sal=<token:8> action=access_denied_redirect studentId=<id> reason=no_session`,
  `[sal] sal=<token:8> action=claim_required studentId=<id> reason=unclaimed`,
  `[sal] sal=<token:8> action=ownership_denied principal=<type> ...`).
  See
  [docs/RECORDER-LIFECYCLE.md](docs/RECORDER-LIFECYCLE.md) for the
  registry.- **Migrations are additive.** Production runs on Neon; never drop or
  rename a column without a multi-step migration.
- **Server actions assert ownership.** `assertOwnsStudent(adminUserId,
  studentId)` (or the equivalent for the resource) runs before any
  mutation or read of student data.
- **Share links are tokenized + revocable.** No public Blob URLs for
  student content.
- **CSP is tight.** Adding a new external origin (sync server, embed,
  font CDN) requires updating `src/middleware.ts` and documenting it in
  the feature's STATUS doc.
- **Platform assumptions are tracked.** Any commit that introduces a
  new load-bearing infrastructure dependency (a hardcoded timeout
  cap, a per-tier limit, a new external origin, a new runtime
  requirement, a new env var with platform-specific semantics) MUST
  update [docs/PLATFORM-ASSUMPTIONS.md](docs/PLATFORM-ASSUMPTIONS.md)
  in the same commit. Orchestrators check this during executor
  handoff review. Migration to a new compute platform reads that
  doc as the primary checklist.
- **Legal copy stays synced with the umbrella — and must stay honest.** `https://www.mortensenapps.com/privacy`
  + `https://www.mortensenapps.com/terms` are the **canonical legal
  source** and the URLs registered in the shared "Mortensen Apps" OAuth
  consent screen that Tutoring Notes uses (confirmed from Google Cloud
  Console 2026-05-17). The mortensenapps.com site repo has the
  verification-round history. The product's `/privacy` and `/terms` are
  **local subordinate facades** that supplement the umbrella with
  product-specific sections (Vercel Blob audio, OpenAI Whisper,
  whiteboard data, minor-data tutor-consent specifics); they are not a
  parallel canonical source and are not registered with Google for this
  OAuth client. **HARD RULE (Andrew 2026-07-09):** Terms/Privacy must be
  **honest at all times**, especially on **`master`/production** — never
  claim retention clocks, deletion automation, or capabilities the app
  does not implement. Slightly more leeway on preview-only branches
  (Andrew-only), but dishonest copy must not merge to master. See
  [docs/LEGAL-SYNC.md](docs/LEGAL-SYNC.md) § Standing hard rule — honesty.
  Any change to either TSX file MUST follow the sync
  protocol in [docs/LEGAL-SYNC.md](docs/LEGAL-SYNC.md): identify whether
  the edited section is umbrella-derived (must match upstream verbatim)
  or product-specific (free to edit), update the top-of-file sync date
  and the in-UI "Last updated" string, and update the doc's
  classification tables if the section changed type. Quarterly drift
  review applies — re-confirm the OAuth consent screen URLs as part of
  the review.
- **This repo (`tutoring-notes`) — feature branches: commit + push by default.** After substantive work on a named branch here, create a descriptive commit and push (`origin`; retry transient network failures) unless Andrew says to hold off. (Scope is this app only, not every workspace.)
- **Executor bootstrappers AND orchestrator reports live in `docs/handoff/`** — when the orchestrator drafts a briefing for a fresh executor chat, write it as `docs/handoff/<scope>-bootstrapper.md`; when the orchestrator captures session retrospectives for a future orchestrator picking up, write it as `docs/handoff/<scope>-<date>-orchestrator-report.md`. Both go here, not `~/.cursor/plans/`. Two reasons: (a) Cursor's chat UI only resolves workspace-relative file paths so in-workspace handoff docs are clickable, (b) committed handoff docs create an audit trail pairing "what we asked for" with "what shipped" (bootstrappers) and "what we did and decided" with "what's open" (orchestrator reports). **Bootstrappers must be pure executor briefings from line 1** with the required top-of-file template. **Both bootstrappers AND orchestrator reports should be Composer-2.5-authored via subagent dispatch** when length > ~3 paragraphs — Opus supplies the scope blob and structural outline; Composer types the prose. See `docs/handoff/README.md` for both templates + full lifecycle.
- **`docs/archive/` is cold storage** — agents must not explore, search, or cite it unless Andrew explicitly asks for an archive audit; it holds superseded/captured-elsewhere docs and is not authoritative (see `docs/archive/ARCHIVE-LEDGER.md`).
- **Orchestrator state checkpoints — zero-catch-up fresh chats.** Canonical living bootstrap: [`docs/handoff/ORCHESTRATOR-STATE.md`](docs/handoff/ORCHESTRATOR-STATE.md) (stable filename, updated in place; `git log -p` on that file = audit trail). Every fresh orchestrator chat reads it first (also enforced in [`.cursor/rules/orchestrator-discipline.mdc`](.cursor/rules/orchestrator-discipline.mdc)). **Lightweight head** (Last action / Next action / Open confirms / in-flight / uncommitted) — Opus keeps current inline on every turn that materially changes state. **Heavy full restructure** — dispatch Composer 2.5 at milestones (after `merge --no-ff` to master, after closing a multi-day thread or long-standing bug, before a new major Wave/Phase/SEC thread, session wind-down if material changed); use [`docs/handoff/orchestrator-state-template.md`](docs/handoff/orchestrator-state-template.md). Dated `docs/handoff/orchestrator-state-<YYYY-MM-DD>-<HHMM>.md` files are **legacy snapshots** (retained, not the live source). On truncation/slowdown, refresh `ORCHESTRATOR-STATE.md` rather than spawning a new dated file.
- **Chat output links use workspace-relative paths only.** Cursor's chat UI clickably resolves paths like `docs/BACKLOG.md` and `src/lib/ai.ts` but renders absolute paths (`c:/Users/...`, `/Users/...`) and `file://` URIs as plain unclickable text, breaking Andrew's workflow. Same rule applies inside any `docs/handoff/*.md` since those files are designed to be `@`-referenced in fresh chats. When citing a file, always use the workspace-relative form.
- **Windows PowerShell: multi-line commit messages via temp file, not `-m`.** PowerShell 5.x (the default on Win10/11 without an explicit pwsh install — Andrew's setup) mangles multi-line strings, Unicode escape sequences (`\u2014`), and backtick-escaped characters when passed to `git commit -m "..."`. Safe pattern: Write the message to `.git/COMMIT_MSG_DRAFT.txt`, then `git commit -F .git/COMMIT_MSG_DRAFT.txt`, then delete the temp file in a **sequential** subsequent call (NOT a parallel tool call — a parallel `Delete` races the `commit` and the file vanishes before git reads it; this has bitten us).
- **Composition over duplication — no bespoke code.** See [`.cursor/rules/composition-no-duplication.mdc`](.cursor/rules/composition-no-duplication.mdc) (standing architectural standard; `alwaysApply`).
- **Playwright on every fix — no second smoke for the same bug.** Any behavioral, visual, chrome, sync, or multi-peer regression fix ships a Playwright test in the **same branch** (enrolled in `wb-regression` when applicable). Jest/jsdom does not substitute. Narrow environment-only gaps need an explicit `PLAYWRIGHT-GAP` + backlog entry — never silent omission. See [`.cursor/rules/playwright-on-fix.mdc`](.cursor/rules/playwright-on-fix.mdc) (`alwaysApply`).
- **Selective test execution by tag.** Tagged Playwright suites + `npm run test:wb-affected` for diff-scoped runs on small branches; **full** `test:wb-sync` required before **`master`**. See [`.cursor/rules/test-selection.mdc`](.cursor/rules/test-selection.mdc) and [`tests/test-tags.ts`](tests/test-tags.ts).
- **Andrew smokes once when DONE.** Agents complete Playwright + gates before requesting hardware smoke. See [`.cursor/rules/smoke-when-done.mdc`](.cursor/rules/smoke-when-done.mdc).

## Hard-won lessons

Cross-cutting rules from production debugging. Add dated evidence under **Real-world observations** (Model usage protocol) when new ones land.

### Plans are agent scaffolding, not ratified user intent (2026-06-17, P2 student shell)

Andrew writes/approves plans primarily as orchestration scaffolding and does NOT read them in detail; a decision appearing in an approved plan is therefore NOT evidence he endorsed it. The P2 student-shell plan specified a heavily-divergent slim student (pencil+eraser only, in-app `AVPermissionsPrompt`, student-specific top bar) that contradicted Andrew's actual "student == tutor minus a short delta list" intent — and it shipped to smoke before he caught it. The 5-axis review accepted the plan's premise rather than challenging it. **Rules:** (1) Material product/scope/UX decisions must be surfaced to Andrew EXPLICITLY (a direct question or crisp in-chat callout), never buried in a plan and treated as approved-by-silence. (2) When a plan encodes a non-obvious divergence from prior verbal intent, call it out for confirmation rather than assuming the plan ratifies it. (3) Capture verbal design agreements into a durable, executor-facing contract immediately — the prior orchestrator's "5-delta" agreement evaporated because it was never written down, so the plan re-invented a divergent design.

### A missed or un-acted prompt is NOT consent (2026-06-17)

Andrew's attention is split and he frequently does not see passive prompts — a `SwitchMode` ask, an `AskQuestion` he scrolls past, an inline "say the word and I'll…". **Inaction, a rejected/ignored mode switch, or silence is NOT agreement and NOT a preference signal** — it usually just means he didn't see it. **Rules:** (1) never infer intent or "proceed" from the absence of a click/response; (2) for any material decision, put it in front of him explicitly and wait for an affirmative answer — if a passive prompt goes unanswered, re-surface it directly rather than assuming a default; (3) a `SwitchMode`/`AskQuestion` rejection means "not that, or didn't see it," never "I considered the status quo and chose it."

### Subagent git safety — never discard uncommitted work (2026-06-10, smokebook loss)

- A dispatched subagent, blocked from `git checkout`-ing a branch by the user's **uncommitted** working-tree edits (full smoke notes), ran a `git restore` that **discarded** those notes. A separate fumble created an **accidental local merge** of an in-progress feature branch into the integration branch (`v1-redesign`). No code was lost (feature branch was pushed) but the user's notes were unrecoverable.
- **Rule:** subagent dispatch prompts that involve branch switching MUST instruct: if `git checkout`/`switch` is blocked by uncommitted changes, **STOP and report** — never `git restore`/`checkout -- <file>`/`stash drop`/`reset --hard`/`pull`-merge to "unblock." Uncommitted working-tree edits may be the user's hand-written work and are not in git history.
- **Rule:** subagents must never `git merge` or `git pull` into a shared branch (`v1-redesign`/`master`) as a side effect of checkout; merges into shared branches are orchestrator-only (`merge --no-ff` after approval).
- **Corollary:** the orchestrator should commit the user's hand-entered artifacts (smoke notes, etc.) promptly rather than leaving them as long-lived uncommitted working-tree state that a dispatch can clobber.

### Whiteboard chrome — extend don't rewrite (2026-06-09, wb-chrome-redo)

- **Two successive chrome attempts (P1.1, P2) regressed board separation and killed interactive controls** because executors rewrote `WhiteboardWorkspaceClient.tsx` rather than extending it. The engine's page/board switching, `pageDataRef` guards, live-sync wiring, and recording lifecycle are tightly coupled and fragile to restructuring.
- **Rule:** chrome work on the whiteboard workspace is ADDITIVE ONLY. New state, new handlers, new JSX layout, new imports — all fine. Modifying or removing existing engine logic (page switch, scene data flow, recording FSM wiring) — hard stop, escalate to orchestrator.
- **Pattern for chrome integration:** (1) start from known-good baseline (`a150d4f`), (2) extract new chrome components via `git show <commit>:<path>`, (3) apply engine additions (A4 reliability, new callbacks) as surgical additions AFTER existing logic, (4) replace the render section JSX with the new chrome layout, (5) verify board separation in a real browser before declaring done.
- **Calibration:** "do not touch the engine" does NOT mean zero changes to the engine file. Adding state, handlers, callbacks, and wiring NEW buttons to EXISTING functions is expected and necessary. The guard is against BEHAVIORAL changes (rewriting, refactoring, or removing existing logic).
- **Windows extraction:** `Out-File -Encoding utf8` adds UTF-8 BOM which corrupts non-ASCII test assertions when jest processes the file. Always extract files using `[System.IO.File]::WriteAllLines(path, content, New-Object System.Text.UTF8Encoding $false)` for test files with unicode literals.

### Secret handling — third-party egress (2026-05-31, 2FA QR)

- A "secret encrypted at rest" guarantee is incomplete if the plaintext secret is later transmitted to a third party. The Phase-1 2FA acceptance verified no plaintext secret in DB/logs but **missed** that the enrollment QR was rendered via an external API (`api.qrserver.com`) with the secret in the URL — caught only in smoke via a CSP block, not by tests or the acceptance checklist.
- **Rule:** for any secret/credential, the acceptance bar includes **no plaintext secret egress to external services** (QR generation, analytics, error trackers, logging sinks, CDNs). Generate/handle secrets locally (server-side or in-browser), never by handing them to a third-party URL. Add a grep-guard test against known external-service hosts where practical.
- **Corollary:** a tight CSP is a real safety net — it converted a silent secret leak into a visible failure. Don't reflexively allowlist a blocked third-party origin to "fix" a feature; first ask why we're sending it data at all.

### Layout / coordinates — jsdom blind spot (2026-05-30, whiteboard viewport sync)

- **Coordinate and layout math is not verified in jsdom.** jsdom reports `offsetLeft`/`offsetTop` as 0 and applies transforms synchronously, so offset-contamination and version-skip bugs are **invisible** to unit tests (the buggy viewport-center formula matched the correct one for ~2 weeks). **Rule:** prove geometry on a **real browser** — on-device debug HUD, Playwright/WebKit, or tutor+student hardware — before calling viewport/sync work done.
- **Requirement-not-code tests.** Assert the user-observable requirement via an **independent oracle** (e.g. the library's real transform), never constants back-derived from the implementation's own formula. **Canonical pattern:** vary `offsetLeft`/`offsetTop` and assert scene viewport center unchanged (offset-invariance). **Layout/chrome:** assert **relational** properties (equal inset in parent, midline alignment) — not absolute pixel positions; see [`.cursor/rules/visual-layout-oracles.mdc`](.cursor/rules/visual-layout-oracles.mdc). A green Jest suite is necessary, not sufficient, for layout.
- **No-theater / real-render gate.** Red-before / green-after, or it does not count. Force-triggered harnesses can **mask** cadence bugs; prefer real event cadence or hardware HUD when the symptom is device-only.

### Smoke-note triage anchoring + Playwright-to-spec (2026-07-03, fix-batch double-regression)

In the wave5 fix batch, four smoke findings were mis-handled — two mis-scoped to the wrong surface (a top-bar note written under the *learner sign-out* test was applied to the *tutor in-session* top bar; an "End" note written under the *student-detail open-sessions* test was applied to the *in-session* End button), and two shipped as "fixed" on green Jest but **regressed on real hardware** (replay auto-play now always jumps to the scrubber end; the notes form disappeared entirely during generation).

- **Lesson A — a smoke finding is `note + the test item it was written under`, never the note text alone.** Andrew anchors notes to the test where he noticed the issue. Triage MUST preserve that anchor and interpret the note *first* in the context of the test's surface. He *sometimes* files a general note under a test just because that's where he noticed it — so: (1) interpret in the test-surface context first, (2) if it's genuinely ambiguous whether the note is generic or specific to the surface-under-test, **verify with Andrew** — never resolve the ambiguity by assumption. The disambiguation is usually already encoded by placement; stripping the note out of the smokebook into a floating instruction destroys it. When dispatching a fix, the anchoring test/surface must travel with the instruction, and the orchestrator should quote the anchor back to Andrew before building.
- **Lesson B — Playwright for everything we touch; tests to spec, never to code.** Jest/jsdom is near-worthless for this app's failure classes (replay/media timing, notes render lifecycle, layout/size) — this batch proved it: green Jest, regressed hardware, twice. Standing rule (Andrew 2026-07-03): if we touch a surface, it gets a **Playwright** test. And ALWAYS write the test to the **spec / user-observable requirement** with an independent oracle — NEVER derive it from the implementation just written (that passes by construction and proves nothing). Green Jest is necessary-not-sufficient; a real-browser/Playwright check is the gate for these classes before any fix is called done. Cross-ref **Layout / coordinates — jsdom blind spot** and **Requirement-not-code tests** above.

### In-chat model cost (Cursor UI)

- **Reasoning effort drives spend.** Context window size, **reasoning effort**, and the thinking-visibility toggle are separate; **effort** (not the thinking toggle) is the main token-spend driver. The inline model label in the picker is billed.

## When picking up work mid-feature

1. Read the feature's `*-STATUS.md` first. Find the phase status table.
2. Read the `~/.cursor/plans/*.plan.md` for the feature if it exists.
3. Re-run the test suite (`npx jest`) to know your baseline before
   making changes.
4. Update the STATUS doc as you finish each sub-phase.

## Model usage protocol (provisional, captured 2026-05-18 post-Composer-2.5-launch, refined same day after discovering Task-tool per-subagent model selection)

Cost discipline matters because Opus on-demand burn was a non-trivial
line item even before this pilot started charging anyone. Composer 2.5
(released 2026-05-18) is ~30x cheaper per token than Opus 4.7 at the
Standard tier, ~5x cheaper at the Fast tier, and demonstrated
production-grade quality on this codebase the day it launched (security
audit Tier A, commits `5aa16f9` + `8cdbe58` — see "Real-world
observations" below).

**Default execution path: inline subagent dispatch from the Opus
orchestration chat.** When orchestration decides a task needs doing,
the default is `Task(model="composer-2.5", prompt="<scope blob>")`
from the Opus chat itself — NOT a separately-spawned Composer chat
that Andrew has to context-switch into. Andrew stays in the
orchestration chat; subagent runs foreground or background; results
report back inline. This collapses the prior "Andrew switches between
chats" friction to "Opus dispatches; Andrew sees results in flow."

- **Executor work**: `subagent_type="generalPurpose"`,
  `model="composer-2.5"`. The dispatch prompt carries the scope blob
  the orchestrator would have otherwise asked Andrew to paste into a
  new chat.
- **Investigation** (read N files to understand a thing):
  `subagent_type="explore"`, `model="composer-2.5"`. Readonly, cheap,
  returns a focused summary instead of consuming Opus tokens on file
  reads.
- **Large-diff adversarial review or 5-axis reliability checks**:
  `model="claude-4.6-sonnet-medium-thinking"`.
- **Long-running execution**: `run_in_background=true`. Opus keeps
  orchestrating in parallel; system notifies on completion.

**Parallel subagent execution + shared-working-tree safety** (policy
ratified 2026-05-30 by Andrew; PROVISIONAL — refine if agents keep
stepping on each other):

Default Composer / `generalPurpose` subagents all share **one working
tree** — there is no git isolation between them. Two code-writing
dispatches running at the same wall-clock moment clobber each other's
uncommitted files and race the git index (the Wave A 2026-05-27
lesson).

- **Parallelize whenever it's safe.** "Safe" = you know the two agents
  will provably (a) **not touch the same files/resources**, OR (b) run
  in **isolated git worktrees** and know how to **clean-merge on their
  way out**. When either holds, parallelize to save wall-clock.
- **When in doubt, serial.** One branch in flight → smoke →
  `merge --no-ff` → next.
- **True wall-clock parallelism = isolated worktrees.** The
  `best-of-n-runner` subagent type auto-creates its own git worktree +
  branch per run (no manual setup by Andrew). Use it for parallel
  code-authoring + isolated unit tests; merge each branch `--no-ff`
  after smoke.
- **Worktrees isolate files/git, NOT shared runtime services.** The
  local Postgres (`tutoring_notes_test` @ 5432), the Docker relay
  (`wb-relay-local`), the dev-server port (3100), and `node_modules`
  (each worktree needs its own `npm ci`) are single-instance. **Never
  run two live-stack tasks** (dev server, DB migrations,
  `npm run test:wb-sync`) against the shared services at once —
  serialize those regardless of worktree isolation.

**`composer-2.5-fast` is FORBIDDEN (hard rule).** It is ~6× the cost
of `composer-2.5` for a latency-only benefit that buys us nothing on
this codebase. All Composer dispatches use **`composer-2.5`** — never
`-fast`. Codified alongside the explicit-model rule below and in
[.cursor/rules/orchestrator-discipline.mdc](.cursor/rules/orchestrator-discipline.mdc)
§ Hard model rules.

**Effort-scoped override — Whiteboard reliability floor (the Sarah
merge, `wb-wave5-polish`).** For the whiteboard-reliability-floor
effort (plan `whiteboard_reliability_floor_9ba650d1`), execution tier
is **Opus by default** — a deliberate, scoped inversion of the
"dispatch aggressively to Composer" default below, justified by the
stakes (the live commercial session experience) and Composer's mixed
track record on this exact A/V/recording code. Drop to `composer-2.5`
**only** for unambiguously mechanical, zero-correctness-doubt,
test-gated tasks (delete confirmed-dead files, pure CSS file splits
verified by visual diff, boilerplate scaffolding). Anything touching
A/V transport, the recording lifecycle, effect-dependency wiring, or
layout/enumeration coupling stays on Opus. Full statement in
[.cursor/rules/orchestrator-discipline.mdc](.cursor/rules/orchestrator-discipline.mdc)
§ Effort-scoped override.

**ALWAYS specify `model` explicitly on EVERY dispatch — including
`resume`.** Observed 2026-05-29 (Andrew caught it): a `Task` `resume`
+ `interrupt` call with `model` omitted ran on the **parent** chat's
model (Opus 4.8 High), NOT the resumed subagent's prior `composer-2.5`
— contradicting the tool's own claim that "prior model will be used."
Two short redirect turns silently burned Opus. The tool description
also says resume should not take a model and will inherit; in practice
that inheritance is unreliable. Therefore:
  - **Do not rely on `resume` to preserve the subagent's model.** When
    model/cost control matters (it always does here), prefer
    dispatching a **fresh `Task` with `model="composer-2.5"` set
    explicitly** over resuming — a fresh dispatch is deterministic,
    resume is not. The fresh dispatch prompt restates the scope; the
    re-establishment cost is trivial versus an accidental Opus turn.
  - If you must `resume` (to preserve in-context findings), assume the
    model may silently fall back to the Opus parent, and weigh that
    cost before interrupting. Check the subagent's row in the agents
    panel after dispatch to confirm the tier actually used.

**Bootstrappers (`docs/handoff/*-bootstrapper.md`) are now usually
unnecessary.** They were an artifact from when subagent context had
to be hand-curated via paste-blob into fresh chats. With inline
dispatch, the dispatch prompt IS the scope blob. Write a bootstrapper
only when: (a) the work is novel architecture where Opus is doing the
design pass and the bootstrapper IS the design artifact worth
committing for audit trail (the "Opus designs, Composer ships"
pattern below); (b) the work will be re-run via `best-of-n-runner`
subagent type; (c) async handoff across days/weeks where the spec
needs to be durable memory. Otherwise: dispatch with a scope-blob
prompt and skip the file.

**Tier assignment** (which model to dispatch — escalate only on the
criteria in the next subsection):

- **Composer 2.5** is the default. Use for executor work, spike
  chats, code review, security audits, cleanup passes, and most
  refactor + feature work where the pattern is clear from prior
  similar work in the repo.

- **Sonnet** when more than Composer is needed but Opus is overkill:
  novel architecture that fits in ~half-day design, cross-cutting
  changes needing broader context than a single feature, code review
  of large diffs where subtle issues (concurrency, auth boundaries)
  might be missed, 5-axis adversarial reliability reviews.

- **Opus reserved for orchestration only**:
  - Phase planning + sequencing (this chat-style orchestration
    session).
  - Cross-cutting design decisions that span multiple phases
    (e.g. introducing the FSM/outbox/atomic end-session three-pillar
    pattern back in Phase 1).
  - Multi-day novel architecture where wrong design = days of
    unwinding.
  - Strategic decisions (Vercel Pro upgrade, when to merge, when to
    defer a phase, brand resumption gating).
  - Synthesizing results from multiple subagents back to Andrew.
  - Tiny in-chat doc commits where dispatch overhead > task cost
    (≤5 tool calls AND docs-only AND single coherent thought
    already loaded).

**Escalation criteria** — what triggers moving up a tier:

- Composer 2.5 → Sonnet: the work surface has any of (a) auth-boundary
  or ownership-assertion change, (b) concurrency or race-condition
  reasoning, (c) cross-cutting refactor affecting >3 phases of code,
  (d) a feature plan where the 5-axis reliability review has not yet
  been done.
- Sonnet → Opus: the work is (a) introducing a new architectural
  pillar to the recorder lifecycle / outbox / sync layer (Pillar
  language from RECORDER-LIFECYCLE.md), (b) revisiting a design
  decision that has already cost us a recovery cycle in pilot, (c)
  multi-day with high blast radius (Phase 4 series, Phase 1
  outbox/FSM work, Phase 11d prompt iteration meta-loop), or (d)
  determining the shape of a future Phase that doesn't yet have a
  scope.

**Conductor tier — orchestration itself is tierable (2026-06-12)**

The tier-assignment bullets above govern which model **executes** work
(via subagent dispatch). A separate axis governs which model **conducts**
the orchestration chat itself — and this is where the largest API-cost
lever lives.

- **The cost mechanic:** subagents are cheap; the expensive line item is
  the *standing Opus orchestration chat*. Every turn re-bills the entire
  accumulated context at Opus rates, and reasoning-effort multiplies it.
    Two levers: (a) what **tier conducts**, (b) **context hygiene** — a
    fresh chat bootstrapped from `ORCHESTRATOR-STATE.md` is far cheaper
    than letting one chat balloon; restart fresh after big milestones.
    **Swap early — at ~60–70% context (Cursor's flagged threshold), not
    at truncation:** quality/hallucination drift can begin in that band.
    Start a fresh chat, `@`-reference the previous chat +
    `ORCHESTRATOR-STATE.md`, continue. This depends on the state doc being
    continuously current so the chat is always swap-ready. See
    [`.cursor/rules/orchestrator-discipline.mdc`](.cursor/rules/orchestrator-discipline.mdc)
    § "Swap chats early".
- **The judgment-vs-loop heuristic:** ask of the orchestration session —
  *"Am I mostly making NEW judgment calls (sequencing, design trade-offs,
  is-this-grouping-safe, when-to-merge/defer/escalate), or mostly running
  a KNOWN loop (dispatch scoped item → merge → build → push → repeat)?"*
  - **Known-loop backlog burndown** (e.g. a visual/UX tweak wave with
    pre-specified items) → **Composer 2.5** conducts (if every decision
    is already made) or **Sonnet** (if you want a safety net that reads
    subagent reports critically).
  - **Mixed** (scoped work + live design/grouping/reliability calls) →
    **Sonnet** conducts.
  - **New judgment** (phase planning, novel architecture, auth/migration
    design, strategic calls like cut-to-master / Vercel tier / brand
    gating, multi-day high-blast-radius) → **Opus**, **episodically** —
    spin up Opus for that one session, then drop back down.
- **Key reframe:** "Opus reserved for orchestration only" (above) is
  refined — orchestration is a **spectrum**. Planning/design/strategy
  orchestration = Opus; execution-queue / merge-train orchestration =
  Sonnet or Composer. Keep Opus for **episodes**, not as a standing
  conductor. The "in doubt → Opus" rule is for **judgment/quality-risk
  calls**, NOT for keeping a conductor warm.
- **Validating example (2026-06-12):** the v1 design-system wave-2
  burndown (6-agent fan-out + merge-train + smokebook) was a known loop;
  the only genuine Opus-grade call was grouping agents for file-
  disjointness, which Sonnet would also handle.
- **Default conductor is Composer 2.5; escalate UP by tripwire (2026-06-23).**
  Andrew now conducts from Composer 2.5 by default and escalates to
  Sonnet/Opus only on a tripwire.   **First response to a tripwire is a plan-mode "step back"** (read-only,
  still on Composer 2.5) — re-think and write a concrete plan; that alone
  often clears the tripwire. Only if the step-back confirms it's genuinely
  above-tier do you escalate the model. Because **Composer cannot dispatch
  Anthropic models**, escalation = **STOP and recommend Andrew switch
  this chat's model up** (not "dispatch up"). Use plan mode liberally in
  general — including for small/narrow problems — not only at tripwires. The self-detectable
  tripwire checklist + STOP-and-switch handoff protocol is the
  authoritative, always-applied source:
  [`.cursor/rules/orchestrator-discipline.mdc`](.cursor/rules/orchestrator-discipline.mdc)
  § "DEFAULT CONDUCTOR IS COMPOSER 2.5 — escalate UP by tripwire".
  Tripwires in brief: 2nd failed attempt at the same bug; changing a
  fragile/load-bearing surface (recorder FSM, outbox, end-session,
  live-A/V, WB sync/viewport, auth boundary, migration); multiple viable
  approaches with real trade-offs; concurrency/ordering/geometry or
  >3-area cross-cut; scope explosion; you're guessing; 5-axis review not
  done; strategic call. Escalate to the **cheapest** tier that clears it
  (Sonnet default; Opus only for new architectural pillars / designs that
  already cost a recovery cycle / multi-day high-blast-radius).

**Proven patterns** — combine tiers when it pays off:

- **"Opus dispatches inline"** (default since 2026-05-18 refinement).
  Opus chat dispatches Composer 2.5 subagents for execution,
  `explore` subagents for investigation, Sonnet subagents for
  adversarial review. Andrew stays in one chat. The dispatch prompt
  carries the scope. This very revision was committed via this
  pattern as the inaugural demonstration.
- **"Opus designs, Composer ships"** (validated 2026-05-17 PDF
  feature + per-page view state). Opus does the design pass + writes
  a bootstrapper as the design artifact; Composer 2.5 executes via
  subagent dispatch with the bootstrapper @-referenced or paste-
  blobbed in the prompt. Optimal when the design is high-stakes
  (audit-trail value) and the execution is well-patterned.
- **"Composer designs and ships"** (validated 2026-05-18 security
  Tier A, commit `8cdbe58`). Composer 2.5 handles both spec and
  implementation in-chat or in a single subagent dispatch. Optimal
  when work is clearly scoped, has a definite acceptance criterion,
  and orchestrator has prior context to write a good dispatch
  prompt.

**What Opus should NOT do in-chat** (these are subagent-dispatch
candidates, not Opus tool calls):

- Reading code files to "understand a thing" → dispatch an `explore`
  subagent instead.
- Writing bootstrappers for well-patterned work → dispatch a
  Composer subagent to author (or skip the bootstrapper entirely
  per "Default execution path" above).
- Multi-step refactors, migrations, or feature implementation →
  dispatch a Composer subagent with a scope blob.
- Investigating failing CI checks → dispatch a `ci-investigator`
  subagent.

**Real-world observations** — what we've actually seen, updated when
evidence changes:

- **Composer 2.5 quality (2026-05-18, day-of-launch)**: production-grade
  on the security Tier A scope. Read 3 files to confirm 1 claim
  (`/forgot-password` enumeration safety); caught the silent
  `npm audit fix` no-op via `git diff --stat`; correctly diagnosed
  peer-dep conflict from the ERESOLVE warnings; held scope discipline
  on zod-validation generalization. Verified pre-push via tsc + eslint.
  Slightly verbose code comments but otherwise indistinguishable from
  Opus-class output for this scope.
- **Composer 2 fell short of marketing claims in practice** (Andrew,
  pilot history). Composer 2.5's marketing is similar in shape; treat
  this protocol as PROVISIONAL pending independent benchmark data and
  more multi-week observation of Composer 2.5 in real work.
- **What to watch for that would trigger protocol revision**: (a)
  complexity ceiling — work where Composer 2.5 silently produces
  mediocre work without obvious failure (rename to "default-with-
  caveats" if it appears); (b) reliability ceiling — instances where
  Composer 2.5 cuts corners on tests/lints/docs that an Opus pass
  would have caught; (c) debugging depth ceiling — issues where
  Composer 2.5 gives up at a layer Opus would have pushed through.
  Capture these as dated entries under "Real-world observations"
  when they occur.

**Cost discipline rule**: default to the cheapest tier that can do
the job. Default to inline subagent dispatch over in-chat Opus tool
calls. Escalate only when the cost of a wrong call (hours of
unwinding) > the marginal model cost (cents per Composer 2.5
subagent vs dollars per Opus chat). **Opus's default verb is
dispatch** (Andrew 2026-05-30, "even more aggressive on farming to
Composer"): Opus does nothing that doesn't need Opus-grade
*judgment*; *hands* work (reading code to learn, editing code/tests
of any size, investigations, verification runs, durable prose) farms
to Composer 2.5 — and capability-doubt on an *execution* task is not
a reason to keep it on Opus. The only "in doubt → Opus" is for
*judgment/quality-risk* calls. See the **dispatch test** in
[`.cursor/rules/orchestrator-discipline.mdc`](.cursor/rules/orchestrator-discipline.mdc),
the always-applied authority on this.

## Merging convention (solo-tutor pilot stage)

While the pilot is solo (just Andrew + Sarah) and there's no adversarial
CI agent reviewing PRs automatically:

- **Andrew smokes once — when the feature is DONE** ([`.cursor/rules/smoke-when-done.mdc`](.cursor/rules/smoke-when-done.mdc)). Agents own spec → implementation → **Playwright per acceptance item** → automated gates green. Andrew enters for **hardware quirks + human judgment only** — not regression re-proof. **Do not request Andrew smoke mid-wave or per-fix.**
- Executors deliver a **smokeable branch** with the Vercel Preview URL +
  a smoke checklist + a clear final report **after the DONE checklist passes**.
  Smokebooks MUST follow
  [`docs/handoff/SMOKEBOOK-TEMPLATE.md`](docs/handoff/SMOKEBOOK-TEMPLATE.md)
  (enforced by [`.cursor/rules/smokebook-template.mdc`](.cursor/rules/smokebook-template.mdc)).
  They do NOT open PRs.
- Andrew (or the orchestrator after Andrew confirms smoke pass) merges
  directly to master via `git merge --no-ff <branch>` to keep a clean,
  revertable merge commit. The branch is preserved (and later cleaned up
  by the stale-branch sweep utility).
- **Direct pushes to master WITHOUT a smoked branch are still
  forbidden** — branch + commit + push + smoke + merge is the
  discipline; only the PR step is dropped.
- **Whiteboard sync changes** (any file touching `src/lib/whiteboard/`,
  `src/components/whiteboard/`, or `tests/integration/whiteboard*`) need
  real-browser coverage via the hermetic relay — not jsdom alone. Pre-build
  the local relay image once (`npm run relay:build`; requires Docker).
  - **Tagged selective gate (default inner loop, 2026-06-23).** Playwright
    wb-regression tests carry domain tags (`@wb-graph`, `@wb-strokes`, … —
    [`tests/test-tags.ts`](tests/test-tags.ts)). On commits and small merges,
    run **`npm run test:wb-affected:run -- --base origin/<parent>`** (dry-run:
    `npm run test:wb-affected`) so only adjacent/affected tags execute. Err on
    caution — broad touches (e.g. `WhiteboardWorkspaceClient`) warrant extra
    tags or full suite. Explicit: `npm run test:wb-playwright:tags -- @wb-graph`.
  - **Merge to `v1-redesign` / long integration branches:** `test:wb-sync`
    **once on the final integrated tip** before `merge --no-ff` when the branch
    touched sync/whiteboard surfaces (existing cadence). Large stacked waves on
    the integration branch use the full suite; per-wave relay runs are not required.
  - **Merge to `master`:** **always full** — `npm run test:wb-sync` +
    `npm run test:regression` + `npx next build`. No selective gate.
  - **Cadence — merge-boundary, not per-wave (Andrew 2026-06-17).** The
    ~38-min Playwright phase is a **merge gate**, not a per-commit/per-fix-wave
    gate. Waves that **don't touch** whiteboard/sync apply paths (e.g.
    chrome/responsive-only) may use **`test:wb-affected`** only; the jest
    subset (`npm run test:wb-jest`, ~5s) is the minimum inner-loop gate.
- **Build-surface changes** (fonts, CSS, or build configuration — e.g.
  `src/app/fonts.ts`, `src/styles/*.css`, `eslint.config.*`, `next.config.*`,
  Tailwind/PostCSS config, `package.json` build scripts) MUST pass a real
  **`npx next build`** locally (full compile + ESLint lint step + TypeScript
  type-check; exit 0; route table printed) before `git merge --no-ff` — NOT
  jest alone (`npm run test:regression` does not exercise the Next
  build/lint/type-check pipeline). On 2026-05-31 Phase A (`5aa3c7d`) shipped
  stacked `next/font` `axes`+fixed-`weight` and ESLint parsing
  `src/styles/typography.css` as JS (bad `css` glob in `eslint.config.mjs`)
  failures invisible to jest; every intervening `v1-redesign` Vercel deploy
  broke until `754dbe5` + `e51d23f`. A green jest run is necessary but not
  sufficient for any build-surface change.
- **When this changes:** revisit the convention if (a) the team grows
  beyond solo or (b) an adversarial agentic CI pipeline lands that auto-
  reviews PRs. At that point, PRs become the right shape again. Until
  then, no notes were being added to PRs anyway — the ceremony was pure
  overhead.
