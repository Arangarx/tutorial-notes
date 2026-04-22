# Recorder refactor — branch handoff

**Branch:** `refactor/recorder-test-modular` (not yet pushed; main is master)
**Original plan:** `~/.cursor/plans/recorder-test-refactor_00e7871e.plan.md`
**Wrap-up + Sarah unblock plan:** `~/.cursor/plans/recorder_refactor_wrap_and_sarah_unblock_8301e036.plan.md`
**Last touched:** Apr 20, 2026

This doc lives on the refactor branch so that switching back to master and
returning later (or handing off to a fresh agent session) doesn't lose
context. Update it whenever you finish a phase or pause mid-flight.

---

## Status

**All planned phases complete; awaiting manual smoke before merge.**

| Phase | Status | What it produced |
|------|--------|---|
| 1 — extract pure modules + node tests | ✅ done | `src/lib/recording/{segment-policy,mime,storage,permissions,chimes,upload,recording-state}.ts` + matching unit tests under `src/__tests__/recording/` |
| 2 — extract `useAudioRecorder` hook | ✅ done | `src/hooks/useAudioRecorder.ts` (~870 lines after B5; owns all state/refs/effects). `AudioRecordInput.tsx` now a thin shell that consumes the hook and renders subviews per `state`. Latent `segmentNumber` staleness bug fixed via `segmentNumberRef`. |
| 3 — jsdom + RTL hook tests | ✅ done | `src/__tests__/dom/useAudioRecorder.dom.test.tsx` (12 cases after B5). `jest.setup-dom.ts`, RTL deps, single-config + per-file `@jest-environment jsdom` pragma. |
| 4 — extract presentational subcomponents | ✅ done | `MicControls`, `MainPanel`, `DoneCard`, `UploadingPanel`, `ErrorCard` under `src/app/admin/students/[id]/recorder/`; `AudioPreview` + `PendingSegmentList` extracted from `AiAssistPanel.tsx`. New dom tests per component + `keep-recorder-mounted.dom.test.tsx` regression. |
| 5 — Playwright e2e rollover | ✅ done | `tests/e2e/audio-rollover.spec.ts` (env-gated by `AUDIO_ROLLOVER_E2E=1`); injects `window.__SEGMENT_MAX_SECONDS_OVERRIDE` and a stub `MediaRecorder` via `addInitScript`; new `e2e` Playwright project in `playwright.config.ts`. |
| B1 — client-direct Vercel Blob upload | ✅ done | `src/lib/recording/upload.ts` `uploadAudioDirect` + `/api/upload/audio` route handler using `@vercel/blob/client`. `AudioUploadInput.tsx` and `useAudioRecorder` rollover both use the new path. Old `uploadAudioAction` deleted. **Resolves Sarah's 17.9MB upload failure** (Vercel serverless 4.5MB body cap). |
| B2 — drop silent transcript truncation | ✅ done | `MAX_INPUT_TOKENS` raised to 30 000 in `src/lib/ai.ts`; `generateNoteFromTextAction` errors explicitly when input exceeds the cap instead of silently chopping the back of the transcript. |
| B3 — always-mount tabs + confirm-on-switch | ✅ done | `AudioInputTabs.tsx` always mounts `AudioRecordInput`/`AudioUploadInput` (when `blobEnabled`) and hides inactive panes via `display: none`; new `recordingActive` state + confirm prompt when leaving the Record tab during a live capture. Closes the "tab-switch silently kills the recording" bug. |
| B4 — Sarah notes-content rework | ✅ done | New 5-field JSON contract (`topics`, `homework`, `assessment`, `plan`, `links`) with terse "BARE ESSENTIALS" prompt; `PROMPT_VERSION = 2026-04-20-v6`. New `SessionNote.assessment` column (default `""`); existing DB column `nextSteps` kept as-is and labeled "Plan" in the UI everywhere. Migration `prisma/migrations/20260420000000_session_note_assessment`. All UI surfaces updated (admin notes form/list, share-link pages, marketing/privacy text). Tests updated for the v6 prompt shape and new fields. |
| B5 — gapless segment rollover | ✅ done | `useAudioRecorder.rolloverSegmentGapless()` pre-warms the next `MediaRecorder` on the same `MediaStream` BEFORE stopping the current one. Old recorder's chunks snapshotted to a local array; its `ondataavailable` rebound so the final-flush blob doesn't pollute the new segment. Closes the ~3-5s "between recordings" gap reported in dev smoke. |
| 6 — final review + handoff | ✅ done | This doc + BACKLOG entries closed + learning bullet added. Awaiting manual smoke. |

