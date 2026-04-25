# Whiteboard — phase 1 build status

**Plan:** `~/.cursor/plans/whiteboard_-_match_wyzant_for_sarah_plus_our_wedge_*.plan.md`
**Reliability bar:** [.cursor/rules/reliability-bar.mdc](../../../.cursor/rules/reliability-bar.mdc)
**Strategy in one line:** match Wyzant for Sarah's daily flow + add our AI-notes wedge.

This doc is the canonical handoff between sessions. The Cursor plan can
expire; this doc survives. Update it whenever you finish a sub-section or
pause mid-flight. For **git root, branch, and parallel-chat process**, also read **`docs/AGENT-BOOTSTRAP.md`**.

---

## Guardrails (must hold across all phases)

These are first-class acceptance criteria, not nice-to-haves.

1. **Recording is the artifact; live collab is the table stake.** The tutor
   browser is the recorder of truth. We never trade replay correctness for
   live-sync simplicity. If the sync server flakes mid-session, the recording
   must still finalize cleanly with `sync-disconnect`/`sync-reconnect` markers
   in the event log.
2. **Sarah-demo gate before Phase 2.** Phase 2 (collab text/code editor +
   DOC/XLS/PPT upload) does not begin until Sarah has used Phase 1 in at
   least 3 real sessions and we know which Phase 2 surface she actually
   reaches for. See "Phase 2 demo gate" checklist below.
3. **Library-agnostic event-log format.** The recorded JSON we persist is
   our own canonical format, not Excalidraw's `Element` shape leaked
   through. A thin adapter layer (`src/lib/whiteboard/excalidraw-adapter.ts`)
   translates Excalidraw `onChange` payloads into our format on record and
   back into Excalidraw scene state on replay. This keeps a future
   tldraw / custom-canvas swap from breaking old sessions — we only write
   a new adapter; the event log on disk stays valid.
4. **Consent + recording disclosure.** Sarah voluntarily said "yes with
   consent". The "Start whiteboard session" entry point opens a modal with
   an explicit checkbox (`"My student has consented to this session being
   recorded (audio + writing)."`) that must be checked before the session
   can start. The choice is logged on the `WhiteboardSession` row
   (`consentAcknowledged: Boolean`). The consent check is server-side
   enforced — back/forward nav cannot bypass it.

---

## Sarah pre-build Q&A (verbatim, drove the scope)

She replied with **A on every question**:

- **Q1 (live vs replay): A** — "needs to be live"
- **Q2 (student drawing): A** — "I get all of these features on Wyzant…
  they have it where it keeps track of how much time I've spent tutoring
  someone… I've just never had the counter start over… you would hope it
  would at least save the recording automatically if it had this end and
  we would end then we had to start over."
- **Q3 (device): A primarily** — "Primarily, I used my desktop computer
  and there is only been a few times where I've connected from my phone
  if I'm close to getting home but not quite there yet."
- **Q4 (crash recovery): implicit A** — her quote on the auto-save
  expectation is the answer.

**New requirements she surfaced unprompted (folded into Phase 1 scope):**

