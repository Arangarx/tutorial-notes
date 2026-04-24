# Tutoring Notes — Backlog

Living document. Things to research, calibrate, build, or decide once we have real data.
Not in priority order within sections — that comes when items move to a sprint/spec.

**Authoritative for tutoring-notes:** Known open work for this app should appear in this file (or be explicitly ✅ **Shipped** here with any follow-ups cross-linked). If it is not here, assume it was never captured — add it. Day-to-day tickets/PRs can still exist; this document is the backlog of record when they disagree.

## Pilot — Sarah (iPhone Safari, ~Apr 2026)

Reported via Discord after testing **Record → Transcribe** on phone. Treat as **highest priority** until reproduced or ruled out.

**Sarah’s clarification (same thread):** The **first** screenshot she sent was from a **reload** of the page; the **second** description (and/or screenshot) was from **opening the link again** (fresh navigation / new visit, not only a reload). When reproducing, test **both** paths — iOS Safari can treat them differently (bfcache, service worker, auth cookie timing).

**Reproduction (PO, Android Chrome, Apr 2026):** Same flow (**Record → upload → Transcribe**) **works** on a real Android phone in Chrome. Combined with Vercel showing **no** `POST` to `/admin/students/...` during Sarah’s failing session (only login `POST`), the working hypothesis is **iOS Safari / WebKit–specific** (fetch + Server Actions, storage/partitioning, background tab, or network stack) — **not** “all mobile” and not a missing server 5xx for that repro. **Next:** confirm on **Mobile Safari** when hardware access exists.

**Instrumentation (shipped):** `uploadAudioAction` and `transcribeAndGenerateAction` log **`rid=<uuid>`** at the start of each invocation (grep Vercel logs for `transcribeAndGenerateAction` or `uploadAudioAction`). Failed returns include **`debugId`**; the UI appends **`Ref: xxxxxxxx`** so screenshots can be matched to logs. **Throws** (e.g. generic “unexpected response”) still have no server `rid` — client logs `console.error` + user-facing hint; if the server log line appears, the request reached the handler.

**Sarah — desktop Chrome (Apr 19, 2026):** Recording UI ran, but **no real speech** in the capture; **Chrome did not prompt for microphone** (possible wrong default device, muted mic, or permission already “blocked” / system-level). Whisper still produced a **~65-character** transcript — classic **silence hallucination** (“thanks for watching / subscribe / like button”). The structuring LLM then returned **empty** topics/homework/nextSteps/links → Vercel warning **`[transcribeAndGenerate] AI returned all-empty fields`** with `transcriptChars: 65`. This is **not** caused by request-id logging; it is Whisper + empty structuring. **Mitigation shipped:** `src/lib/whisper-guardrails.ts` — `looksLikeSilenceHallucination()` rejects obvious boilerplate **before** the note is filled; tutor sees an explicit mic/speech message instead of junk in Topics. **Still backlog:** surface **mic permission state** (`navigator.permissions` where supported), copy when permission was never prompted.

**Sarah — desktop Chrome follow-up (Apr 20, 2026):** OS mic level alone wasn’t the cause — **Voice Recorder + Upload** worked, **in-browser Record** still produced junk. Pattern matches **wrong device / weak signal in Chrome capture**, not Whisper. ✅ **Shipped (initial cut):** in-tab **Record** UI now has an explicit **device picker** (`enumerateDevices` after permission), a **boost slider** (digital `GainNode`, 0.25×–3.0×, persisted to `localStorage`), and a **live RMS level meter**. Web Audio graph wraps `getUserMedia` so the boosted stream is what `MediaRecorder` encodes; falls back gracefully to the raw stream if `AudioContext` fails (test stubs, very old browsers). Files: `src/lib/mic-recorder-audio.ts`, `src/app/admin/students/[id]/AudioRecordInput.tsx`. Tests: `src/__tests__/mic-recorder-audio.test.ts`; Playwright `tests/smoke/audio-recording.spec.ts` mock updated to provide `enumerateDevices` + a track with `getSettings`.

**Sarah — Apr 20, 2026 partial-batch + preview-time fixes:** Two related rough edges from PO testing the new mic flow with multiple recordings: (1) when one of several recordings was accidentally short / silent, the **whole batch** failed with the scary mic-troubleshooting error, even though the other recording had real speech. (2) `Session start` / `Session end` stayed blank in the form preview because the auto-fill from recording timestamps only ran **server-side at save time** in `createNote`, so tutors couldn't see what would actually be saved. ✅ **Shipped:** per-segment hallucinations now **drop the bad segment** (delete blob + DB row, increment a counter) and `continue` instead of bailing the whole batch — only an **all-segments-bad** batch hard-fails with `HALLUCINATION_MIC_MESSAGE`. When one segment is dropped, the result returns `ok:true` with a `warning` and the existing yellow "Form partially filled — please review." block surfaces it. The action also now returns `sessionStartedAt` / `sessionEndedAt` (UTC ISO derived from the **kept** segments' `createdAt` / `durationSeconds`, so a 4-second silent stop does **not** pull the end time forward), and `NewNoteForm.populate` formats them as local-time `HH:MM` and pre-fills the time inputs (without clobbering anything the tutor already typed). Files: `src/app/admin/students/[id]/{actions.ts,transcribe-result.ts,NewNoteForm.tsx,AiAssistPanel.tsx}`. Tests: `src/__tests__/audio-isolation.test.ts` adds **partial silent segment** + **every segment silent** regression cases and asserts the derived times.

**Sarah — Apr 20, 2026 UX iteration (review pass):** First cut hid the picker/slider behind a **Test microphone** button — bad UX (controls weren’t discoverable, slider needed an extra click to come alive). Two real bugs surfaced too: (1) the slider was effectively un-grabbable (only moved on click) because `MicControls` was an inner function inside the parent component; the rAF meter loop called `setMeterLevel` ~60×/sec, every parent render created a *new* component identity, React unmounted/remounted the subtree mid-drag and the browser cancelled the pointer capture. (2) Tutors expected the slider to drive the **OS** mic level, but browsers cannot reach into Windows audio settings — it can only apply digital gain post-capture. ✅ **Re-shipped:** `MicControls` hoisted to module scope (stable identity); meter bar now updated **imperatively via `meterBarRef`** in the rAF loop (no React state churn → slider stays draggable, CPU drops); controls are **always visible at the top** of the Record tab with a single primary **Start recording** button; on Record-tab open, the page calls `navigator.permissions.query({ name: "microphone" })` — if **granted**, mic auto-acquires silently so picker labels + meter are live before pressing Start; if **prompt/denied/unsupported**, controls are shown disabled with explainer copy and the Start click does the prompt + acquire + record in one shot. Slider relabelled **Browser boost** with explicit help text pointing tutors to *Settings → System → Sound → Input* when the meter stays grey at 3.00× (the ground truth that browsers can’t change). Old `audio-record-test-mic` / preview-state IDs removed; smoke test still uses `audio-record-start` + `audio-record-stop`.

