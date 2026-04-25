# New session bootstrap (tutoring-notes)

**Paste this file (or the block below) at the start of a new agent chat** when you will touch `tutoring-notes`, especially whiteboard or recorder work.

---

## 1) Repo and git (non-negotiable)

- **App root (this is its own `git` repository):**  
  `.../agenticPipeline/pipeline-projects/tutoring-notes`  
  **Not** the monorepo root `agenticPipeline` (different remotes, different history).
- **Default whiteboard / integration branch:** `feature/whiteboard-phase1`  
  **Before a large change:** `git pull origin feature/whiteboard-phase1` in **this** folder so parallel threads (e.g. another Cursor chat) do not clobber work.
- **If `git push` fails** (DNS, timeout): retry **2–3 times** with **2–5s backoff** before treating push as failed. The commit is still local.
- **Latest shipped tip (verify with `git log -1` after pull):** `d4dbbfa` — *Whiteboard: private blob read proxies; wire v2 follow+page; student follow UI* (plus earlier: live sync, resume/draft, etc.).

---

## 2) Authoritative in-repo references

- **Backlog of record (open work, pilot notes, audit items):** `docs/BACKLOG.md`
- **Whiteboard phase-1 handoff (guardrails, blockers, status narrative):** `docs/WHITEBOARD-STATUS.md`
- **Reliability standard (5-axis):** `../../../.cursor/rules/reliability-bar.mdc` (from monorepo root) — apply when changing recorder, uploads, or whiteboard persistence.

---

## 3) Not in git on every machine (local-only)

**Untracked / not pushed (as of 2026-04-24):** `docs/eval/`, `scripts/build-b3b4-transcript-doc.mjs` — do not assume they exist on another clone until someone adds and commits them. Also reflected under **Operational follow-ups** in `docs/BACKLOG.md`.

---

## 4) Whiteboard — quick code map (post–wire v2)

| Concern | Where to look |
|--------|----------------|
| Encrypted live sync, wire message shape, **broadcast extras** (follow + page) | `src/lib/whiteboard/sync-client.ts` |
| Apply remote scene without a **blank remote** stomping local / rebroadcast issues | `src/lib/whiteboard/apply-reconciled-remote-scene.ts` |
| **Private Vercel Blob** in the browser: same-origin read proxies, path scoping | `src/lib/whiteboard/blob-asset-in-scope.ts`, `src/lib/whiteboard/resolve-asset-read-url.ts`, `src/lib/whiteboard/hydrate-remote-files.ts` |
| HTTP routes for assets | `src/app/api/w/[joinToken]/wb-asset/route.ts` (student), `src/app/api/whiteboard/[sessionId]/tutor-asset/route.ts` (tutor) |
| Tutor workspace, wiring **extras** into recorder | `src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceClient.tsx`, `src/hooks/useWhiteboardRecorder.ts` |
| Student joiner, follow UX | `src/app/w/[joinToken]/StudentWhiteboardClient.tsx`, `src/hooks/useStudentWhiteboardCanvas.ts` |
| **Double resume** (stale room gate + IndexedDB): one-shot skip | `src/lib/whiteboard/resume-prompt-flags.ts`, `WorkspaceResumeGate.tsx`, `useWhiteboardRecorder.ts` |

**Still a known gap (see BACKLOG):** full **binary file** parity on the student canvas (images/PDFs in `fileId` / `BinaryFiles`) may need more mirroring of tutor `addFiles` — not the same as wire v2 follow/page.

---

## 5) Process

- **Cross-session / parallel chat:** same branch + pull first; do not treat `agenticPipeline` root as the app’s `git` remote.
- **Day-to-day tickets** are fine; if **BACKLOG** and a ticket disagree, **BACKLOG wins** for “what is still open for this app” (per BACKLOG’s own rules).

---

## 6) One-line mission (from product docs)

Solo- and small-practice **tutors** first; **multi-tenant** scoping is mandatory on every admin/API path. Pilot feedback in BACKLOG (Sarah) is the main prioritization input until broader usage exists.