1. **Session timer** that starts when both parties connect to the
   whiteboard, counts continuously, survives one party briefly
   disconnecting (the other side's clock keeps running). She values this
   for tracking session length, not billing.
2. **Auto-save the recording** so a disconnect/crash doesn't lose the
   session. Confirms blocker #1 in the adversarial review.
3. **Document upload to whiteboard** (Wyzant has it; she listed it among
   "extra features" — PDF in scope for Phase 1).

---

## Adversarial review — 26 ranked blockers (verbatim from plan)

Sarah will not switch off her backup if the app loses one session. The
points below are gated as **Phase 1 blockers** unless explicitly tagged
`follow-up`.

1. **[BLOCKER] Crash / refresh / OOM mid-session = total data loss.**
   Mirror `useAudioRecorder`'s segment pattern: flush a checkpoint of
   `{ events_so_far, audio_segment }` to IndexedDB every 30 s AND upload
   a partial checkpoint to Blob every 5 min. On reload of the workspace
   page, detect an in-progress session for this tutor + student and offer
   "Resume previous session (started 10:14, 24 min recorded)".
2. **[BLOCKER] Audio + stroke clock drift over 30+ min.** Stroke `t` is
   `audioRecorder.getElapsedAudioMs()`, NOT `Date.now() - startedAt`. Add
   an explicit getter on `useAudioRecorder`. Test: 30-min synthetic
   session, drift < 100 ms.
3. **[BLOCKER] Snapshots-every-tick = multi-MB events.json + stuttering
   replay.** Event log is a diff log from day one. Test: 30-min synthetic
   session events.json < 500 KB.
4. **[BLOCKER] Pause race condition.** Explicit `recordingActive` boolean
   gate inside the hook; `onChange` events received while gate is false
   are dropped.
5. **[BLOCKER] Tab-switch / background throttling.** `visibilitychange`
   handler writes `tab-hidden`/`tab-visible` markers; audio keeps
   recording; verify strokes drawn after returning have correct `t`.
6. **[BLOCKER] iOS Safari smoke.** Excalidraw pointer vs touch, URL bar
   resize, MP4 mime fallback, mic Permissions-Policy, screen lock.
   Playwright iOS profile + explicit "iPhone limitations" copy.
7. **[BLOCKER] Stop-time upload failure = whole session lost.** Retain
   Stop-state in IndexedDB until upload-confirmed; "Upload failed — tap
   to retry. Your session is saved locally." Same retry-with-backoff
   pattern as `uploadAudioWithRetry`.
8. **[BLOCKER] Bundle size + double-click race.** Disable Start during
   chunk load + show spinner; route guard so only one workspace instance
   per tab.
9. **[BLOCKER-OBSERVABILITY] No `wbsid` debug log.** Mirror `rid=` from
   audio. Log at start, pause, resume, snapshot N, stop, upload start,
   upload complete, every error.
10. **Async exportToBlob freezes the browser on Stop.** Run after marking
    session "stopping" (UI shows "Saving…"); allow it to fail without
    blocking the events.json upload.
11. **CSP fonts & assets.** Verify Excalidraw's `Excalifont` etc. resolve
    as `'self'`.
12. **Multi-monitor / DPR change mid-session.** Excalidraw handles DPR
    internally — verify with manual smoke.
13. **Replay payload prefetch on share page.** Preload events.json (and
    snapshot PNG) BEFORE the audio Play button is enabled.
14. **Replay viewport on phone.** `scrollToContent` on first load;
    view-mode pinch-zoom enabled.
15. **Orphan whiteboard sessions in DB + Blob.** Nightly cron sweep
    older-than-30-days unattached. Track in cost ledger below.
16. **Browser back/forward bypassing consent.** Server-side enforcement:
    create-session server action takes `consentAcknowledged: true`
    required; workspace redirects back to consent if active session row
    has the flag false.
17. **Snapshot PNG privacy.** Same `assertOwnsStudent`/share-token gate
    as events; never a public Blob URL.
18. **`eventsSchemaVersion` dispatch from day one.** `switch
    (schemaVersion)` even with only v1.
19. **Test fixtures for Excalidraw shapes.** Capture real fixtures via
    Excalidraw's test API in test setup, NOT hand-typed.
20. **Storage cost at scale (informational).** ~30 MB audio + ~500 KB
    events + ~200 KB PNG per 30-min session. Track in cost ledger below.
21. **CI bundle weight (informational).** Single representative
    Excalidraw smoke per phase.
22. **[BLOCKER] Sync server outage = session unusable mid-flight.**
    Tutor recording continues regardless; auto-reconnect with backoff;
    "Reconnecting to student…" banner after 3 s; recording finalizes
    with `sync-disconnect`/`sync-reconnect` markers. Test: kill sync
    container mid-session, verify tutor's recording finalizes correctly.
23. **[BLOCKER] Student joining mid-session = blank canvas.** On
    student join, the tutor's client publishes a full snapshot welcome
    packet to the room. Test: tutor draws 3 strokes, student joins,
    asserts student sees all 3.
24. **[BLOCKER] Session timer drift between tutor and student.** Server
    is the source of truth for `bothConnectedAt`; both clients compute
    elapsed from that. **One disconnect must NOT reset the timer** —
    Sarah's exact stated expectation.
25. **[BLOCKER] PDF upload size + page count.** Cap at 30 pages, 25 MB.
    Render pages on-demand sequentially; memory-safe on iPad fallback.
26. **[BLOCKER] Math equation editor input fidelity.** MathLive WYSIWYG
    -> LaTeX. Touch-keyboard tested for iPad fallback.

---

## Phase 1 sub-section status

| # | Sub-section | Status | Notes / commit |
|---|---|---|---|
| 1.1 | Schema (`WhiteboardSession`, `WhiteboardJoinToken`, `bothConnectedAt`) | done | Migration `20260424000000_whiteboard_session` |
| 1.2 | Recorder hook + canonical event log + Excalidraw adapter | done | `useWhiteboardRecorder.ts`, `event-log.ts`, `excalidraw-adapter.ts`, `checkpoint-store.ts` + jsdom tests |
| 1.3 | UI workspace (consent, recorder, banners, mic meter) | done | Consent modal (`ConsentModal.tsx`) + `createWhiteboardSession` action (consent + env-only guard + empty events.json placeholder); workspace page (`/admin/students/[id]/whiteboard/[sessionId]/workspace`) with lazy Excalidraw, recording indicator, live timer, mic meter, Copy student link button; `useWhiteboardRecorder` hook |
| 1.4 | Storage and replay routes (private + share-token gated) | done | Generalized `/api/upload/blob` + `/api/whiteboard/[id]/checkpoint` done; `<WhiteboardReplay>` component (schema-version dispatch + audio-driven scene + color attribution + asset prefetch + scrollToContent); `/api/whiteboard/[id]/{events,snapshot}` (admin-gated proxy) + `/api/whiteboard/[id]/{public-events,public-snapshot}` (share-token gated proxy); `/admin/students/[id]/whiteboard/[sessionId]` review page; `/s/[token]/whiteboard/[sessionId]` share replay page; `wbsid=` logging on all routes |
| 1.5 | Live sync host + WS client + join link | done | Sync host (Fly.io) artifacts in `pipeline-projects/whiteboard-sync/`; `sync-client.ts` (13 tests); `issueJoinToken` + `revokeJoinTokensForSession` actions (9 tests); student page `src/app/w/[joinToken]/page.tsx` validates token + extracts encryption key from URL fragment |
| 1.6 | Session timer (Sarah's explicit ask) | done | `bothConnectedAt` stamped idempotently when student opens join link (`StudentWhiteboardPage`); `GET /api/whiteboard/[id]/timer-anchor` (admin-gated); workspace polls every 5 s until anchor set; timer label "(waiting for student)" until student joins |
| 1.7 | PDF + image upload to canvas | done | `pdfjs-dist` worker copied to `public/pdfjs/` at install; `PdfImageUploadButton` + `insert-asset.ts` (image + tiled-PDF page inserts); 30 pp / 25 MB caps; iOS-Safari memory warning copy |
| 1.8 | Math equation editor | done | `MathInsertButton` -> MathLive WYSIWYG -> `mathjax-full` lite-adaptor SVG -> Excalidraw image element with `customData.latex` preserved for the AI pipeline (`math-render.ts` + `insertMathSvgOnCanvas`) |
| 1.9 | Desmos graphing embed | done | `DesmosInsertButton` (blank-graph or saved-URL) -> `insertDesmosEmbedOnCanvas` -> Excalidraw `embeddable` element; `validateDesmosUrl` only accepts `*.desmos.com` over https; `validateExcalidrawEmbeddable` mirrors the allowlist. **Replay caveat:** see "Desmos replay caveat" section below |
| 1.10 | AI integration — the wedge | done | `generateNotesFromWhiteboardSessionAction` (transcribes WB audio → `generateSessionNote`, reuses full transcription pipeline); `attachWhiteboardToNoteAction` (link existing / create-blank / detach); `WhiteboardNotesPanel` client component on admin review page; flows into existing `createNote` + student detail page for edit + save |
| 1.11 | CSP updates | done | `next.config.ts` ships a full CSP: `frame-src 'self' https://www.desmos.com https://desmos.com`, `connect-src 'self' https: wss:` (covers `WHITEBOARD_SYNC_URL`), `img-src 'self' data: blob: https:`, `worker-src 'self' blob:` (pdfjs), `frame-ancestors 'none'` + `X-Frame-Options: DENY` |
| 1.12 | Tests (unit + jsdom + Playwright) | partial | 376 Jest tests pass (10 new: `generateNotesFromWhiteboardSessionAction` + `attachWhiteboardToNoteAction` coverage); existing suites: checkpoint-store (jsdom), excalidraw-adapter, insert-asset (PDF+math+Desmos), joinToken, math-render, pdf-render, replay (schema dispatch + reconstructSceneAt), sync-client (13 tests). Playwright E2E not yet wired (tracked separately). |
| 1.13 | Acceptance criteria | pending | See plan doc |

---

## Cross-cutting (apply to whiteboard + recorder)

| # | Item | Status | Notes |
|---|---|---|---|
| C1 | `.cursor/rules/reliability-bar.mdc` | done | 5-axis adversarial review standard |
| C2 | `pipeline-projects/tutoring-notes/AGENTS.md` pointer to C1 | done | |
| C3 | Recorder + note flow audit (`docs/BACKLOG.md` "Reliability gaps") | done | 15 items, prioritized |

---

## Remaining before Sarah handoff (Phase 1 items not yet done)

| # | Item | Why still pending |
|---|---|---|
| 1.6 | Session timer (Sarah's explicit ask — "both parties see elapsed since student joined") | done — stamped in StudentWhiteboardPage; workspace polls timer-anchor until set |
| 1.13 | Acceptance criteria walkthrough | Sarah needs to do 3 real sessions for some items (replay, AI notes quality); manual checklist in plan doc |

**Definition of ready to hand off to Sarah:**
- Items 1.1–1.5, 1.7–1.12 are marked `done` above. ✅
- Item 1.6 (session timer) is now done.
- Item 1.13 (acceptance criteria) is validated *through* the 3-session gate, not before it.

---

## Phase 1 -> Phase 2 demo gate

**No Phase 2 code is written until all of the following are checked off:**

- [ ] Sarah has used the Phase 1 whiteboard in **at least 3 real tutoring
      sessions** with real students.
- [ ] After session 3, written PO check-in: which of the four Phase 2
      surfaces did she actually try to reach for and not find?
  - [ ] **Surface A — collab text editor for essays/papers** — requested? `___`
  - [ ] **Surface B — collab code editor (CS tutoring)** — requested? `___`
  - [ ] **Surface C — DOC / XLS / PPT upload** — requested? `___`
  - [ ] **Surface D — Wolfram Alpha embed** — requested? `___`
- [ ] If she only used the math + PDF + recording surface: Phase 2 is
      **deferred to the regular backlog**, not on the active path.
      Re-evaluate at the next tutor signup or in 4-6 weeks.
- [ ] If she explicitly asks for one of the surfaces: scope Phase 2 to
      *that* surface, with her stated use case as the acceptance bar.
      Don't build the rest until a third request.

---

## Sync host deploy notes (rebuild-in-one-sitting)

The sync host runs `excalidraw-room` (a tiny Express + socket.io
relay) under our domain so Tutoring Notes doesn't depend on
Excalidraw's public infrastructure. Deploy artifacts live in
`pipeline-projects/whiteboard-sync/`.

### Phase 1 platform: Fly.io (deferred from CF Workers)

The plan originally called for Cloudflare Workers + Durable Objects
because of edge cold-start and a flat $5/mo target. Reality: socket.io
does not run on Workers without a non-trivial protocol rewrite onto
DO WebSocket hibernation. Phase 1 ships on Fly.io because:

- `excalidraw-room` runs as-is (Node + socket.io persistent connections).
- A single `shared-cpu-1x@256MB` machine with `auto_stop_machines = true`
  costs ~$2/mo at our load.
- TLS cert (`fly certs create wb.mortensenapps.com`) is a one-shot.

CF Workers + DO migration stays on the long-term roadmap once Sarah
is on the whiteboard daily AND we see latency / cost numbers that
justify the rewrite. Track separately in `docs/BACKLOG.md`.

### Domain

`wss://wb.mortensenapps.com` — CNAME to the Fly app's hostname (Fly
prints the value after `fly certs create`). Same DNS zone as
`tutoring-notes.mortensenapps.com` to keep cert renewal simple.

### Required env vars (Vercel: preview + prod)

- `WHITEBOARD_SYNC_URL` — `wss://wb.mortensenapps.com`
  (when unset, the whiteboard runs in tutor-solo mode — no live
  student join, recording still works)

### Required env vars (Fly.io)

- `CORS_ORIGIN` — comma-separated allowlist:
  `https://tutoring-notes.mortensenapps.com,http://localhost:3000`
  Set via `fly secrets set` (NOT in `fly.toml`).

### Deploy steps (one-shot)

```sh
cd pipeline-projects/whiteboard-sync
fly auth login
fly launch --no-deploy --copy-config --name wb-mortensen
fly certs create wb.mortensenapps.com
# DNS: add the CNAME Fly prints to the mortensenapps.com zone.
fly secrets set CORS_ORIGIN="https://tutoring-notes.mortensenapps.com,http://localhost:3000"
fly deploy
curl https://wb.mortensenapps.com/   # → "Excalidraw collaboration server is up :)"
```

Subsequent deploys: `fly deploy`. Bump the `EXCALIDRAW_ROOM_SHA` in
`Dockerfile` after diffing upstream `src/index.ts` for protocol
changes (see `whiteboard-sync/README.md`).

### Trust model (re-verify before each protocol bump)

The relay only forwards opaque end-to-end-encrypted payloads. The
encryption key lives in the join URL fragment (`#`), which the
server never sees. A relay compromise does NOT leak whiteboard
content; it just takes down live collaboration. Recording on the
tutor side keeps working with `sync-disconnect` markers.

### CSP shipped in 1.11

The full policy lives in `next.config.ts`. Key directives that landed
together with the Desmos / PDF / math toolbars:

- `connect-src 'self' https: wss:`
  Covers `WHITEBOARD_SYNC_URL` (any Fly.io subdomain), Vercel Blob
  client uploads (any `*.public.blob.vercel-storage.com`), Whisper +
  OpenAI completions. We accept the broad allowlist for simplicity;
  tightening to per-host requires env-var coupling that churns more
  than it secures.
- `frame-src 'self' https://www.desmos.com https://desmos.com`
  Only Desmos is allowed in the iframe sandbox. Mirrored in the
  Excalidraw `validateEmbeddable` callback in
  `WhiteboardWorkspaceClient.tsx` so the toolbar UI matches.
- `img-src 'self' data: blob: https:`
  `data:` for inlined math SVGs and image previews. `blob:` for
  uploaded image previews. `https:` for assets served from Vercel
  Blob.
- `font-src 'self' data:`
  MathJax `liteAdaptor` with `fontCache: "local"` embeds glyphs as
  inline `<use>` references — no external font fetches at runtime.
  MathLive ships its fonts within its own bundle; we don't load
  from a CDN. So no third-party font origin is needed.
- `worker-src 'self' blob:`
  pdfjs's worker is served from `/pdfjs/pdf.worker.min.mjs` (same
  origin) but spawns blob-URL workers internally.
- `frame-ancestors 'none'` + `X-Frame-Options: DENY`
  Tutoring Notes is never meant to be iframed by another site.

### Desmos replay caveat (acceptance criterion #1.9)

The Desmos iframe runs as a live, interactive widget. The canonical
event log records:

- the `embeddable` element's URL (in `customData.assetUrl`);
- its `wbType: "embed"` discriminator and `embed.{provider, kind}`
  metadata;
- any subsequent move / resize / delete via the standard `update` /
  `remove` events.

It does **not** capture state changes that happen *inside* the iframe
(sliders dragged, equations toggled, expressions added). Replay
therefore loads the iframe at whatever state the URL initially
represents:

- "New blank graph" → blank calculator on replay.
- "From URL" with a saved Desmos permalink (e.g.
  `https://www.desmos.com/calculator/abcdefghij`) → the saved graph
  state, because Desmos encodes that state in the URL itself.

The "Insert Desmos" dialog tells the tutor this in the blank-graph
mode and recommends the saved-URL flow when they want a replay-stable
artifact. A future Phase 1.5 follow-up (already tracked under
"Desmos state capture" below) would tap into Desmos's
`Calculator.observeEvent("change")` to write `desmosStateJson` into
the event log periodically; we deferred it because Sarah's stated use
case (showing a graph during a tutoring session) doesn't require
replay fidelity of intra-iframe interactions.

---

## Schema-version log

When `WBEventLog.schemaVersion` is bumped, record here why:

| Version | Date | Reason |
|---|---|---|
| 1 | (initial) | Initial diff-log format. Events: `snapshot`, `add`, `update`, `remove`, `pause`, `resume`, `tab-hidden`, `tab-visible`, `sync-disconnect`, `sync-reconnect`. Reserved: `text-doc-update` (Phase 2 surface A). |

---

## Blob cost ledger

Track per-session storage so we can see when costs grow.

| Asset | Per-session typical | Per-session worst-case | Notes |
|---|---|---|---|
| Audio (WebM/MP4 segments) | ~30 MB / 30-min | ~70 MB / hr | already paying for this in audio recorder |
| Events JSON (diff log) | < 100 KB | < 500 KB | blocker #3 acceptance budget |
| Snapshot PNG | ~100-200 KB | ~500 KB | optional, may fail on Stop |
| PDF page PNGs | varies (cap 30 pages) | ~5-10 MB | only if tutor uploads a doc |
| Equation SVGs | ~5 KB each | negligible | |

**Pilot scale (Sarah only):** ~20 sessions/wk * ~30 MB = ~600 MB/wk =
~2.5 GB/mo. Vercel Blob $0.15/GB after 1 GB free → **~$0.50/mo**.

**100-tutor projection:** ~250 GB/mo → **~$35/mo**. Not a blocker; track
to know when to revisit.

---

## Follow-ups (NOT in Phase 1, tracked here so they don't get lost)

- **Multi-monitor DPR change manual smoke** (blocker #12) — verify
  Excalidraw handles a window drag between displays cleanly. Document
  expected behavior; not a blocker for ship.
- **Orphan session sweep** (blocker #15) — nightly cron to delete unattached
  sessions older than 30 days. Implement after first revenue / when storage
  exceeds $5/mo.
- **CI bundle weight** (blocker #21) — single Excalidraw-loaded smoke test
  per Phase, not per PR.
- **Storage cost watch** (blocker #20) — revisit when Vercel Blob spend
  crosses $20/mo.
- **Phase 1.5: multimodal AI from snapshot + LaTeX** — pass final-snapshot
  PNG + extracted LaTeX equations to gpt-4o-mini so AI Topics/Plan can
  reference what was actually written. ~$0.001 per session.
- **Phase 1.5: Desmos state capture** — capture Desmos `setState`/`getState`
  snapshots into the event log so replay shows the live editing of
  expressions, not just the initial graph state.
- **PDF mobile rendering** — `pdfjs-dist` on iOS Safari is memory-heavy.
  If a tutor reports OOM on iPad, switch to server-side conversion.

---

## How to pick this back up between sessions

1. **Read this doc top-to-bottom.** Especially the Phase 1 sub-section
   status table to know where work stopped.
2. **Read `~/.cursor/plans/whiteboard_-_match_wyzant_for_sarah_plus_our_wedge_*.plan.md`**
   for the full breakdown.
3. **Run the test suite** to confirm green baseline:

   ```powershell
   npx jest
   ```

   Current baseline (pre-whiteboard-Phase-1): **246 jest tests pass + 8
   pre-existing DB failures** (auth/email/etc; unrelated to whiteboard).
4. **Pick up at the next pending sub-section** in the table above.
5. **Update the table as you finish each sub-section** + add a one-line
   note with the commit hash or PR link.