**Sarah — Apr 24, 2026 (post-CSP + Wyzant-style-timer ship):** First end-to-end test of the live whiteboard relay (wife's phone via shared link) — surfaced four discrete pieces of feedback plus one repro of an existing transcription bug.

  1. **Q1 — graphing tool:** Desmos confirmed. She wants a blank graph with X/Y labeled with numbers, **adjustable domain/range** to zoom in/out, and the option to **type an equation and insert it onto the whiteboard**. ✅ **Already aligned with shipped scope** — the Desmos iframe embed (Phase 1) gives the labelled-axes + domain/range UI for free, and the Track B1 math-equation render route handles the type-and-insert path. Verify on her next session that the workflow she described matches what we shipped end-to-end.
  2. **Q2 — recording on disconnect (highest leverage NEW item):** Her words: *"I don't think that the recording needs to keep going if the student is not connected. And it should pop up with a message saying student has disconnected due to connectivity or whatever reason and recording has paused. That way I know when it happens I can pause my instruction."* This **goes beyond** the timer pause we shipped today — the timer is now correct but **the audio recorder still keeps running** when she's alone. Captured as a discrete item under "Pilot feedback — action items" (`Recording auto-pause on student disconnect`). Builds directly on `bothPresent` + the new `active-ping` infra; ~1–2 hr.
  3. **Q3 — default = "show live + record":** Default OK as-is. Wants a **per-student override** *"that way if you know a student doesn't want to record it you can make the default appropriate to their situation."* Captured as `Per-student recording default preference` below.
  4. **Bonus — undo button on the whiteboard:** Standard expectation. Excalidraw has Ctrl/Cmd-Z built in — needs verification on touch (no keyboard) and a visible toolbar button on the tutor + student canvases. Captured as `Whiteboard undo (mark removal) — touch + visible button`.
  5. **Transcription bug repro (existing item, fresh data):** Her test recording was **two segments — 50:01 + 20:13** (so auto-rollover B5 is working, segments split correctly), but the combined transcribe step failed with `"The server stopped responding before transcription finished (Server Action 60ae8e0344429ba8d13bed01577ee6c04306a335c8 was not found on the server)"`. This is the existing Server Action timeout on long combined transcriptions — not new, but worth noting Sarah hit it on her first real test. Real fix is the **background queue / async transcription** path (currently the action runs synchronously and Vercel's hobby/pro tier has a hard ~5 min timeout). Tracked under existing items in "Recording — long sessions" + "Reliability gaps" sections; not surfacing a new entry but priority bumped because this is now a *recurring* paper cut.
  6. **Competitive intel (no action — note for product positioning):** *"It seems Wyzant has added a new feature of being able to record their videos as well."* Wyzant's "Lesson recordings" page screenshotted: opt-in, 30-day retention, bills the recording as a feature. Confirms the recording-the-session category is no longer a moat *just on its existing*. Our wedge stays the **AI-notes-from-the-recording** + **tutor keeps 100% of rate** angle — Wyzant gives the recording, we give the writeup. Captured under "Product positioning."

**Monday readiness (process + shipped UX):** Deploy latest, then have Sarah: (1) **Hard refresh** the student page after deploy. (2) **Record tab:** confirm **Input:** shows a real device name; if “Unknown device” or junk transcription, fix **Windows sound default input** + Chrome site permission (Allow). (3) Speak **≥15 seconds** before Stop (short-clip confirm appears if under **8 seconds**). (4) **iPhone:** if “unexpected response” persists, use **Upload** with Voice Memos or **desktop Chrome** first — same account. (5) Grep Vercel for `rid=` + her **Ref:** if she reports an error. **Shipped helpers:** `maxDuration` on student page (plan-capped), upload **retry once**, transcribe **retry once** on “Brief database hiccup”, mic label line, short-clip confirm, idle copy about mic permission.

- ✅ **Shipped (B1, refactor/recorder-test-modular):** **Upload bypasses the Vercel serverless 4.5MB body limit via client-direct Vercel Blob.** Sarah's reproducible failure was a real ~30-min 17.9MB m4a — the old `uploadAudioAction` server action received the file as FormData, which Vercel's Hobby/Pro tier caps at 4.5MB per request body, and the resulting 413 surfaced as the generic "An unexpected response was received from the server." (the action threw before our code ever ran, so no `rid=` log existed). New flow uses `@vercel/blob/client.upload()` to send the file directly from the browser to Vercel Blob; the new `/api/upload/audio` route handler only generates the upload token and runs `assertOwnsStudent` in `onBeforeGenerateToken`. Both manual `AudioUploadInput` uploads and auto-rollover segments use the same client-direct path. `uploadAudioWithRetry` was reshaped to take `(uploader, studentId, blob, filename, mimeType)`. Old `uploadAudioAction` deleted. The original generic error string above can no longer be triggered by upload size; if it appears for a different reason (network drop, transcribe timeout, etc.), the `rid=` correlation logging on `transcribeAndGenerateAction` should now reach our handler.

- **Recording controls broken after closing tab and signing back in.** Pause / stop / save did not behave correctly on return session. Likely **stale `MediaStream` / `MediaRecorder` state** or mic permission edge case after navigation. **Triage:** fresh load vs restore; ensure full **cleanup on unmount** and reset UI when `getUserMedia` fails or stream ends; test **Sign out → Sign in** on iOS without only hard-closing tab.

- **Session timer stops when phone idles / screensaver.** Elapsed timer uses `setInterval` — **iOS throttles or suspends timers** when the screen locks or Safari is backgrounded, so displayed duration drifts from real time. **Mitigations (pick one or combine):** on `visibilitychange` / `pageshow`, **reconcile elapsed** with `Date.now() - startedAt` instead of relying only on tick count; show a **muted note** on iOS: “Timer may pause when the screen locks; recording still runs” if the platform cannot guarantee ticks; optional **Screen Wake Lock** (`navigator.wakeLock`) while recording **if** user gesture allows (Safari support varies) — research before promising.

### Recording — long sessions, Whisper limits, alerts (2026)

**Facts (so we don’t conflate limits):**

- **Whisper / OpenAI:** **25 MB per transcription request** (hard). ✅ **Shipped:** server-side **ffmpeg** time-split + bisect for oversized uploads (`src/lib/transcribe-ffmpeg.ts` + `src/lib/transcribe.ts`) so tutors are not blocked by a single huge file, subject to infra timeouts and available RAM/CPU on the serverless function.
- **90 minutes** (`HARD_CAP_SECONDS` in `AudioRecordInput.tsx`) is **client-only** — it is **not** a Whisper duration limit. It exists as a **safety / UX** guard: one continuous `MediaRecorder` blob, browser memory, and a clear “this session is long” boundary.
- **Still binding for “one take forever”:** **upload body size** (`next.config` server action limit, ~100 MB), **Vercel Blob** max (`BLOB_MAX_BYTES` 100 MB), **serverless timeout** on `transcribeAndGenerateAction`, and **browser stability** with very large blobs — so “record as long as she wants” in **one** uninterrupted capture is not guaranteed without **client-side segmentation**.

**✅ Shipped (recorder UI):** **Time alert sound** — checkbox + **volume** slider for the “approaching max length” chime (persisted per browser: `tn-recording-chime-enabled`, `tn-recording-chime-volume`). Muting disables **sound and vibration** for that alert.

**Backlog — best UX for multi-hour sessions:**

1. ✅ **Shipped (initial):** **Time-based auto-rollover** — ~**50 min** per `MediaRecorder` segment (`SEGMENT_MAX_SECONDS` in `src/lib/recording/segment-policy.ts`); **5 min** segment warning; soft **rollover chime** before auto split; **8h** session safety cap (`SESSION_SAFETY_MAX_SECONDS`). On rollover: upload segment → append to pending list with **`keepRecorderMounted`** (`AiAssistPanel` / `AudioInputTabs`) so the **mic stays hot** — no iOS-breaking timeslice. Files: `useAudioRecorder.ts` (hook), `AudioRecordInput.tsx` (shell), `AudioInputTabs.tsx`, `AiAssistPanel.tsx`. **Follow-ups:**
   - ✅ **Shipped (B5, refactor/recorder-test-modular):** **Gapless segment rollover.** `useAudioRecorder.rolloverSegmentGapless()` pre-warms the next `MediaRecorder` on the same `MediaStream` BEFORE calling `.stop()` on the old one — the new recorder is already capturing audio while the old one's container finalizes + uploads in the background. The OLD recorder's chunks are snapshotted to a local array and its `ondataavailable` handler is rebound so the final-flush blob doesn't pollute the new segment's buffer (covered by a dedicated regression test). User-visible state stays `"recording"` across the boundary — no "uploading…" interstitial for auto-rollovers. iOS-Safari "no timeslice" invariant preserved. Falls back to the legacy stop-restart path if `MediaRecorder` construction throws. Tests: `src/__tests__/dom/useAudioRecorder.dom.test.tsx` (4 new B5 cases — start-before-stop ordering, state-stays-recording, segment counter exactly +1, no late-flush pollution).
   - Optional **total session** clock alongside the per-segment timer (so tutors see "Part 2 · 0:42 · session 51:42").
   - Tune segment length vs real-world upload sizes once we have telemetry from a few long sessions.
   - ✅ **Shipped (refactor/recorder-test-modular branch):** Recorder test/refactor complete end-to-end. Phase 1 pure `lib/recording/*` modules with unit tests; Phase 2 `useAudioRecorder` hook + thin shell; Phase 3 jsdom hook tests with `FakeMediaRecorder`; Phase 4 component extraction (`MicControls`/`MainPanel`/`DoneCard`/`UploadingPanel`/`ErrorCard`/`AudioPreview`/`PendingSegmentList`) with their own dom tests + tab-switch regression; Phase 5 opt-in Playwright `audio-rollover.spec.ts` with stubbed MediaRecorder + `__SEGMENT_MAX_SECONDS_OVERRIDE`; B1 client-direct upload to Vercel Blob via `@vercel/blob/client` (resolves Sarah's 17.9MB fail); B3 always-mount tabs; B4 5-field terse AI prompt + `assessment` column + `nextSteps` → `Plan` rename; B5 gapless rollover. **246 unit tests** (12 hook tests in jsdom). Plan: `~/.cursor/plans/recorder_refactor_wrap_and_sarah_unblock_8301e036.plan.md`. Status detail in `docs/RECORDER-REFACTOR-STATUS.md`.
2. **Alert sound library:** Presets (gentle chime / single beep / silent + vibrate-only on mobile). **Vibrate-only** when sound is off (accessibility). Optional mirror in a future **Settings** page.
3. ~~**Revisit the hard 90m stop**~~ — Superseded by per-segment rollover + safety cap; only **tune segment length** if needed.

---

## Adversarial review + UX audit (post-Phase-5, 2026-04-19)

### Real bugs (do before pilot grows past Sarah)

- ✅ **Shipped (B3, refactor/recorder-test-modular):** **Switching tabs while recording no longer kills the recording.** `AudioInputTabs.tsx` now always-mounts the recorder when `blobEnabled` and hides the inactive panes via `style={{ display: ... }}` instead of unmounting. `useAudioRecorder` exposes `onRecordingActive`; `AudioInputTabs` wires that into a confirm prompt that fires when the tutor tries to leave the Record tab during a live recording ("You're recording — switch tabs anyway? Audio will keep recording in the background."). The existing `hasAudio` discard prompt still fires after a recording is finalized. Regression test in `src/__tests__/dom/keep-recorder-mounted.dom.test.tsx` (mount/unmount spies on stubbed `AudioRecordInput` + `AudioUploadInput`) plus `AudioInputTabs.dom.test.tsx` for the confirm-prompt branches.
- **Admin audio proxy broken for env-only admins.** `src/app/api/audio/admin/[recordingId]/route.ts` falls back to `student: { adminUserId: null }` for `scope.kind === "env"`, but `SessionRecording.adminUserId` is non-nullable so the recording itself wouldn't have null `adminUserId`. Latent bug — Sarah is DB-mode so it's never been hit. Decide: env-mode either needs `adminUserId: null` filter (if such recordings exist) or env-mode is documented as not supporting the admin audio proxy.
- **No way to attach a recording to an existing saved note.** Workflow dead-end: tutor saves the note, then realizes they meant to attach the audio. They have to delete and re-create. `NoteCardActions` edit form should support recording attach.

### Slow-burn data integrity (do before scaling beyond ~5 tutors)

- **`NoteView` rows orphan on share-link revoke.** When a tutor regenerates a link, old `NoteView` rows (keyed by old `shareToken`) stay forever. Cheap per-row, unbounded over years. Fix: either cascade-delete on revoke or run periodic sweep.
- **Bootstrap-seed in `s/[token]/page.tsx` re-runs on any zero-state.** If `NoteView` rows get deleted (cascade from a deleted note + every other note also somehow gone, or manual cleanup), the next visit re-bootstraps and marks everything "seen" again — meaning real new notes added after that visit will incorrectly show as already-seen. Edge case. Fix: track bootstrap-done with a sentinel row, OR only bootstrap notes whose `createdAt` predates the share link's `createdAt`.
- **`SessionRecording.onDelete: SetNull` from `SessionNote`.** Deleting a note leaves both the recording row AND the blob orphaned. Compounds with the existing "orphaned blob sweep" backlog item. Decide: cascade-delete recording when note is deleted (and trigger blob delete in same path), or leave SetNull and rely on the future sweep.
- **Recording recovery / soft-delete window.** Right now recordings can vanish *immediately* through three different paths and there is no undo: (1) per-segment / late-guard hallucination cleanup hard-deletes blob + DB row inside `transcribeAndGenerateAction`; (2) hitting "×" on a pending segment in `AiAssistPanel.handleRemoveSegment` drops it from local state and leaves the blob orphaned with no row to recover; (3) deleting a note `SetNull`s the recording row (above) so the audio is unreachable from the UI. Build a soft-delete: add `deletedAt: DateTime?` (and probably `deletedReason`) on `SessionRecording`, switch every "delete" path to set the marker instead of hard-removing the blob, hide soft-deleted rows from the normal UI, and run a background sweep that hard-deletes blob + row after a TTL (suggest **14 days**, configurable via env). Then add a "Recently removed recordings" admin view (per student or global) where the tutor can restore within the window. Resolves the per-segment-hallucination "I clicked the wrong button" panic, the X-button silent loss, and the note-delete cascade gap in one structural fix. Coordinate with the existing "orphaned blob sweep" item — same cron can drive both. Multi-tenant: scope the recovery view + the sweep query by `adminUserId` (per `docs/learning-multi-tenant.md`).

### Scaling/abuse (do before public launch)

- **`/api/share/mark-seen` has no rate limiting.** Anyone with a valid share token can hammer the endpoint (each call: 2 DB reads + 1 upsert). Fine for one pilot user; needs per-token limit before public.
- **Notes search uses `ILIKE %q%` (full table scan).** Won't index on a leading wildcard without `pg_trgm`. Fine at hundreds of notes per tutor, breaks at tens of thousands.
- **`SeenTracker` fires N requests for N visible note cards.** Cheap, idempotent, but easy to batch. Defer until it actually matters.
- **No CSRF on `/api/share/mark-seen`.** Only "harm" is marking already-shareable notes as seen. Not urgent.
- **Recording IDs in audio URLs.** End up in browser history / referer logs. Acceptable for tutoring-notes confidentiality bar; flag if we ever handle anything more sensitive.

### Time-storage tech debt

- **`startTime`/`endTime` are "UTC pretending to be wall-clock."** We construct `T${HH}:${MM}:00.000Z` to store and `getUTCHours()` to read. Works only if we never display in another timezone, never compare across zones, never sort across days. Day we want true cross-timezone display (e.g. tutor in TX, parent in CA wanting "their local time"), we'll need `TIMESTAMPTZ` + an explicit `event_timezone`. Not urgent for solo-tutor pilot.
- **Auto-fill timezone offset captured at form mount.** If the tutor crosses a DST boundary while the form is open, times shift by an hour. Theoretical; flag if anyone reports it.
- **Session-window vs recording-window times.** When the tutor leaves the time fields blank we currently auto-fill `startTime` = first recording's `createdAt − duration`, `endTime` = last recording's `createdAt`. So the saved span is the **recording** window, not the **session** window. Fine for "the recording IS the session" usage (Sarah's mental model), and the tutor can always type explicit times to override. Becomes important when sessions are billable blocks (30-min increments etc): we'll want a real wall-clock session start captured at the moment the tutor opens the recorder (or starts a "Session" timer), with the recording window as a sub-fact of the session. Likely paired with the billable-blocks pricing work in the "Pricing" section.

### UX gaps — tutor side

- **No raw-transcript preview before AI generates the note.** If transcription is wrong, tutor saves and then has to edit each field. Add a collapsible "see raw transcript" section in the AI panel.
- **Template dropdown is essentially decorative.** "Math session / Reading session / Test prep" options exist on the form, are passed to the LLM as `Subject/template: ...`, and persist on the note for filtering — but (1) they're **never auto-detected** from audio/transcript content, (2) `populate()` doesn't set the dropdown when the AI fills the form (defaults to "None" until the tutor picks manually), and (3) the prompt doesn't really *use* the template — it just sees a one-line context tag at the top, no template-specific extraction rules, no field changes. Two real fixes: (a) infer the template from the transcript (cheap classifier or keyword heuristics — "we worked on chapter 4 of *Hatchet*" → Reading; "factoring quadratics" → Math), and (b) make the prompt actually template-aware (e.g. Test prep wants a "what's still weak" field, Reading wants a comprehension-question list). Until both ship, consider hiding the dropdown to avoid the "I picked one and it didn't seem to do anything" feeling.
- **Notes history page lacks date-range filter.** Search by content only. Real workflow: "show me September 2026" is a date filter, not a keyword search.
- **Editing a note inline expands the row and shifts the page.** Modal would be steadier than inline expansion, especially on the history page where it can shove other notes way down.
- **Sending an email gives no confirmation of what was sent.** Currently silent. Show a toast like "Email sent to parent@example.com — link includes 5 notes." (Replaces older "X notes flipped to SENT" framing — see status-model rethink below; status mutations on send are likely going away.)

### UX gaps — parent side

- **"NEW since your last visit" doesn't say WHEN the last visit was.** "3 new since you visited Apr 12" lands better than just "new since last visit."
- **No way for a parent to acknowledge / reply.** They can read homework but can't tell the tutor "got it" or ask a question without going off-channel to email. Backlog: in-app ack button or short reply.
- **No print stylesheet.** Some parents print to keep a paper trail; the dark-mode UI prints poorly. Wait until someone asks.
- **Mobile responsiveness of the redesigned share page hasn't been re-verified.** The dividers with mid-text labels ("New since your last visit") might compress oddly on narrow screens. Manual check needed before sending the latest link to anyone new.

### Cross-cutting

- **Terminology inconsistency:** "session note" / "note" / "session" used interchangeably across UI strings. Worth a small pass for a consistent voice.
- **No analytics for tutors about parent engagement** beyond the "seen" boolean — no audio play counts, time on page, or link clicks. Shows whether share-page features actually land.
- **No onboarding for new tutors.** Fine for Sarah (you'll walk her through). Bad for the 50th. Defer until 2nd or 3rd tutor signs up; then it becomes urgent.

### What I checked and was happy with (no action needed)

- `mark-seen` validates token AND note ownership before upserting.
- Share-token audio proxy validates link not revoked, recording belongs to student, `shareRecordingInEmail` is true.
- Multi-tenant scoping (`assertOwnsStudent`, `canAccessStudentRow`) consistent across admin endpoints.
- Migrations guarded with `IF NOT EXISTS` / `pg_constraint` lookup pattern.
- Bootstrap fix uses `skipDuplicates`, so it's idempotent within the request.
- `NoteView_shareToken_noteId_key` unique index prevents double-counting.

---

## Status-model rethink + auto-email (paired changes, post-Phase-5)

These two are written up together because they're the same idea from two angles: the DRAFT/READY/SENT status field was a 2010s "did I push this out via email?" model used as a proxy for the thing tutors actually care about — *"does the parent know about this?"* Phase 5's `NoteView` table now answers that question directly. Once the proxy is gone, email becomes a notification mechanism (not a state mutation), and notification mechanisms can be scheduled.

### Status-model rethink — collapse DRAFT/READY/SENT

**Today (cruft):**
- `status` field with three values: DRAFT, READY, SENT.
- Tutor can manually flip DRAFT ↔ READY via "Mark ready" / "Mark draft" buttons in `NoteCardActions`.
- `sendUpdateEmail` flips both DRAFT and READY to SENT.
- **The share page (`s/[token]/page.tsx`) does not filter by status** — parents see DRAFT notes the moment they're saved. So the status field is essentially decorative from the parent's perspective.

**Proposed model:**
- Drop the `status` field entirely (or keep as a minimal `hidden: boolean` if the "I'm mid-writing this, don't show it yet" use case is real — TBD; see decision below).
- Add a per-note "👁 Seen by parent" / "Not yet seen" computed badge in the tutor UI, derived from `NoteView` (no schema change).
- Email becomes an action the tutor takes at the student level. It does **not** mutate any note state. Sending an email = sending an email; that's it.

**Decision needed before implementing:**
Is "started writing mid-session, not ready for parent eyes yet" a real workflow, or do tutors just save when the note is coherent? If real → keep a `hidden: boolean` flag and filter it out of the share page. If not real → drop entirely. **Bias: ask Sarah before implementing.** Don't preserve a state field on speculation.

**Migration concerns:**
- Existing notes with `status: SENT` carry useful "I emailed about this" history. Don't blow it away — either preserve as `firstEmailedAt: DateTime?` on the note, OR rely on `EmailMessage` table joins (which already exists). Probably the latter.
- Tests in `__tests__/note-and-share.test.ts` check `status === "READY"`; will need updating.

**Scope:** ~1–2 hour rework once the decision is made. Schema migration + drop UI buttons + add seen-badge component + update `sendUpdateEmail` to stop mutating notes + update tests. **Sonnet-tier.** Worth doing *before* auto-email scheduling so the new code isn't building on a model that's about to be replaced.

---

### Auto-email scheduling (depends on status-model rethink)

**Why now:** Once email is decoupled from note state, sending becomes a pure side effect that can be triggered by a schedule rather than a button. Combined with `NoteView` for engagement signal, the tutor can stop babysitting "did I remember to email the parent?" entirely.

**Triggers (per student, with a tutor-level default):**
- **Off / manual** — today's behavior; power-user override.
- **Per note save** — fires after the edit grace window (see below).
- **Daily digest** — end-of-day if any new notes since last email.
- **Weekly digest** — same, weekly cadence; tutor picks the day.
- **After every Nth session** — niche, skip v1.

**Conditions (all triggers respect):**
- **Only if new notes since last email.** No empty digests, ever.
- **Edit grace window** — wait N minutes after a save before firing (default 15 min) so tutor edits don't trigger N separate emails. Implementation: every save bumps a `notifyAfter` timestamp on the note; cron only sends notes whose `notifyAfter < now`. No queue needed.
- **Skip if `hidden` flag set** (if we keep that flag from the status-model decision).
- **Optional quiet hours** — "don't email between 9 PM and 8 AM in the parent's timezone." Nice-to-have.

**Settings scope:**
- Tutor-level default in `Settings → Email` ("New students inherit weekly Sunday digest").
- Per-student override on the student page ("This parent prefers per-session.")
- Per-recipient (if a student has multiple parent emails, settings apply to all unless we add per-recipient overrides — probably skip v1).

**Sensible defaults to ship with:**
- **New students: weekly digest, Sunday morning, only if new notes.** Low-noise, predictable, mirrors how schools / activities communicate.
- Tutors can flip a single student to per-session if a parent wants it.
- Manual "Send update email" button stays — useful for ad-hoc pushes.

**Real implementation gotchas:**

1. **Scheduler.** Vercel Cron is the obvious fit (free tier supports daily jobs). One daily cron at e.g. 7 AM UTC queries "who needs emailing today, given their schedule + last-sent + new-note count?"
2. **Idempotency.** Cron retries / double-runs CANNOT spam parents. Track `lastEmailSentAt` per (studentId, recipientEmail) AND record which note IDs were included in each `EmailMessage` row. Refuse to re-include note IDs already sent to that recipient.
3. **Unsubscribe link** — must be one-click per CAN-SPAM. Token-based, scoped to (studentId, recipientEmail). Tutor sees "this parent unsubscribed from auto-emails" badge; manual sends still work but show a confirmation.
4. **Cost ceiling.** Auto-emails can blow up email-send costs and hurt deliverability (high bounce rate → spam folder for everyone). Connects to existing **Usage tracking prerequisite** backlog item — track sends per period per tutor; soft-cap warning at e.g. 50 auto-emails/month per tutor.
5. **Test mode** — "show me what tomorrow's digest would look like" preview, both for tutor confidence and for our QA. Renders the email without sending.
6. **Failure handling** — if cron-send fails 3 times for a recipient, alert the tutor (in-app banner + outbox row), pause auto-sends for that recipient, never the parent. Common cause: parent email bounced (changed jobs, mailbox full).
7. **Timezone.** Tutor sets schedule in their timezone; parent receives at their timezone-equivalent moment. If we don't know parent timezone (we don't), default to tutor's. Probably fine; revisit if anyone complains.
8. **Multi-tenant data isolation** — `cron job → for each tutor → for each student → check schedule`. The "for each tutor" loop must be the outermost; never write a query that touches other tutors' data. Test required (see `audio-isolation.test.ts` pattern).

**Schema changes needed:**
- `Student.emailSchedule: { kind: "off" | "per_note" | "daily" | "weekly", weekday?: 0-6, quietHoursStart?: "HH:MM", quietHoursEnd?: "HH:MM" }` (JSON column, or split into named fields).
- `Student.emailRecipients: String[]` (array of emails, currently we have `parentEmail` as a single string — already a backlog item to support multiple).
- `EmailMessage.includedNoteIds: String[]` (which notes were in this email — drives idempotency and "what was in the digest you sent" UI).
- `SessionNote.notifyAfter: DateTime?` (computed at save: `createdAt + editGraceMinutes`).
- `EmailUnsubscribe { studentId, recipientEmail, token, createdAt }` (track unsubscribes).
- `AdminUser.defaultEmailSchedule` — same shape as `Student.emailSchedule`, applied to new students.

**Estimate:** **Days, not nights** — ~2–3 focused sessions of work, plus a real chunk of testing because the failure modes (spamming a parent, missing a digest, unsubscribe not honored) are the kind that destroy trust if they slip through. **Opus-tier for the design pass** (multi-tenant scheduler with idempotency and legal/CAN-SPAM constraints), **Sonnet-tier for the build** once the design is locked.

**Why this isn't tonight-shippable:** scheduler infra + unsubscribe + per-student settings UI + idempotency model + tests is a proper feature, not a tweak. Half-shipping it (e.g. "auto-send works but unsubscribe doesn't" or "no idempotency, occasionally double-emails") would be worse than not shipping it at all — once a parent is annoyed by duplicate or unwanted emails, you don't get that goodwill back.

**Dependencies before this is worth starting:**
- Status-model rethink done (so email isn't mutating note state when it shouldn't).
- `Usage tracking prerequisite` ledger live (so we can rate-limit auto-emails and surface usage in-app).
- Decide on `parentEmail: string` → `emailRecipients: string[]` migration (so digests can address multiple guardians).

---

## Pilot feedback — action items

- **🔴 Recording auto-pause on student disconnect (Sarah, Apr 24).** Tutor-side audio recorder currently runs regardless of student presence. Sarah explicitly asked: when the student drops connection, the recording should **pause automatically** AND a banner should surface ("Student disconnected (network drop / closed tab) — recording paused"). When the student reconnects, recorder auto-resumes (or stays paused with a "Resume" button — decide via UX feedback, default to *auto-resume* so tutor doesn't have to manually click for transient drops). Implementation builds directly on what was just shipped: `bothPresent` (workspace client) is the same signal the timer pauses on; thread it into `useWhiteboardRecorder` (or the `useAudioRecorder` it composes) so the same boolean drives `recorder.pause()` / `recorder.resume()` (B5 gapless rollover already proves we can stop/start `MediaRecorder` cleanly without losing in-flight data). Banner appears in workspace client + a one-line entry in the event log (so the replay UI can show "[paused 14:32 — student disconnected — resumed 14:35]"). **Acceptance:** (i) wife-on-phone test — close tab on phone, recorder pauses within 1s + banner shows; (ii) reopen link, recorder resumes + banner clears; (iii) recording playback shows no audio for the disconnected window (not a silence of equal length, an actual gap-marker); (iv) regression test: dom test asserts `recorder.pause` called when `bothPresent` flips true→false. **Scope:** ~1–2 hr. Sonnet-tier. Highest-leverage Sarah ask currently open.
- **Per-student recording default preference (Sarah, Apr 24).** ✅ **Shipped.** Added `Student.recordingDefaultEnabled Boolean @default(true)` (additive + idempotent migration `20260424130000_student_recording_default`), a `setStudentRecordingDefault` server action gated by `assertOwnsStudent`, and a `<StudentRecordingDefaultToggle />` switch on the student detail page (optimistic UI with revert + inline error on failure). The workspace `page.tsx` now reads `recordingDefaultEnabled` and threads it as `initialUserWantsRecording` into `WhiteboardWorkspaceClient`, biasing the Start toggle's initial state per student. The tutor can still flip mid-session — flipping the per-student default does NOT affect a session in progress (only the next mount). 10 new tests pin: action contract (multi-tenant gate ordering, no truthy coercion, revalidate path) + UI (initial checked state, click → action, optimistic-revert on failure, role=alert). All 147 whiteboard suite tests still pass; typecheck clean. **Coordinate with consent flow (B2) — if consent says "no recording," this should hard-disable, not just default-off.
- **Whiteboard undo (mark removal) — touch + visible button (Sarah, Apr 24).** ✅ **Tutor side shipped** — added explicit chunky "↶ Undo" / "↷ Redo" buttons to the whiteboard toolbar, routed via synthetic Ctrl/Cmd-Z keydown dispatched on the `.excalidraw` container (Excalidraw 0.18 only exposes `history.clear()` publicly — confirmed against `@excalidraw/excalidraw@0.18.1` types — so the keyboard-event path is the only stable cross-version surface). Both `ctrlKey` and `metaKey` are set so the same dispatch matches Win/Linux and macOS. 5 jsdom tests pin: (i) container selector match (`.excalidraw` AND `.excalidraw-container`), (ii) modifier set, (iii) Redo adds shiftKey, (iv) graceful no-op when the canvas hasn't hydrated. **Still open:** student-side equivalent — the student page (`/w/[joinToken]`) currently just shows a "joining…" placeholder, no Excalidraw mount. When the live student canvas lands (`<WhiteboardLiveCanvas />`), reuse `<UndoRedoButtons />` + `triggerUndo/triggerRedo` directly — they're DOM-only and don't depend on the workspace component. **Cross-side scope:** ~10 min once the student canvas exists.
- **Session time logging.** ✅ **Shipped** — optional `startTime` / `endTime` on `SessionNote`, auto-fill from recording timestamps when blank, tutor-editable in new-note and edit flows; shown on admin history and share pages. **Follow-up (not blocking):** true timezone-aware storage if cross-zone display matters — see adversarial section "Time-storage tech debt."
- **Recordings longer than 90 min.** Some tutors run longer than the **client** 90 min cap (`HARD_CAP_SECONDS`). **Whisper** is limited by **25 MB per API request** (server **ffmpeg** split shipped). Remaining gap is **continuous capture**: single blob + upload limits. **Backlog:** seamless **auto-rollover** segments (stop + start new `MediaRecorder` without iOS-breaking timeslice) — see **“Recording — long sessions, Whisper limits, alerts (2026)”** above.
- **Tutor playback of saved recording.** ✅ **Shipped** — preview before transcribe in the AI panel (local object URL); playback on admin notes history (`/admin/students/[id]/notes`) via `GET /api/audio/admin/[recordingId]` (session auth). **Known limitation:** env-only (legacy) admin scope may not work for that route — see adversarial review "Admin audio proxy broken for env-only admins."
- **AI link extraction from spoken/typed URLs.** Currently the AI lifts brand mentions verbatim — e.g. "go to google for more info" becomes a "Google" entry in the Links field, not a real URL. Desired behavior: when an actual URL or domain is spoken/typed (`www.google.com`, `khanacademy.org/algebra`), normalize to `https://...` and put it in Links. When only a brand name is mentioned with no domain, leave it out of Links (don't guess). Implementation: tighten the system prompt in `generateNoteFromTextAction` and add a regex post-pass to validate/normalize what the model returns. Add a unit test covering: (a) spoken URL → captured, (b) brand-only → not captured, (c) bare domain → `https://` prepended.
- **AI note generation — context hygiene & regression tests.** Prior production issues: stale UI text feeding the prompt, model asserting facts not present in session text, bleeding content from prior sessions. Backlog: tests and/or prompt-contract checks around `generateSessionNote` / `generateNoteFromTextAction` (e.g. placeholder-only input, no duplicate client state in prompt, optional snapshot of prompt shape). Complements "AI link extraction" above.
- **Audio playback can't be scrubbed / seeked AND duration shows 0:00 up front — same root cause.** Reported by the PO during smoke 5 review (scrub) and again in smoke 6 (the saved-note player on the right shows `0:00 /` with no total duration even though the card label says "Recording 327s"). Root cause: `MediaRecorder` outputs WebM (Chrome) and fragmented MP4 (Safari) blobs that don't include a duration header or seek index — the browser can play them linearly but `<audio>.duration` is `Infinity` and `<audio>.seekable` ranges are empty, so any user click on the scrubber resets to currentTime AND the right-side timer never populates without scanning the whole file. Affects (a) the local-blob `<AudioPreview>` shown right after recording in `PendingSegmentList.tsx`, AND (b) saved-recording playback through `/api/audio/[recordingId]` (and the admin equivalent), since the server just streams the raw bytes back. **Stopgap (15 min, no library):** `<audio preload="metadata">` + show `formatDuration(durationSeconds)` as a label outside the player using the value already stored in `SessionRecording.durationSeconds` so the user at least sees "5:27" — does NOT fix scrub. **Two-layer real fix:** (1) **client-side blob patch** before assigning to `<audio>.src` — for WebM use `ts-ebml` (or `webm-duration-fix`, ~5KB) to inject duration + seek-cues into the EBML header in-memory; for MP4 use `mp4box.js` to move the `moov` atom to the start (faststart) so seek tables are reachable. **Apply at upload time** (run the patch on the Blob in the browser before `uploadAudioDirect()` in `src/lib/recording/upload.ts`) so every newly-uploaded file is good forever and downstream consumers don't need a shim. (2) **server-side fallback**: ffmpeg post-process on upload (we already invoke ffmpeg in `transcribe-ffmpeg.ts` for split-on-overflow) — `-c copy -movflags +faststart` for MP4 and a one-shot `ffmpeg -i in.webm -c copy out.webm` rewrite for WebM both inject the missing seek metadata without re-encoding. Useful as a backstop for any client that fails the patch (e.g. iOS Safari edge cases) and to retro-fix existing rows. **Acceptance:** (i) saved-recording player shows real total duration immediately on page load without downloading the whole file; (ii) clicking anywhere on the scrubber jumps playback to that point; (iii) `<audio>.duration` is finite and `<audio>.seekable.end(0) === durationSeconds` (within 0.5s). **Tests:** unit test on the patcher (round-trip: synthesize a small WebM blob without seek info → patch → assert `seekable.length > 0` and finite `duration`); jsdom can't fully exercise `<audio>` seek behavior, so add a Playwright smoke that records a fixed 5s blob, uploads, plays back, and asserts `audio.duration` ≈ 5 and `audio.currentTime` jumps when the scrubber is clicked.
- **Whisper repetition-loop hallucination on quiet/silent audio (trailing AND mid-stream).** Confirmed during smoke 5 of the recorder refactor by dumping a real 5:27 m4a transcript: Whisper transcribed substantive speech correctly, then the last several seconds (where the tutor likely set the phone down or trailed off) collapsed into a long repetition loop of a single short token. Existing `looksLikeSilenceHallucination` guard only catches *wholly* hallucinated transcripts; *partial* loops at the tail (or mid-stream during a pause) pass through and poison the structuring prompt + waste tokens. **Causes Whisper exhibits this for:** (1) audio truly silent or near-silent at the boundary, (2) background room/fan/traffic noise without speech, (3) gain too low so the speech signal lives below Whisper's noise floor, (4) encoding tail artifact when the container's last fragment is partial. **Wider-than-tail risk:** if a tutor sets the phone on the table during ambient capture (the v7 north star) and the student's voice is consistently weak, we'll get sprinkled loop-junk *throughout* the transcript, not just at the end — silently corrupting Topics/Homework/Assessment/Plan extraction without any visible warning. **Backlog (in priority order):** (a) post-Whisper, detect and trim repetition loops anywhere in the transcript (heuristic: same 1–3 word pattern repeating ≥5 times consecutively); (b) surface `transcriptChars` and `loopCharsTrimmed` to dev logs so a 4200-char transcript with 1200 trimmed is debuggable; (c) when trimmed-fraction exceeds e.g. 25%, surface a yellow warning to the tutor ("Audio quality may have been low — review carefully"); (d) consider Whisper's `temperature_increment_on_fallback` / `compression_ratio_threshold` / `no_speech_threshold` parameters to reduce loop emission in the first place; (e) doc note: the in-browser **Browser boost** slider only affects in-tab `MediaRecorder` capture, NOT Sound-Recorder/Voice-Memos uploads — for upload paths, OS-level mic level is the only knob, and we should call that out in copy near the Upload tab. **Tests:** fixture transcript ending in a loop → trim leaves only real content; fixture with mid-stream loop → trimmed; fixture with legitimate emphatic repetition (e.g. `"yes yes yes that's it"`) → preserved (trimmer must not false-positive on short content-bearing repeats).
- **Audio playback during note review (post-transcribe, pre-save).** Real PO finding from smoke 5 of the recorder refactor: tutor finishes recording, AI fills the form, tutor wants to **verify a specific field by listening back** ("did I really say homework was X?"), but the audio preview disappears. Cause: `AiAssistPanel.tsx` only renders `<PendingSegmentList>` (which contains `<AudioPreview>` per segment) inside the `panelState !== "filled"` branch. Once the AI succeeds, the success card + "Start over" replace the whole input area; clicking "Start over" then *clears* `pendingAudios` so the local Object URLs are gone too. The recording is still safe on Vercel Blob and is replayable later from `/admin/students/[id]/notes`, but that's the wrong moment — verification happens during the form review window. **Minimal fix:** in the `panelState === "filled"` branch of `AiAssistPanel.tsx`, render a compact "Recorded audio" subsection with `<AudioPreview>` for each `pendingAudios[i].previewUrl` (state is already holding them, no fetch needed). **Better fix:** also surface the players inside `NewNoteForm.tsx` after fill, since that's where the tutor's eyes actually are. **Acceptance:** after Transcribe & generate, tutor can hit play on each segment without leaving the page or losing form state. **Regression test:** dom test on `AiAssistPanel` asserting `data-testid="audio-preview"` exists in both pre- and post-fill states when `pendingAudios.length > 0`.
- **Recorder gap detection / per-segment timestamps in pending list.** Same smoke 5 turned up a *real* audio gap (PO heard it on playback), separate from the auto-rollover B5 boundary which we believe is gapless. We currently have no way to tell from the UI whether a gap exists in a single continuous segment or only at rollover boundaries. **Backlog:** record `MediaRecorder.ondataavailable` chunk timestamps (`performance.now()`) and surface anomalous gaps (>500ms between expected ticks) as a per-segment warning in `<PendingSegmentList>`. Also helpful: show wall-clock duration of each segment (already have it server-side as `durationSeconds` after upload; surface client-side from the local `Blob.size` + `MediaRecorder` start time for the pre-transcribe view). **Acceptance:** if a recording has a >500ms gap, the segment row shows a warning chip; tutor knows to re-record that part instead of being surprised after the AI processes incomplete audio.
- **AI prompt v7 — ambient session capture (set-it-and-forget-it).** **Core value prop:** tutor sets the phone on the table, tutors normally, never addresses the recorder, gets back useful Topics / Homework / Assessment / Plan / Links. Current v6 prompt (`src/lib/ai.ts`) is framed as *"Tutor's notes from today's session"* and enforces *"only EXPLICITLY stated"* — both fight ambient capture: real session transcripts have no speaker labels, the tutor never narrates assessment out loud ("Anya is comfortable with factoring"), and homework is phrased casually ("try problems 5–10 tonight"). **v7 changes:** (a) reframe input as *"Whisper transcript of a tutoring session — one tutor, one student, no speaker labels, conversational"*; (b) loosen rule #1 to *"only include things grounded in the transcript — explicit statements OR clearly inferable from how the session went"* (correct/incorrect answers → assessment signal; tutor saying "try X tonight" → homework); (c) add hint about inferring speaker by context (adult vocabulary / teaching cadence vs. student questions); (d) keep terse style + empty-string-when-absent rules from v6. Bump `PROMPT_VERSION` to `v7`. **Tests:** add fixture transcripts (math session, reading session, mixed-age student) under `src/__tests__/fixtures/ambient-transcripts/` + assert all five fields populate from a transcript that **never** mentions the field names. **Manual smoke:** Sarah records a real ambient session (no narration), verifies the four content fields are usable without her editing. **This is the killer-feature bar — if v7 doesn't clear it, v8 should iterate before we widen the pilot.**

---

## Product positioning (set night 1 of pilot)

**Tools for independent tutors who source their own clients.** Subscription-based. **Not a marketplace.** Tutor keeps 100% of their hourly rate; we provide the tooling that makes the work easier and more valuable to parents/students.

**Direct comp:** **Wyzant** — has the interactive whiteboard, takes **25% of tutor pay**, **does not take notes for the tutor** (tutor writes manually at end of session, platform sends to parent). Sarah currently uses Wyzant occasionally and explicitly asked for a platform that *"doesn't have to connect me to clients, just have a platform that I could use to make my work easier."* That's our wedge.

**Wyzant feature movement (Sarah, Apr 24, 2026):** Wyzant has rolled out **lesson recordings** as an opt-in feature — recordings stored ~30 days on the tutor's Wyzant account for "free" review. Significance: **the recording-by-itself is no longer a moat**. Our differentiator stays: (a) *AI notes generated from the recording* (Wyzant gives the file, we give the writeup), (b) *tutor keeps 100% of rate* (Wyzant takes 25%), (c) *recordings + notes flow into a parent share-page that's branded for the tutor's practice, not the platform*. Update marketing copy accordingly when public — don't lead with "we have recording" since they do too; lead with "the notes write themselves and the parent gets a share link, all without giving up 25% of your rate." Worth a paragraph in `docs/research-deploy-and-niche-2025.md` or the GTM doc next sweep.

**Pitch shape:** *"Keep 100% of your rate. Get better tools than Wyzant gives you, for ~$20/month."*

**Initial target persona:** Independent tutor, primarily math/STEM, high school + college students (sometimes middle school, rare elementary). Sources own clients. Currently writes notes by hand or skips them.

---

## Pending pilot input (waiting on)

- **Sarah's first real session (tomorrow morning).** Outcomes to watch: signup flow friction, whether AI notes (if shipped tonight) actually saves her the writeup, what she calls out unprompted.

## Pilot input received

- **Sarah's "would-pay" wishlist (~10:03 PM):** versatile online + in-person; interactive whiteboard with video + screen/document share; AI-summarize conversation+whiteboard into notes; in-person tablet whiteboard with audio capture + AI notes. Quote: *"I would pay for"* AI taking the conversation and turning it into notes + suggestions for next session.
- **Sarah's disambiguators (~10:29 PM):**
  1. **Devices online:** *Tutor* uses computer + two monitors. *Students* use Chromebook or laptop, single screen. → **Web-first, browser-based.** iPad is in-person only.
  2. **Recording:** Yes with consent; would help her students to send the recording for review. **Killer-feature description (verbatim):** *"open a whiteboard under the students name and it would ask whether I want to record this whiteboard session. I would want it to record writing strokes as a video and record the audio that goes along with it, plus a pause button in case we end up talking about off topic things."* Her own words: **"That is a feature I have not seen."** Treat this as a **competitive moat** signal from a practitioner.
  3. **Subjects/ages:** Primarily **math**, high school most common, college second, occasional middle school, rare elementary. Has tutored chemistry, soon physics. Has helped people write papers. → Whiteboard MVP can target **math/STEM for older students** without worrying about kid UX.
- **Currently uses paper for notes** (in-person). Sometimes phone, but *"too small to do all the work on there"*. Tablet preferred when she has it. **Phone should be a usable fallback** when she forgets her tablet — *"I would still like it as an option"*. → UI must not break on small screens even if it's not optimized for them.
- **In-person student** brings own iPad with Apple Pencil; they pass iPads back and forth, write directly on each other's screens, **mark up homework digitally** ("write directly on her homework in a digital format that has worked pretty well"). → PDF/image annotation isn't just an abstract future feature; it's a workflow she already does today and values.
- **Existing notes form structure is validated.** Sarah: *"I usually give over all the things on the notes form you have, I just hate taking the time to write them up."* → She's not asking for a different schema; she's asking for AI to **fill the existing form**. This is meaningful — don't redesign the form, just add the AI fill.
- **Existing "send notes via email" feature is liked.** Sarah: *"I think the ability for the program to put the notes info in an email is cool. I like that idea."* → Don't deprecate or hide it; it's actually one of the touchpoints that landed.
- **Recording is dual-purpose** — not just for AI notes generation, but **for student review**. Sarah: *"it could be helpful to send to them if [they] want to review it."* → The share-link infrastructure should extend to recordings; this affects the value prop for both tutor and student.
- **Sarah is self-aware about scope.** Closed her wishlist with *"I know my suggestion is kind of a complicated one. But it would be cool."* → She's not entitled; she'll be happy with iterative wins. Reinforces "ship in slices, communicate honestly about scope."
- **Tomorrow's pilot smoke test (her plan):** *"I'll probably test the google oauth tomorrow."* → If Google OAuth fails for her tomorrow morning, that's the first thing to fix. Make sure her email is allowlisted (it is) and the connect flow works end-to-end.
- **Curiosity / relationship signal:** Sarah remarked she was *"surprised you picked this type of app as your project."* → She's invested enough to wonder *why*; treat her as **co-designer**, not just tester. Worth scheduling a "watch her use it" call within the first 1–2 weeks to capture friction she won't bother to message about.

---

## Tonight-shippable (high confidence, single focused session)

- **AI notes from pasted text** — server action that takes typed/pasted session content + student context, calls LLM with structured-output prompt, fills the note form fields (topics, homework, next steps). User reviews before saving. Directly hits Sarah's #1 paid pain.
  - Provider decision: OpenAI `gpt-4o-mini` is the leaning default (cheap, JSON mode, same provider as Whisper for later).
  - Dedicated app-specific API key in Vercel env (not a reused dev key).
  - Provider-side spend cap on the key from day one.
  - Per-request token cap in code.
  - Mocked LLM call in tests so CI doesn't burn tokens.

## Days, not nights (next 1–2 weeks)

- **Audio upload → Whisper transcript → AI notes.** Skips live capture; tutor records on phone after session, uploads, gets notes. Cheaper & simpler than live capture; ships value while live recording is built.
- **PDF/image attachment on a note** (just display/storage; no annotation yet).
- **In-app onboarding polish** (signup → first student → first note flow audit; signup gap was the first thing Sarah noticed unprompted).
- **Operator dashboard scaffolding** (`/operator/*`, separate from `/admin/*`): users list, status, manual comp flag. Required before payments are useful.

## Weeks, real engineering — this is where the moat lives

- **🚧 Phase 1 in progress (match Wyzant for Sarah + AI wedge)** — See `docs/WHITEBOARD-STATUS.md` for item-by-item status. Core loop delivered:
  - Excalidraw canvas (real-time student ↔ tutor sync via `excalidraw-room` on Fly.io; E2E AES-GCM-256 encrypted relay).
  - Whiteboard session recording: stroke event log (canonical diff format, `event-log.ts`) + audio (existing `useWhiteboardRecorder` composing `useAudioRecorder`). Crash recovery via IndexedDB (`checkpoint-store.ts`) + Vercel Blob periodic checkpoints.
  - PDF/image upload to canvas, MathLive WYSIWYG LaTeX → MathJax SVG, Desmos iframe embed.
  - Shared `<WhiteboardReplay>` player (audio-synced scene reconstruction, schema-version dispatch, per-client color attribution, asset prefetch).
  - Review page (`/admin/students/[id]/whiteboard/[sessionId]`) + share-token replay (`/s/[token]/whiteboard/[sessionId]`).
  - **AI wedge (THE moat feature):** `generateNotesFromWhiteboardSessionAction` — transcribes whiteboard audio via existing Whisper pipeline → `generateSessionNote` → creates draft note linked to the session. `attachWhiteboardToNoteAction` (link/create-blank/detach). 376 Jest tests.
  - **Still pending before Sarah handoff:** session timer (1.6), acceptance checklist (1.13).
- **Web-based collaborative whiteboard for online sessions.** Browser-only, works on Chromebook + tutor's desktop. `tldraw` is the leading candidate (open source, real-time sync engine available). Tutor opens a whiteboard "under the student's name" — i.e. attached to a Student record. **Both tutor and student draw on the same canvas in real time.** This is the table-stakes feature to compete with Wyzant's whiteboard.
- **🎯 Whiteboard session recording (THE differentiator per Sarah).** When tutor opens a whiteboard, prompt: *"Record this whiteboard session?"* If yes:
  - Record **stroke events** as a time-indexed event log (replay as scrubbable video, not flattened video file — much smaller, and lets students step through).
  - Record **audio** (browser MediaRecorder API) synced to stroke timestamps.
  - **Pause button** for off-topic chat — pauses both stroke recording and audio.
  - Save recording attached to the session/note.
  - Allow tutor to send recording link to student/parent for review (existing share-link infrastructure can extend here).
  - **AI notes can be generated from the recording** (transcribe audio, summarize what was worked on, infer next-step suggestions). This is the integration of her #1 paid pain with her #1 moat-feature ask.
- **Subscription billing** — Stripe Checkout, webhook → `AdminUser.subscriptionStatus`, single price to start.
- **Live audio capture during session** with browser reliability (covered by whiteboard recording above).

## Later: in-person mode

- **iPad whiteboard (single user)** using `tldraw` or similar — Apple Pencil via Pointer Events. For when tutor uses tablet during in-person sessions. Lower priority than online whiteboard; in-person is currently paper-based and works for her.
- **iPad two-device handoff** — pass-the-tablet UX for in-person sessions where student writes on tutor's iPad.
- **PDF annotation** (write on top of a worksheet with stylus, persist ink layer).

## Months, "competes with paid tools" polish

- **Whiteboard sync hardening** — `tldraw` self-hosted sync server with proper presence, conflict resolution, network-drop recovery. Initial version can use their hosted sync; production-quality eventually self-hosted for cost + control.
- **Discount system** (Stripe Coupons + Promotion Codes):
  - Public promo codes (`PILOT10` first month off) via Stripe promotion codes.
  - Per-user comp (lifetime / N months free) via customer-applied coupons.
  - DB-side `compReason`, `compGrantedAt`, `compGrantedBy` even when Stripe holds the discount.
  - Default to "free for 12 months, renewable manually" over true infinite.
- **Native or PWA app store presence** (only if mobile install friction proves to matter).

---

## Research / calibration (waiting on real usage data)

These are not features — they're things we don't yet know enough to decide. Revisit after some weeks of pilot usage.

### Pricing
- **Minimum viable subscription amount.** Need 3–5 independent tutors' "I'd pay for this without breaking a sweat" numbers before committing to a price.
- **Anchor against Wyzant's 25% cut.** A tutor making $50/hr through Wyzant loses $12.50/hr (~$50/wk for 4 sessions) to the platform. Subscription priced **well below their Wyzant losses** is an easy yes if our tools match or beat Wyzant's. Use this in marketing copy.
- **Tier structure.** Solo tutor vs tutor with multiple students vs small tutoring business. Not worth designing tiers until we know if anyone hits a ceiling on a flat plan.
- **Per-feature gating decisions.** Should AI notes / recording be in every plan or a "Pro" feature? **Likely needs metering** — recording + transcription costs scale with session minutes, so a flat sub at any price has unbounded downside. Decide once we have a month of real usage data.

### True API costs at scale
- **OpenAI text generation (`gpt-4o-mini`):** estimate is ~$0.001–0.005 per AI-generated note. At 8 notes/week per tutor that's single-digit cents/month. **Need real measurement** once feature ships — log token counts per request, sum monthly per tutor.
- **Whisper transcription:** $0.006/min. A 1-hour session is ~$0.36. **This is the cost-watch item** — at 10 sessions/week per tutor that's ~$15/mo in API spend alone, which eats most of a $20 sub. Need to decide:
  - Pass through cost (transcription as a paid add-on / metered)?
  - Cap minutes per tier?
  - Use a cheaper transcription provider once volumes warrant?
- **Whiteboard sync server costs** (when we get there) — bandwidth-driven, hard to estimate until we know session length and concurrent users per tutor.
- **Hosting** — Vercel + Neon are negligible until they aren't. Watch as users grow.

### Per-user usage quotas
- Daily/monthly request quota per tutor for AI features so a runaway script or unusual usage can't blow up costs.
- Soft limits with "you've used 80% of your monthly AI budget" UI before hard cutoff.
- Decide threshold once we have a month or two of usage data.

### Unit economics
- **CAC:** unknown. Word-of-mouth-only for now; if/when paid ads enter the picture, need real conversion-rate data first.
- **Retention/churn:** unknown until we have ≥3 months of paying users.
- **LTV:** unknown until churn is known. Don't run paid acquisition until LTV/CAC is healthy with margin.

### Marketing / acquisition channels (research, not action yet)
- Tutor subreddits (r/tutor and adjacent), tutoring Facebook groups, Discord communities.
- "I built this for my friend who's a tutor" content angle (Twitter/LinkedIn/Reddit).
- Referral nudge in-app (e.g. "give a tutor 50% off, get a month free") — costs margin, not cash.
- Paid ads: **deferred** until conversion funnel is measured and LTV justifies CAC. Math doesn't work for B2B SaaS at low ASP without real funnel data.

### Legal / trust
- **Audio recording of minors** is jurisdiction-sensitive. Need a clear consent flow, retention policy, and a "delete on request" path before live audio capture ships. Research per state/province before enabling for users outside Sarah's pilot.
- **PII handling** (parent emails, student names, session content) — privacy policy needs to be real, not generic, before public launch. Already have stub via Trust launch bar; revisit before opening signups beyond pilot.

### Feedback handling discipline
- **Tutor advisory of 3–5 honest practitioners** (Sarah is #1). Monthly check-ins, not focus groups.
- **Watch-them-use-it sessions** — 10 minutes of screen-share reveals more than weeks of async messages. Schedule with each pilot at month 1.
- **Distinguish universal pain from personal quirk** — only treat feedback as roadmap when ≥2 unrelated tutors say the same thing. Single-user requests are noted, not built.
- **Track whether shipped fixes actually changed behavior** — "thanks" from a user is not the same as the metric improving.

---

## Operational follow-ups (small, do when convenient)

- **Vercel ignored build step** — doc-only commits (changes under `docs/`, `*.md`, `BACKLOG.md`) currently trigger a full redeploy. Add an "Ignored Build Step" command in Vercel → Project Settings → Git to skip builds when only non-code files changed. Command: `git diff HEAD^ HEAD --name-only | grep -qvE '^(docs/|.*\.md$)'`
- **Visual regression baselines (Playwright toHaveScreenshot).** The infrastructure is fully built (`tests/visual/pages.spec.ts`, `tests/visual/fixtures.ts`, `npm run test:visual:update`) but baselines have not been captured yet and the visual snapshot tests are NOT wired into the build gate. Deliberately deferred while the UI is in active churn — re-baselining on every intentional layout change would be more friction than value right now. **When to activate:** once the UI feels stable (post-Phase 2 layout fixes at minimum). Steps to enable: (1) run `npm run test:visual:update` locally, review the captured screenshots, commit them; (2) add `npm run test:e2e` to the `vercel.json` buildCommand alongside `test:regression`; (3) update `playwright.config.ts` `reuseExistingServer` for CI if needed. The console-error guard and a11y checks in the smoke test ARE already running and catching regressions — this item is only the pixel-diff layer on top.
- **AI panel / note form layout shift** — at borderline window widths the two panels (Auto-fill + New session note) flip between stacked and side-by-side depending on content height. When the AI panel collapses from "full input" to the "Form filled" banner, the reduced height can cause the flex row to reflow. Fix: use CSS grid with fixed column widths instead of a flex row with `flex-wrap`, so the two-column layout stays locked regardless of content height.
- **React #418 hydration mismatch on student page.** Console shows minified React error #418 (server-rendered HTML doesn't match client render) on `/admin/students/[id]`. Likely culprits: locale-formatted dates rendered without a stable timezone, dark-mode/theme detection that runs differently on server vs client, or any `Date.now()` / `Math.random()` at render time. Repro path: open the page in a fresh browser and check console. To diagnose, run `npm run dev` locally and reproduce — dev mode prints the offending element/text instead of the minified code. Pollutes the console (makes real bugs harder to spot) and can cause flickers / state desync, so worth fixing even though no user-visible damage is confirmed yet.
- **Public / share routes — console cleanliness pass.** Parent-facing pages (`/s/[token]`, `/s/[token]/all`, login if linked from email) should be checked in production for **all** console errors and warnings (hydration, third-party, CSP, extensions excluded where possible). Anything not covered by the #418 item above gets a named fix or documented WONTFIX. Goal: trust during pilot QA — parents don’t report console noise, but tutors debugging “it’s broken” often start there.
- **Prisma / Neon `kind: Closed` (transient DB connection drops).** Logs may show `prisma:error Error { kind: Closed, cause: None }`. Some flows already retry with user-facing copy. If frequency is non-trivial in production: investigate Neon serverless + pooler settings, Prisma client lifecycle in serverless (singleton vs request-scoped), connection string params (`pgbouncer`, limits), and add metrics or alerts on error rate. Document root cause once found; optional regression or runbook.
- **Node `DEP0169` — `url.parse()` deprecation warning.** Console/server may warn that `url.parse()` is deprecated in favor of the WHATWG `URL` API. Usually emitted from a dependency, not app code. Trace with `NODE_OPTIONS=--trace-deprecation` locally, then upgrade/pin the offending package or track upstream issue. Low priority while it remains warning-only.
- **Google OAuth / Gmail — first-connect UX audit.** First-time “Connect Google” can feel like double authentication or unclear cancel vs continue. Audit end-to-end: `/admin/settings/email`, NextAuth callbacks, session cookie timing, error states. Success criteria: one clear “connected” outcome, no unexplained second prompt, accurate copy if the user abandons mid-flow.
- **Missing favicon (404 on /favicon.ico).** Every page load logs a 404 for `/favicon.ico`. Add a real favicon (16/32/48px ico, plus an SVG and apple-touch-icon) under `src/app/` per Next.js App Router convention so browsers stop 404'ing on every tab. Trivial fix; mostly polish + cleaner logs.
- **Operator: scoped test-data wipe.** Andrew (operator) accumulates test recordings/notes/students during dev that he wants to clear without nuking real users. Build an operator-only action (initially CLI `npm run operator:wipe-my-data`, UI later when operator dashboard exists) that deletes all `SessionRecording` + `SessionNote` + `Student` rows where `adminUserId = <current operator's user id>` AND deletes the matching Vercel Blob objects. **Hard guards (all required, not optional):** (1) operator-role check at action entry (`session.user.role === "operator"`), 403 otherwise; (2) tenant scope at the **query level** — every `prisma.delete*` call MUST include `where: { adminUserId: session.user.id }`, with an integration test that creates a second tenant's data and asserts the wipe leaves it untouched; (3) **type-to-confirm UI gate** (user types own email to enable button, like GitHub repo deletion); (4) **dry-run by default** — first call returns counts ("would delete 12 recordings, 8 notes, 3 students"), only `?confirm=true` actually executes; (5) audit log row written to a new `OperatorAuditLog` table (or simpler: console.log + Sentry breadcrumb) recording who/when/what counts; (6) blob deletes happen **after** DB deletes succeed, not before, so partial failures leave orphans (recoverable by orphan sweep) rather than dangling DB rows pointing to deleted blobs; (7) **never available in `NODE_ENV=production`** until at least 2 successful staging dry-runs are documented here. Initial release is dev-only via CLI script.
- **Operator: orphaned blob sweep.** Vercel Blob storage accumulates files that no `SessionRecording.blobUrl` points to (failed uploads, deleted notes from before cascade-delete-blob existed, etc.). Build a sweep job that lists blobs and deletes ones with no matching DB row. **Hard guards:** (1) **default to dry-run** — first call always returns the list of orphans + total bytes, explicit `--execute` flag required to actually delete; (2) **minimum age filter** — never delete a blob younger than 24h to protect in-flight uploads where the DB row hasn't been written yet (race condition during note creation); (3) cross-reference rule — a blob is "orphan" iff its URL appears in zero `SessionRecording.blobUrl` values across **all tenants** (orphan sweep is global, not per-tenant) AND `createdAt` >24h ago; (4) **hard cap per run** — refuse to delete more than 100 blobs in a single run (or 5% of total, whichever is smaller); forces operator to confirm batches and protects against a Prisma query bug suddenly classifying every blob as orphan; (5) CLI only initially: `npm run operator:sweep-orphan-blobs [--execute]`, UI version after operator dashboard exists; (6) **test with mocked Vercel Blob client** — must not hit real blob storage in tests (see `src/__tests__/audio-isolation.test.ts` for the existing mock pattern); (7) required regression test: seed N recordings with matching blob mocks, seed M orphan blobs (mocks only, no DB row), assert dry-run reports M orphans and 0 valid deletions, assert `--execute` deletes exactly M and the N intact recordings remain queryable.

- **Usage tracking prerequisite (do before first paying user).** Before metered billing or subscription tiers can be enforced, the data model needs to count consumption. Add a `UsageLedger` table (or `monthlyUsageRollup` denormalized on `AdminUser`) that records: `adminUserId`, `periodStart` (first of month), `transcriptionMinutes` (float), `aiGenerations` (int), `recordingStorageBytes` (int). Increment on each Whisper call (`durationSeconds / 60`), AI generation call, and blob upload. **Schema-first, enforcement-later:** wire the writes now so data exists; gates and limits come when tiers are designed. This means no retrofit when billing ships. **Soft-cap warning UI:** when transcription minutes in the current period cross 80% of a future tier ceiling, surface an in-app banner so the tutor isn't surprised. **Regression test required:** verify that a transcription call increments `transcriptionMinutes` by the correct amount and that the increment is scoped to the correct `adminUserId` (multi-tenant isolation, same pattern as `audio-isolation.test.ts`).

- **Outbox UX cleanup — collapse sent items.** The outbox currently shows all sent emails in a flat list. Once a message is sent it's rarely actioned again; showing it at full height buries anything still needing attention. Desired behavior: sent items collapsed by default into a "Sent (N)" disclosure/details section, expandable on demand; unsent/queued items stay full-height at the top. Pattern mirrors the notes-history page cleanup (compact summary → expand for detail). Also give the first-time empty state a friendlier message ("No emails sent yet — send your first update from a student's page").
- Friendlier empty states throughout (especially Outbox first-time, Students first-time).
- "What's this for?" tooltips on Settings sections.
- Add an obvious "Send feedback" CTA inside the app (already exists in nav, but not yet contextual on key screens).
- **Mobile/phone responsive audit.** Sarah may fall back to phone if tablet is forgotten. Notes form, students list, and "Send update" flow should at minimum *work* on a phone, even if not optimized.
- **Schedule a "watch her use it" call** within first 1–2 weeks of pilot. 10 minutes of screen-share reveals friction users never bother to message about.
- Document for future agents: tutoring-notes is a **service** for tutors, not a product Andrew uses himself. Feedback loop must come from real users, not intuition. (Echoed in PRINCIPLES + multi-tenant learning; worth a per-app reminder here.)

---

## Decisions deferred (revisit when triggered)

- **Whiteboard: feature of tutoring-notes vs sibling product?** Currently leaning toward **feature** (single app, single account, one subscription). "Tutoring Notes" branding may need to grow into "Tutoring Studio" or similar once whiteboard + recording ship — the current name undersells the product. Worth a deliberate naming decision before public launch.
- **Native app vs PWA** — defer until we know if iPad install friction is a real pain (vs just adding the web app to Home Screen). Online flow is browser-only per Sarah, so PWA is fine for MVP.
- **Choosing OpenAI vs Anthropic** — coin-flip for current use case; revisit if cost or quality differs meaningfully on real workloads. OpenAI has the advantage of also providing Whisper, keeping audio + text on one provider/key.
- **Recording storage:** stroke event log (JSON, small) is easy. Audio (MB-scale per session) needs a real plan: object storage (S3/R2/Vercel Blob), retention policy, cost per tutor. Decide before shipping recording feature publicly.
- **Audio blob retention policy.** Once a recording is transcribed, there are two options: (a) delete immediately — transcript is in the DB, blob has no further purpose unless we offer re-download; (b) keep for N days (30-day window?) so tutor can re-transcribe or download before it expires. Currently blobs are never cleaned up. Also: student/note delete should cascade to blob deletion. Decide: do we want recordings to be re-downloadable by the tutor? If no, delete on successful transcription. If yes, set a retention window and a cron/cleanup job. Either way, add `deleteBlob()` calls to the note and student delete paths.
- **Replay video format:** stroke-event-replay (custom player) vs flatten-to-MP4 server-side (familiar to students, larger file). Probably stroke-event-replay first (cheaper, scrubbable, smaller); add MP4 export if students ask.

---

## Reliability gaps — audit findings (2026-04-23)

Audit run as part of the Whiteboard plan rollout — applying the new
`.cursor/rules/reliability-bar.mdc` 5-axis lens (data durability, clock/ordering,
race conditions, cross-platform parity, observability) to the existing recorder
+ note flow.

These items are **not** speculative blue-sky risks. They are concrete gaps the
audit found by reading `useAudioRecorder.ts`, `lib/recording/upload.ts`,
`lib/ai.ts`, the `actions.ts` server actions, and the `/api/upload/audio`,
`/api/audio/[recordingId]` routes. Each one is the same class of bug Sarah
already hit in the earlier rounds (17.9 MB silent drop, slider unmount,
silence hallucination, iOS Server Action) — caught during planning instead
of after.

Tagged `[BLOCKER-PROD]` if the gap can lose user data or silently confuse a
real session; `[FOLLOW-UP]` if it's a polish/scaling concern. BLOCKER-PROD
items should be on the active path before the next pilot tutor is added.

### Axis 1 — Data durability (recorder)

1. **[BLOCKER-PROD] In-progress segment dies on browser crash / refresh / OOM.**
   `useAudioRecorder` keeps the live `MediaRecorder`'s chunks in `chunksRef`
   (in-memory only). A 50-min segment with 49 min recorded + tab crash = 49 min
   of audio lost. The completed *previous* segments are uploaded to Blob, but
   the in-progress one has no IndexedDB safety net. Mirror the pattern from
   the whiteboard plan blocker #1: serialize partial chunks to IndexedDB on a
   30-second cadence, surface a "Recover unfinished recording from XX:XX?"
   banner on next mount. Same `findInProgressSession` shape works for both
   features.
2. **[BLOCKER-PROD] Upload-failure persistence dies on page navigation.**
   `uploadAudioWithRetry` retries once. If both attempts fail (genuine network
   outage, Vercel Blob 5xx storm), the user sees the friendly error — and the
   blob in browser memory dies the moment they close the tab or click "back to
   the student page." There is no IndexedDB hold-the-blob-until-retry flow.
   Sarah-level mitigation: persist the blob to IndexedDB on retry exhaustion,
   surface a "Upload failed — your recording is saved on this device. [Retry]"
   banner that survives page navigation in the same browser. Same pattern as
   whiteboard plan blocker #7.
3. **[FOLLOW-UP] No cross-device recovery.** Even with IndexedDB persistence,
   a tutor who switches from desktop to phone mid-session loses the local copy.
   Acceptable for v1; track if anyone reports it.

### Axis 2 — Clock + ordering correctness

4. **[FOLLOW-UP] Session timer drift on iOS.** Already in BACKLOG as
   "Session timer stops when phone idles" (line 32). Reframe under reliability
   gaps so it gets the same triage discipline. Fix is also already proposed
   (reconcile against `Date.now() - startedAt` on `visibilitychange`); this
   item just elevates priority.
5. **[FOLLOW-UP] WebM/MP4 duration is unreliable for scrubbing.** Already in
   BACKLOG (search "scrub"). Reframe under reliability gaps. The fix is to
   either re-mux server-side on upload to add a proper `cues` atom or to
   pre-compute duration via `ffprobe` and store it on `SessionRecording`.
   Today the share-link audio player can't scrub long segments accurately,
   which is a real parent-side trust hit.

### Axis 3 — Race conditions on user input

6. **[BLOCKER-PROD] Note save vs transcribe race.** If a tutor types into the
   note form while `transcribeAndGenerateAction` is running on a fresh
   recording, the action's `populate()` callback overwrites the form fields
   when the AI response arrives. Tutor's hand-typed text is silently lost.
   This is a Sarah-class bug — the loss is silent and the tutor only notices
   if they remember they had typed something. Fix options: (a) refuse to
   `populate()` if any field has been edited since the action started (track
   `dirtyAt` per field), (b) show a "AI is filling — your edits will be
   merged, not overwritten" indicator, (c) merge AI fields only into empty
   fields. (a) is the safest default. Test: dirty a field, fire the AI, assert
   it doesn't clobber.
7. **[BLOCKER-PROD] Hot-swap mic / headphones unplug mid-record is silent.**
   `MediaRecorder` keeps producing data even after the underlying device
   disappears (the stream becomes silence), and `useAudioRecorder` does not
   subscribe to `MediaStreamTrack.onended` or check `track.readyState`. Sarah
   yanks her USB headset, the next 20 minutes is silence, Whisper hallucinates,
   note is empty. Fix: subscribe to `track.onended`, surface a banner "Audio
   device disconnected — recording paused. Reconnect or change device to
   continue.", optionally auto-pause the recording. This is the device-side
   analog of the silence-hallucination guard.
8. **[FOLLOW-UP] Pause clicked while a segment is mid-finalize.** Possible
   race between the user-driven Pause and the auto-rollover finalize path.
   B5's "single-shot rollover guard" (`rolloverInProgressRef`) handles
   double-rollovers but doesn't gate against a manual Pause arriving in the
   gap. Low probability; verify with a stress test before declaring fixed.
9. **[FOLLOW-UP] Browser back button mid-recording.** No `beforeunload` guard
   exists. Tutor accidentally backs out, recording is lost (would benefit from
   the IndexedDB persistence in #1). Add a `beforeunload` confirm when
   `recordingActive`, paired with the IndexedDB safety net so even a confirmed
   navigation doesn't lose data.

### Axis 4 — Cross-platform parity

10. **[BLOCKER-PROD] iOS Safari real-hardware test matrix is implicit.** The
    code has iOS-Safari-specific branches (no-timeslice MP4 guard, iOS Server
    Action HTML response, mic permission re-prompt on rollover) but the
    "tested on a real iPhone" checklist is in `RECORDER-REFACTOR-STATUS.md`
    smoke as a single line, not a matrix. Build a real explicit list:

    | Feature                              | Real iOS Safari | jsdom | Playwright WebKit |
    |---|---|---|---|
    | Cold mic acquire + record + stop     | Sarah's flow    | yes   | yes               |
    | Auto-rollover at segment cap         | **untested**    | yes   | opt-in            |
    | Tab background → return → keep going | **untested**    | no    | no                |
    | Screen lock → unlock mid-record      | **untested**    | no    | no                |
    | Hot-swap from speaker to headphones  | **untested**    | no    | no                |
    | Sign-out → sign-in (BACKLOG line 30) | **broken**      | no    | no                |
    | Upload of >10 MB blob                | **untested**    | yes   | yes               |

    Each "untested" cell is a Sarah-might-hit-it bug waiting to happen. Either
    test on real hardware (Andrew has an iPhone) and tick the cell, or add an
    explicit iOS-Safari "limitations" copy block in the recorder UI so the
    user knows what we have and haven't validated.
11. **[FOLLOW-UP] Android Chrome is "passes Sarah's flow" but otherwise
    untested.** Same matrix as #10 should be filled in for Android Chrome
    once a second pilot tutor or PO test happens.
12. **[FOLLOW-UP] Firefox is completely untested.** Lower priority because
    no current user uses Firefox; flag if anyone ever reports a Firefox
    issue.

### Axis 5 — Observability

13. **[BLOCKER-PROD] `rid=` coverage is partial.** Audit findings:
    - **`transcribeAndGenerateAction`** (`actions.ts:291`) — has `rid`
      logged at begin / ok / returned-ok-false / thrown.
    - **`/api/upload/audio` route** (`route.ts:66`) — has `rid` on token
      generation.
    - **`createNote` / `editNote` / `deleteNote` / `regenerateShareLink` /
      `revokeShareLink` / `deleteRecording` / `generateNoteFromTextAction`**
      — no `rid`. When Sarah reports "I saved a note and it disappeared" we
      have no way to correlate her timestamp to a specific server-side
      execution. Fix: thread `createActionCorrelationId()` through every
      mutating server action; log `[<actionName>] rid=<uuid> studentId=<id>
      noteId=<id> begin/ok/error`. Mechanical; pure Sonnet work.
    - **Client-side errors** are `console.error`-only with no per-action
      `rid` echoed back to the user. Add the `Ref:` short-id to non-action
      client-side errors too where possible.
14. **[BLOCKER-PROD] No structured per-recording lifecycle log.** A
    `SessionRecording` row goes through Created → Uploaded → Transcribed →
    AttachedToNote → Deleted, but each transition logs in a different format
    (or not at all). Build a single grep-friendly format:
    `[recording] rid=<id> recordingId=<id> studentId=<id> phase=<created|uploaded|transcribed|attached|deleted> ok=<bool> details=<short>`.
    Lets us trace any single recording end-to-end through Vercel logs in 30
    seconds.
15. **[FOLLOW-UP] Whisper API call observability.** When Whisper returns a
    junk transcript, the existing silence-hallucination guard catches it but
    there's no log line saying "Whisper returned <N> chars for a <M>-second
    segment, looked like silence boilerplate." Add at warn level, link by
    `rid + recordingId`, so we can correlate "Sarah's note has Topics: 'thanks
    for watching'" to the exact Whisper response.

### Triage suggestion

| Priority | Items | Rough scope |
|---|---|---|
| **Active path next** (BLOCKER-PROD on data loss) | 1, 2, 6, 7 | ~3-5 evenings: IndexedDB persistence module reused by recorder + whiteboard, dirty-field guard on `populate`, `track.onended` subscription. |
| **Active path soon** (BLOCKER-PROD on observability + iOS) | 10, 13, 14 | ~2-3 evenings: rid plumbing through remaining actions, recording-lifecycle log helper, real iPhone test pass + matrix. |
| **Track for next sweep** | 3, 4, 5, 8, 9, 11, 12, 15 | Backlog — bring up at next planning when scope allows. |

The first row could plausibly be folded into the whiteboard Phase 1 hook +
checkpoint-store work — `useWhiteboardRecorder` and `useAudioRecorder` would
share the IndexedDB persistence module, and the dirty-field + `track.onended`
patterns can be added to the recorder hook in the same session.

### Why this audit lives in BACKLOG.md and not in a separate doc

These are **recorder-and-note** gaps, and BACKLOG.md is the canonical list
for the recorder/note flow. The whiteboard feature gets its own
`docs/WHITEBOARD-STATUS.md` for its sub-phases and audit. Both are governed
by the same `.cursor/rules/reliability-bar.mdc` standard.
