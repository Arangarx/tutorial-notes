# Dedupe execution plan — Priority #1 (living tracker)

Priority #1 = eliminate all unjustified duplication site-wide, per [`.cursor/rules/composition-no-duplication.mdc`](../.cursor/rules/composition-no-duplication.mdc).

**Approach (Andrew 2026-07-10):** stability/functionality/responsiveness is priority #1. **Safe + easy + fully-tested** consolidations up front; risky ones **carefully, small chunks, never big-bang.** New work introduces **zero** duplication and reduces what it touches (absolute). Every consolidation ships with exhaustive red/green tests ([`exhaustive-testing-mandate.mdc`](../.cursor/rules/exhaustive-testing-mandate.mdc)) + independent agentic verification ([`agentic-verification-pipeline.mdc`](../.cursor/rules/agentic-verification-pipeline.mdc)) + consumer grep + green `npx next build`.

Source: three read-only audits (2026-07-10) — component/primitive, CSS-ownership, service/hook/util. Waves ordered by **blast radius / safety**, not value.

---

## Wave A — SAFE / mechanical / high-fan-out (do first)

Pure functions and low-risk shared helpers; unit-testable; near-zero regression risk. No fragile surfaces.

**Services / utils (non-UI)**
- Extract `getCookieFromRequest` → `src/lib/http/cookies.ts` (dupes: `learner-session.ts:269`, `account-holder-session.ts:248`).
- Extract `isPrismaUniqueViolation` (P2002) → `src/lib/db/prisma-errors.ts` (3 copies: claim setup, consent actions, request-erasure-by-admin).
- Extract `safeName` → `src/lib/blob-path.ts` (dupes: `recording/upload.ts:51`, `whiteboard/upload.ts:17`).
- Extract `parseClientPayload` → shared blob-upload parse (dupes: `upload/audio`, `upload/blob`).
- One `formatDurationMs` (`H:MM:SS`) → `src/lib/time/` (dupes: `replay-helpers.ts:55`, `WhiteboardReplay.tsx:1586`, `WhiteboardWorkspaceClient` local, plus page-local `formatDuration`s). Reconcile with existing `components/recording/format-duration.ts`.
- `BLOB_MAX_BYTES` magic (`100*1024*1024`) → use `audio-constants.ts` in `concat-audio.ts:117`.
- Billing rounding defaults: collapse to single export surface (`billing/defaults.ts`; drop dup in `rounding.ts`).

