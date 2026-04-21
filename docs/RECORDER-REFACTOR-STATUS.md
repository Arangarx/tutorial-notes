# Recorder refactor — branch handoff

**Branch:** `refactor/recorder-test-modular` (not pushed; main is master)
**Plan:** `~/.cursor/plans/recorder-test-refactor_00e7871e.plan.md`
**Last touched:** Apr 20, 2026

This doc lives on the refactor branch so that switching back to master and
returning later (or handing off to a fresh agent session) doesn't lose
context. Update it whenever you finish a phase or pause mid-flight.

---

## Status by phase

| Phase | Status | What it produced |
|------|--------|---|
| 1 — extract pure modules + node tests | ✅ done | `src/lib/recording/{segment-policy,mime,storage,permissions,chimes,upload,recording-state}.ts` + matching unit tests under `src/__tests__/recording/` |
| 2 — extract `useAudioRecorder` hook | ✅ done | `src/hooks/useAudioRecorder.ts` (~700 lines, owns all state/refs/effects). `AudioRecordInput.tsx` now a ~680-line shell that consumes the hook and renders subviews per `state`. Latent `segmentNumber` staleness bug fixed via `segmentNumberRef`. |
| 3 — jsdom + RTL hook tests | ✅ done | `src/__tests__/dom/useAudioRecorder.dom.test.tsx` (8 cases: happy path, MouseEvent regression, pause/resume, rollover, double-rollover guard, session safety cap, retry-once success, retry failure). `jest.setup-dom.ts`, RTL deps, single-config + per-file `@jest-environment jsdom` pragma. |
| **Stop 3** | **← here** | **Review coverage with PO before extracting components.** |
| 4 — extract presentational subcomponents | pending | `MicControls`, `Done`, `Uploading`, `Error`, `AudioPreview`, `PendingSegmentList` (last two from `AiAssistPanel.tsx`). Add their dom tests, including a **keepRecorderMounted** regression test for the tab-switch bug (see Backlog below). |
| 5 — Playwright e2e rollover | pending | Opt-in spec: stub `MediaRecorder`, override `SEGMENT_MAX_SECONDS` via `window` so a real-browser run drives a rollover in seconds. |
| 6 — final review + handoff | pending | Invariant audit, BACKLOG / learning doc updates, full `npm test` + `npm run build`, write final result report. |

---

## Verification at last commit on this branch

- `npx jest src/__tests__/recording src/__tests__/regressions src/__tests__/dom` →
  **14 suites, 119 tests passing.**
- `npx tsc --noEmit` clean.
- ESLint clean on changed files.
- Manual smoke (Apr 20, 2026, real mic): start, pause/resume, segment timer,
  warning chime, auto-rollover with two production-value-rate segments,
  upload success, done card. **Steps 1–6 of the smoke checklist passed.**
- Smoke step 7 (switching tabs while recording) **failed** — flagged as
  pre-existing UX bug, NOT a regression from this refactor. See Backlog.
- DB-dependent test suites still fail with `127.0.0.1:5432` errors —
  pre-existing local-Postgres environment issue, unrelated.

---

## Open issues / discoveries from this branch (already in `docs/BACKLOG.md`)

1. **~4-second audio gap at auto-rollover boundary.** Cause: non-atomic
   `MediaRecorder.stop()` then `start()` on the same stream. Likely fix:
   pre-warm a second `MediaRecorder` before stopping the first so the
   handoff is gapless. *Noted under "Time-based auto-rollover" follow-ups.*
2. **Switching tabs while recording silently kills the recording.** Cause:
   `AudioInputTabs` conditionally renders `AudioRecordInput`, so a tab
   switch unmounts it and the cleanup effect tears down the mic + recorder.
   Two-part fix planned: (a) always-mount the recorder (CSS-hide when
   inactive), (b) confirm-on-switch when actively recording. **High
   severity** for tutors mid-session. *Noted under "Real bugs (do before
   pilot grows past Sarah)".*
   - Phase 4 should add the `keepRecorderMounted` regression test for this
     once the always-mount fix lands. The dom test file is the right home.

---

## How to pick this back up

1. **Read this doc and the plan** (`~/.cursor/plans/recorder-test-refactor_00e7871e.plan.md`).
2. **Check out the branch** (`git checkout refactor/recorder-test-modular`).
3. **Re-run the test suite** to confirm green:
   ```powershell
   npx jest src/__tests__/recording src/__tests__/regressions src/__tests__/dom
   ```
4. **Decide whether to fix the tab-switch bug now or in Phase 4.** If now:
   it earns a place on this same branch since the keep-mounted fix
   naturally pairs with the component extraction in Phase 4. Otherwise,
   keep it on master / a separate branch and come back.
5. **Resume at Stop 3.** Phase 4 is `[Sonnet]` per the model-tiering rule —
   switch the model selector if you want to save Opus tokens.

---

## Files to know about

- `src/hooks/useAudioRecorder.ts` — the heart. Read its top docblock; the
  invariants list (iOS MP4, StrictMode safety, rollover-keeps-mic-hot,
  meter-via-ref, single-shot rollover guard) is load-bearing.
- `src/app/admin/students/[id]/AudioRecordInput.tsx` — thin shell. Phase 4
  will further chip away at this.
- `src/__tests__/dom/useAudioRecorder.dom.test.tsx` — has two non-obvious
  setup tricks documented inline:
  - `jest.useFakeTimers({ doNotFake: ["queueMicrotask"] })` — Jest 30's
    modern fake timers fake `queueMicrotask` by default, which freezes the
    FakeMediaRecorder stop callback.
  - `flushAsync` loops 20 microtasks — the rollover chain has many `await`
    hops.
- `jest.config.ts` — single project + per-file `@jest-environment jsdom`
  pragma. Don't try to convert to `projects: [...]` again — `next/jest`'s
  SWC transform doesn't propagate into project sub-configs and TS types
  blow up under babel.