---

## Test counts (last run on this branch)

- `npx jest` → **246 tests pass, 8 pre-existing DB failures** (auth/email/password-reset/note-and-share/transcribe-late-hallucination need a local test postgres; unrelated to anything on this branch).
- `npx tsc --noEmit` → clean.
- 12 hook tests in `useAudioRecorder.dom.test.tsx` (started at 8 in Phase 3; +4 in B5 for ordering/pollution invariants).
- Playwright `e2e` project ready but opt-in (`AUDIO_ROLLOVER_E2E=1 npx playwright test --project=e2e`).

---

## Open issues / discoveries from this branch

All recorder-related discoveries on this branch have shipped. The ones that
remain are about-the-recorder-but-not-this-branch and live in
`docs/BACKLOG.md`:

- Recorder behavior on long iOS sessions (timer suspension when phone idles,
  `MediaRecorder` state after sign-out → sign-in) is still backlog material
  under "Recording — long sessions, Whisper limits, alerts (2026)".
- Playwright `e2e` project hasn't been wired into the build gate yet — kept
  opt-in until we trust the stub MediaRecorder isn't flaky on CI workers.

---

## Smoke checklist — run before merging to master

The Phase 1-5 + B1-B5 work has been committed across 8+ commits on this
branch. Before pushing / opening a PR, run the manual smoke:

1. **Cold start.** `npm run dev`, sign in, open a student page. No console
   errors; mic permission prompt appears in the Record tab if not granted.
2. **Pure record + save.** Record ~30 seconds, Stop & save → Transcribe →
   AI fills Topics/Homework/Assessment/Plan/Links (NOT "Next steps").
3. **Tab switch during live recording.** Start recording, click "Paste
   text" — confirm prompt appears ("You're recording — switch tabs
   anyway?"), Cancel keeps you on Record. Confirm switches you to Paste,
   recording continues; click back to Record, audio is still ticking; stop
   normally.
4. **Auto-rollover (gapless).** Temporarily set `SEGMENT_MAX_SECONDS = 60`
   and `WARN_SEGMENT_SECONDS = 30` in `src/lib/recording/segment-policy.ts`,
   restart dev. Record continuously through one rollover. Listen back to
   the two segments back-to-back — there should be no audible gap. State
   never flickers through "uploading…" for the auto-rollover. **Revert
   the constants before commit.**
5. **Manual upload — large file.** Upload an m4a > 5MB. Should succeed
   (B1 client-direct path bypasses the 4.5MB serverless body cap).
6. **Edit a note + save.** Edit form shows Assessment + Plan fields (NOT
   Next steps); save persists; share-link page shows both new fields.
7. **Search.** Type something in the notes search that only matches
   `assessment` content — confirm the row surfaces.

If steps 1–7 all pass: revert any temporary segment-policy constants,
final commit + push, open PR to master.

---

## How to pick this back up if smoke fails

1. **Read this doc, the wrap-up plan, and the original plan.**
2. **Check out the branch** (`git checkout refactor/recorder-test-modular`).
3. **Re-run the test suite** to confirm green:
   ```powershell
   npx jest
   ```
   Expect `246 pass, 8 pre-existing DB fails`.