**UI (mechanical, no fragile surfaces)**
- `ErrorStateCard` → replace 4 copy-paste error/not-found pages (`error.tsx`, `admin/error.tsx`, `not-found.tsx`, `admin/not-found.tsx`).
- `LegalDocumentShell` → `privacy/page.tsx` + `terms/page.tsx` wrapper (also folds the 35+ inline-spacing debt into the shell).
- `buildAdminNavLinks()` → `src/lib/admin-nav-links.ts` (dupes: `AdminNav`, `AdminSidebarNav` — already drifted).
- Retire `SubmitButton` wrapper → `Button` + `useFormStatus` (8 call sites).
- `StatTile` / `QuickLinkCard` extraction (`admin/page.tsx`, `admin/cost/page.tsx` local copy).
- ~~`tokens.css` dark palette~~ → **✅ DONE** (`f558b145`, 2026-07-27) — see [tokens.css dark-palette approach](#tokenscss-dark-palette-approach-andrew-2026-07-10).
- `NativeSelect` styling: single token-based block; delete hex copies in `whiteboard-chrome.css:3196` + `waiting-room-overlay.css`.

### tokens.css dark-palette approach (Andrew 2026-07-10)

**Facts:** Light is already single-source (`:root, [data-theme=light]`). Dark is duplicated ~95 lines ×2 (`@media prefers-color-scheme: dark` vs `[data-theme=dark]`) in `tokens.css` + same pattern in `shadcn-theme.css`. System mode currently **removes** `data-theme` so CSS `@media` is load-bearing (see `src/lib/theme.ts`).

**Approved approach:**

1. Change theme bootstrap + `ThemeProvider` so preference `"system"` still stores as system, but **always writes resolved** `data-theme="light"|"dark"` on `<html>` (update on `matchMedia` change). Aligns with Tailwind `@custom-variant dark` which already keys only on `[data-theme=dark]`.
2. Delete the duplicated `@media` dark palette blocks in `tokens.css` and `shadcn-theme.css` — keep only `[data-theme=dark]` (and light single block).
3. **Teeth:** Playwright visual baselines (or computed CSS-variable asserts) on 2–3 static surfaces (e.g. login, admin home, privacy) × light + explicit dark + system-with-emulated-prefers-dark. Red-before/green-after. Also update `theme-plumbing.test.ts` expectations if bootstrap script changes.
4. **Andrew eyeball:** same surfaces light/dark/system after merge — [`docs/handoff/DEDUPE-EYEBALL-LIST.md`](handoff/DEDUPE-EYEBALL-LIST.md).

**Status:** ✅ merged `f558b145` (2026-07-27). Andrew eyeball still owed — [`DEDUPE-EYEBALL-LIST.md`](handoff/DEDUPE-EYEBALL-LIST.md) § tokens.css.

## Wave B — admin/account composition (medium risk) — ✅ COMPLETE (2026-07-10)

All 6 chunks executor → Sonnet verifier → `merge --no-ff` to master. Eyeball: [`docs/handoff/DEDUPE-EYEBALL-LIST.md`](handoff/DEDUPE-EYEBALL-LIST.md).

- ✅ `SectionCard` realm prop (`a8a31e46`)
- ✅ `SubNav` realms (`f59a1ead`)
- ✅ `PageShell` + `AppHeader` realms (`f297e092`)
- ✅ `consent-write.ts` (`b0b78582`)
- ✅ `proxy-blob-asset` + `proxy-share-resource` (`6d65edd5`)
- ✅ Kill `/api/upload/audio` → `/api/upload/blob` (`0ce5ff4e`)

## Wave C — whiteboard chrome (higher risk; pair with `@wb-chrome` Playwright)

- Insert modals (`GraphInsertButton` / `MathInsertButton` / `PdfImageUploadButton`) + hand-rolled `role="dialog"` → `Dialog` / `WbInsertDialog` shell.
- Legacy `.btn`/`.card` migration across `WhiteboardWorkspaceClient`, replay, join, review surfaces → `Button`/`Card`.
- `ThemeToggle` variant ← `ThemeToggle` + `WbThemeToggle` (shared `useThemeDropdown`).
- `WbUndoRedoButtons` variant ← `UndoRedoButtons` (legacy) + `WbUndoRedoButtons`.
- **`whiteboard-chrome.css` monolith decomposition** (~3,254 lines) → co-located per-component CSS (BACKLOG `WB-COMPONENTS-PASS`); remove AVTile `!important` reach-ins as each component takes ownership. **Largest single CSS violation.** Fragile — see engine-protection rule.
- Global `.btn`/`.card` (`globals.css`) retire only after consumers migrated; then move survivors into `@layer base` or delete.
- `useExcalidrawThemeFromSystem` → app `useTheme` (aligns TU-12).

## Wave D — A/V chrome (FRAGILE — Opus-grade review; whiteboard-av-reliability + engine-protection rules)

- `WbTopBarMicControl`/`Live` + `WbTopBarCamControl`/`Live` + `AudioControls`/`VideoControls` → parameterized A/V control primitives.
- `AVTile` / `MicControls` / `VideoControls` inline styles → co-located CSS; remove monolith reach-ins.
- Device-enumeration in `useAudioRecorder` fully routed through `enumerate-device-acquire` (cross-ref `DEVICE-PICKER-DEDUPE`, best-effort).
- `StatusPill` primitive ← WB sync-pill / student-connection-pill / `status-colors.ts` (L6).

## NOT duplication (leave / documented-parallel)

`Providers`/`Toaster`/`ThemeProvider` (single); `learner-session` vs `account-holder-session` (separate realms — merge only helpers); `useLiveAV`+coordinator+remote-mic (composition chain); `auth-db` vs `account-holder-auth` (**DECIDED Andrew 2026-07-10: keep** the documented bcrypt-round split — not real duplication); `assertStudentNotErased` vs `...Api` (dual surface); Excalidraw/JSXGraph third-party CSS adapters (keep scoped); hex in `tokens.css`/`BRAND.md`/`token-values.ts` (canonical token/JS-boundary).

## Discipline per consolidation — ZERO regressions (Andrew 2026-07-10, live on master)

Non-negotiable, in order:
0. **Diff-for-identity FIRST.** Before folding any duplicate into a canonical, diff every copy. Context-specific copy, behavior, styling, and functionality differences **must** be preserved as **parameters/props** on the canonical — **never silently dropped.** If the copies genuinely diverge in a way params can't cleanly express, STOP and surface to Andrew.
1. Grep ALL consumers of both the duplicate and the canonical.
2. **Teeth tests** — exhaustive red-before/green-after to spec, real independent oracle, right layer (Playwright for WB/AV/layout/media; unit for pure logic). If you can't test it with teeth, **escalate to Andrew** — do not proceed on hope.
3. **Independent agentic verification** (separate agent: tests-to-spec + soundness + no-dup + no-regression) before "done".
4. Green `npx next build` + affected test gate.
5. **Small chunk** — one consolidation per branch/commit series; no big-bang.
6. Never destabilize a live surface for a refactor. **Zero tolerance for catchable regressions.**

## Doc drift to fix while here
`V1-COMPONENT-LIBRARY.md`: `ThemeToggle` listed "not created" (exists); `PageSizeSelect` "candidate" (already shadcn); Account/Admin section cards "do not consolidate" (conflicts with 2026-07-10 rule).
