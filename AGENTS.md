# Tutoring notes — agent context

You are working in the **tutoring-notes** app inside the agenticPipeline
monorepo. This is the live commercial app Sarah (our pilot tutor) uses for
real sessions. Reliability matters more than feature speed: every late bug
we ship costs trust we can't easily rebuild.

## North star

> *"People need to use the app with confidence. Sarah is being patient,
> but that won't last forever."*

If a tutor would need to run a backup recorder alongside our app, the
feature is not done. See [.cursor/rules/reliability-bar.mdc](../../.cursor/rules/reliability-bar.mdc)
for the full reliability standard. **Every feature plan in this app must
include an adversarial review against the 5 reliability axes, with
BLOCKERs folded into Phase-1 acceptance — not deferred to follow-ups.**

The whiteboard plan
([../../docs/whiteboard-plan or ~/.cursor/plans/whiteboard_-_match_wyzant_for_sarah_plus_our_wedge_*.plan.md](../../docs/whiteboard-plan))
and `docs/WHITEBOARD-STATUS.md` are the working example of this pattern.

## Key docs

- [docs/BACKLOG.md](docs/BACKLOG.md) — pilot feedback, known follow-ups,
  reliability gaps audit.
- [docs/RECORDER-REFACTOR-STATUS.md](docs/RECORDER-REFACTOR-STATUS.md) —
  pattern for STATUS docs (per-feature handoff between sessions).
- [docs/WHITEBOARD-STATUS.md](docs/WHITEBOARD-STATUS.md) — current
  whiteboard build status, guardrails, adversarial review, demo gate.
- [docs/DEPLOY.md](docs/DEPLOY.md) — Vercel + Neon deploy notes.
- [docs/LOCAL-DEV.md](docs/LOCAL-DEV.md) — local setup.

## Conventions

- **Per-session ID logging is mandatory.** Audio uses `rid=<id>`; whiteboard
  uses `wbsid=<id>`. New capture/sync features pick a 3-letter prefix and
  log every state transition. Without this, prod debugging is impossible.
- **Migrations are additive.** Production runs on Neon; never drop or
  rename a column without a multi-step migration.
- **Server actions assert ownership.** `assertOwnsStudent(adminUserId,
  studentId)` (or the equivalent for the resource) runs before any
  mutation or read of student data.
- **Share links are tokenized + revocable.** No public Blob URLs for
  student content.
- **CSP is tight.** Adding a new external origin (sync server, embed,
  font CDN) requires updating `src/middleware.ts` and documenting it in
  the feature's STATUS doc.

## When picking up work mid-feature

1. Read the feature's `*-STATUS.md` first. Find the phase status table.
2. Read the `~/.cursor/plans/*.plan.md` for the feature if it exists.
3. Re-run the test suite (`npx jest`) to know your baseline before
   making changes.
4. Update the STATUS doc as you finish each sub-phase.