4. **For recorder behavior bugs**, the entry points are:
   - `src/hooks/useAudioRecorder.ts` — start with the invariant block at
     the top, then jump to the function the bug is in. The B5 gapless
     path is `rolloverSegmentGapless()`.
   - `src/__tests__/dom/useAudioRecorder.dom.test.tsx` — has the
     FakeMediaRecorder + setup notes.
5. **For UI bugs**, the recorder components are split under
   `src/app/admin/students/[id]/recorder/` with one file per component
   and a co-located dom test.

---

## Files to know about

- `src/hooks/useAudioRecorder.ts` — the heart. Read its top docblock; the
  invariants list (iOS MP4, StrictMode safety, rollover-keeps-mic-hot,
  meter-via-ref, single-shot rollover guard, **gapless-rollover chunks
  rebind**) is load-bearing.
- `src/app/admin/students/[id]/AudioRecordInput.tsx` — thin shell that
  picks a subview based on `state`; subviews under `./recorder/`.
- `src/app/admin/students/[id]/AudioInputTabs.tsx` — always-mount + confirm-
  on-switch (B3).
- `src/lib/recording/upload.ts` — client-direct Vercel Blob upload (B1).
- `src/app/api/upload/audio/route.ts` — token route handler.
- `src/lib/recording/segment-policy.ts` — `effectiveSegmentMaxSeconds()` and
  `effectiveWarnSegmentSeconds()` honor `window.__SEGMENT_MAX_SECONDS_OVERRIDE`
  / `window.__WARN_SEGMENT_SECONDS_OVERRIDE` outside production builds, so
  the Playwright spec (and dev smoke) can drive a rollover in seconds.
- `src/__tests__/dom/useAudioRecorder.dom.test.tsx` — has two non-obvious
  setup tricks documented inline:
  - `jest.useFakeTimers({ doNotFake: ["queueMicrotask"] })` — Jest 30's
    modern fake timers fake `queueMicrotask` by default, which freezes the
    FakeMediaRecorder stop callback.
  - `flushAsync` loops 20 microtasks — the rollover chain has many `await`
    hops.
- `tests/e2e/audio-rollover.spec.ts` — opt-in via `AUDIO_ROLLOVER_E2E=1`;
  uses `page.addInitScript` to inject the MediaRecorder stub + segment-cap
  override.
- `jest.config.ts` — single project + per-file `@jest-environment jsdom`
  pragma. Don't try to convert to `projects: [...]` again — `next/jest`'s
  SWC transform doesn't propagate into project sub-configs and TS types
  blow up under babel.

---

## Learning: "guards that should error"

Discovered while wiring B2: the AI server action used to **silently truncate**
oversized transcripts (`text.slice(0, MAX_INPUT_TOKENS * 4)`) on the theory
that "some answer is better than no answer." In practice this produced a
notes generation that mysteriously dropped the back half of long sessions
with no warning to the tutor. The right shape for a soft cap is:

> If we hit the cap, **error explicitly** with an actionable message — never
> truncate silently.

Applied:

- B2 in `generateNoteFromTextAction`: cap raised to 30 000 tokens AND the
  silent slice is gone; we return `{ ok: false, error: "..." }` if the
  transcript overflows, so the tutor sees a real message rather than
  "where did the second half of the session go?".
- The same shape now lives in `transcribeAndGenerateAction` (silent-segment
  hallucination guard returns a structured warning with `warningKind`,
  rather than dropping fields).
- The Sarah B1 issue was diagnosed *late* because of the symmetrical
  failure on the other side — Vercel returned 413 silently before our code
  ran, so there was no `rid=` log to find. Mitigation: client-direct upload
  removes the silent failure path entirely.

**Pattern to repeat:** when you find a "be conservative, just clamp it"
defensive code path that causes user-visible weirdness without a log line,
prefer to either (a) fix the underlying capacity, (b) raise the limit until
real-world inputs fit, or (c) error explicitly. Don't silently degrade.
