# V1 Component Library — Reference Spine

**Authored:** 2026-06-07 (Sonnet subagent, component-spine chunk-1 worktree)
**Branch:** `v1-component-spine`
**Purpose:** Canonical, skimmable component inventory + UX rubric for the V1 redesign. Future agents read and update this doc — it is the consistency contract across all chunk passes.

> **Read before any UI work in this repo.** This doc answers: what components exist, which are canonical, which are duplicates, and what conventions all new surfaces must follow.

**Live gallery (platform maintainer only):** [`/admin/design-system`](/admin/design-system) — organized specimens by composition tier (primitives → patterns → compositions → in-context links). Prefer the gallery over full-site hunting when eyeballing shared components; gallery PASS ≠ surface PASS when page-local CSS still overrides. See also [`docs/handoff/DEDUPE-EYEBALL-LIST.md`](handoff/DEDUPE-EYEBALL-LIST.md).

---

## §0. Canonical Brand Reference

**Approved source of truth for colors and fonts:** `docs/brand-previews/palette-mocks-FINAL-mynka-blue.html`

Andrew has **approved this mock for COLORS and FONTS only** — not as a final component set. The component system evolves from this look and feel; it does NOT diverge from it.

**Light mode tokens (from mock `:root`):**

| Token | Value | Role |
|---|---|---|
| `--brand` | `#1e3d54` | Wordmark, brand fills |
| `--text` | `#15203a` | Primary text |
| `--text-muted` | `#5a6877` | Muted / helper text |
| `--surface` | `#f5f4ec` | Page background (warm cream) |
| `--surface-raised` | `#fcfbf4` | Cards, panels (slightly lighter) |
| `--surface-sunken` | `#ecebe1` | Recessed wells |
| `--border` | `#c5cfd0` | Card/panel borders |
| `--border-strong` | `#4a6680` | Focus rings, ghost-button outlines |
| `--accent` | `#e27d60` | Coral — primary CTA, live dot, active state |
| `--accent-soft` | `#f8e0d6` | AI panel background, pending-action tint |
| `--accent-text` | `#8a3c25` | Text on accent-soft backgrounds |
| `--accent-on` | `#15203a` | Dark text on coral CTA (5.64 AA) |

**Dark mode tokens (from mock `body[data-mode="dark"]`):**

| Token | Value | Role |
|---|---|---|
| `--brand` | `#7ea4b1` | Wordmark on dark |
| `--text` | `#f0ede4` | Warm off-white |
| `--text-muted` | `#a5b5c0` | Cool blue-grey |
| `--surface` | `#051a24` | Near-navy base |
| `--surface-raised` | `#0e2a38` | Cards (raised) |
| `--surface-sunken` | `#021018` | Deepest wells |
| `--border` | `#1c3548` | Borders |
| `--border-strong` | `#6a8fa0` | Focus rings |
| `--accent` | `#e27d60` | Coral (mode-invariant) |
| `--accent-soft` | `#2e1d18` | Deep coral-brown |
| `--accent-text` | `#e8a08a` | Light peach on dark |
| `--accent-on` | `#051a24` | Dark text on coral (6.22 AA) |

**Verify against `src/styles/tokens.css` — if any token drifts from the above values, flag it as a DRIFT and correct toward the mock values.**

**Font stack (from mock):**
- Display: `"Fraunces"` variable font with axes `opsz`, `SOFT`, `wght`
- Body: `"Inter"` weight 400 (V2 — lighter)
- Mono: `"JetBrains Mono"` weight 400/500

**No scheduling in V1.** The mock's Surface 2 shows a "Up next · Aiden K. at 4 PM today" card — this is mock-only illustration and is **explicitly NOT in V1 scope**. Do not implement scheduling UI anywhere in the component pass. The `.dash-upnext` card in the mock is a visual-only placeholder; replace it with the next-actions pattern per the component design doc (pending recaps + start session).

---

## §1. Component Inventory Table

### Shared UI Primitives (shadcn/ui new-york — **frozen foundation 2026-06-11**)

> **Branch:** `v1-design-system`. Full primitive catalog installed via `npx shadcn@latest add`. All primitives are **theme-agnostic** (semantic tokens only; **zero** `dark:` Tailwind variants in `src/components/ui/`). `Toaster` + `TooltipProvider` wired in `Providers.tsx`. Surface-conversion agents **consume** these — do not fork.

| Component | File | Purpose | Dedup Status |
|---|---|---|---|
| `Button` | `src/components/ui/button.tsx` | All interactive buttons (`variant`, `size`) | **canonical** |
| `Input` | `src/components/ui/input.tsx` | Text input fields | **canonical** |
| `Label` | `src/components/ui/label.tsx` | Form field labels (Radix) | **canonical** |
| `Textarea` | `src/components/ui/textarea.tsx` | Multi-line text input | **canonical** |
| `Checkbox` | `src/components/ui/checkbox.tsx` | Boolean toggle (Radix) | **canonical** |
| `CheckboxField` | `src/components/ui/checkbox.tsx` | Checkbox + linked `Label` in a horizontal row (`flex items-center gap-3`) — use for boolean form fields instead of hand-rolled native `<input type="checkbox">` | **canonical** |
| `RadioGroup`, `RadioGroupItem` | `src/components/ui/radio-group.tsx` | Exclusive choice group | **canonical** |
| `Switch` | `src/components/ui/switch.tsx` | On/off toggle | **canonical** |
| `Select` (+ subcomponents) | `src/components/ui/select.tsx` | Dropdown select (Radix) | **canonical** |
| `Card` (+ header/title/description/content/footer/action) | `src/components/ui/card.tsx` | Card container primitives | **canonical** |
| `Badge` | `src/components/ui/badge.tsx` | Status pill / label chip | **canonical** |
| `Alert` (+ title/description) | `src/components/ui/alert.tsx` | Inline banner messages | **canonical** |
| `Dialog` (+ subcomponents) | `src/components/ui/dialog.tsx` | Modal overlay | **canonical** |
| `AlertDialog` (+ subcomponents) | `src/components/ui/alert-dialog.tsx` | Confirmation modal | **canonical** |
| `Sheet` (+ subcomponents) | `src/components/ui/sheet.tsx` | Slide-over panel (mobile nav) | **canonical** |
| `Popover` (+ subcomponents) | `src/components/ui/popover.tsx` | Floating content panel | **canonical** |
| `Tooltip` (+ provider) | `src/components/ui/tooltip.tsx` | Hover hint | **canonical** |
| `DropdownMenu` (+ subcomponents) | `src/components/ui/dropdown-menu.tsx` | Context / action menu | **canonical** |
| `Tabs` (+ list/trigger/content) | `src/components/ui/tabs.tsx` | Tab strip navigation | **canonical** |
| `Accordion` (+ subcomponents) | `src/components/ui/accordion.tsx` | Collapsible sections | **canonical** |
| `Table` (+ header/body/row/cell/…) | `src/components/ui/table.tsx` | Data tables (session list, billing) | **canonical** |
| `Separator` | `src/components/ui/separator.tsx` | Visual divider | **canonical** |
| `Skeleton` | `src/components/ui/skeleton.tsx` | Loading placeholder | **canonical** |
| `Progress` | `src/components/ui/progress.tsx` | Progress bar | **canonical** |
| `Avatar` (+ image/fallback) | `src/components/ui/avatar.tsx` | User/student avatar circle | **canonical** — prefer `StudentAvatar` for roster rows with `--avatar-N` rings |
| `ScrollArea` | `src/components/ui/scroll-area.tsx` | Constrained scroll container | **canonical** |
| `Calendar` | `src/components/ui/calendar.tsx` | Date picker grid (`react-day-picker` v10) | **canonical** — scheduling surface |
| `Toaster` | `src/components/ui/sonner.tsx` | Toast notifications (`sonner`) | **canonical** |

### Admin Layout + Navigation

| Component | File | Purpose | Key Props | Surfaces | Dedup Status |
|---|---|---|---|---|---|
| `AdminNav` | `src/components/AdminNav.tsx` | Sticky top nav for all tutor/admin surfaces. Wordmark left, nav links, sign-out right. Mobile hamburger. **REQ-S3-3:** redesign must add a persistent signed-in identity indicator (display name/email; badge when impersonating or test account) — pairs with `ImpersonationBanner`. | `showOperatorLinks`, `sessionMode`, `isImpersonating`, `showDevTools`, `showCostDashboard` | All `/admin/**` pages via `admin/layout.tsx` | **canonical** |

### Shared layout (cross-realm)

| Component | File | Purpose | Key Props | Surfaces | Dedup Status |
|---|---|---|---|---|---|
| `PageShell` | `src/components/PageShell.tsx` | Realm-parameterized page chrome. **`realm`** selects admin page title + optional sidebar, account full-page shell, student join shell, or parent share shell (`data-page-shell-realm` on root). Admin realm = title block only (nav from `admin/layout.tsx`). Account/student compose `AppHeader`. Share realm uses distinct title typography. | Discriminated union on `realm` (`admin` \| `account` \| `student` \| `share`) — see file for per-realm props | `/admin/**`, `/account/**`, `/join`, `/s/[token]/**` | **canonical — Wave B dedupe; replaces former `AdminPageShell`, `AccountPageShell`, `StudentPageShell`, `ParentShareShell`** |
| `AppHeader` | `src/components/AppHeader.tsx` | Top app chrome (wordmark row). **`realm`** selects account nav (email + sign-out) vs student compact header (`data-app-header-realm`; student keeps `data-testid="student-page-shell-header"`). | `realm` (`account` \| `student`), `userEmail` (account), `actions` (student) | `/account/**` via `PageShell`, `/join` via `PageShell` | **canonical — Wave B dedupe** |
| `SectionCard` | `src/components/SectionCard.tsx` | Section grouping within a page. Wraps shadcn `Card`. Title + optional description + optional actions header + content slot. **`realm`** selects admin vs account styling contract (`data-realm` on root). | `realm` (`admin` \| `account`), `title`, `description`, `actions`, `children`, `className`, `contentClassName`, `id`, `data-testid` | `/admin/**`, `/account/**` | **canonical — Wave B dedupe; replaces former `AdminSectionCard` + `AccountSectionCard`** |
| `SubNav` | `src/components/SubNav.tsx` | In-page section navigation. **`realm`** selects settings left-rail sidebar vs account child horizontal tab strip (`data-realm` on root). | `realm` (`admin-settings` \| `account-child`), `learnerId` (account-child only) | `/admin/settings/**`, `/account/children/[id]/**` | **canonical — Wave B dedupe; replaces former `SettingsSubNav` + `AccountChildNav`** |
| `ShareBrowseAllLink` | `src/components/share/SharePageHelpers.tsx` | Outline CTA link for parent share “browse all notes” header action | `href`, `label`, `className` | `/s/[token]` | **canonical** |
| `ShareDividerLabel` | `src/components/share/SharePageHelpers.tsx` | Accent/muted divider labels between unseen/seen note groups on share pages | `children`, `variant` (`accent` \| `muted`) | `/s/[token]` | **canonical** |

### Account Holder (Parent) Layout

| Component | File | Purpose | Key Props | Surfaces | Dedup Status |
|---|---|---|---|---|---|
| _(account page chrome)_ | `PageShell` `realm="account"` + `AppHeader` `realm="account"` | See **Shared layout** — account realm wraps wordmark nav, email, sign-out, and page title block inside `max-w-4xl` main. | `title`, `description`, `eyebrow`, `actions`, `userEmail`, `children` | `/account/**` pages | **canonical — use `PageShell`, not a fork** |

### Auth Surfaces

| Component | File | Purpose | Key Props | Surfaces | Dedup Status |
|---|---|---|---|---|---|
| `AuthShell` | `src/components/auth/AuthShell.tsx` | Centered card layout for public auth pages (login/signup/forgot/reset/setup) | `children`, misc | `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/setup` | **canonical** |
| `MynkWordmark` | `src/components/auth/MynkWordmark.tsx` | "Mynk·" wordmark using `.wordmark` CSS class + Fraunces font-variation-settings | `size` (sm/md/lg) | Auth shell, `AdminNav`, `AppHeader`, `MarketingHeader` | **canonical** |
| `AuthMortensenNotice` | `src/components/auth/AuthMortensenNotice.tsx` | Legal notice about Google OAuth via mortensenapps.com — **ONLY on Google-OAuth click-points**, NOT on credentials pages | `variant` (connect/signin), `className`, `style` | `OAuthEmailSection` "Connect Gmail" only | **canonical — placement is legally binding (see v1-redesign-STATUS.md)** |
| `AuthFieldError` | `src/components/auth/AuthFieldError.tsx` | Inline field-level error message for form fields | `children`, `id` | Auth form fields | **canonical** |
| `PasswordStrengthField` | `src/components/auth/PasswordStrengthField.tsx` | Password input + strength indicator (zxcvbn). Shared across credential forms. | Props TBD (see file) | Signup, reset-password, change-password | **canonical — use for all 8 credential forms per B1 acceptance criteria** |

### Marketing Surfaces

| Component | File | Purpose | Key Props | Surfaces | Dedup Status |
|---|---|---|---|---|---|
| `MarketingHeader` | `src/components/marketing/MarketingHeader.tsx` | Sticky header for public marketing pages (`/`, `/features`) | `currentPath` | `/`, `/features` | **canonical** |
| `SiteFooter` | `src/components/SiteFooter.tsx` | Public site footer with About/Privacy/Terms/Feedback links | none | Public pages | **canonical** |

### Students

| Component | File | Purpose | Key Props | Surfaces | Dedup Status |
|---|---|---|---|---|---|
| `StudentsRoster` | `src/components/admin/StudentsRoster.tsx` | Student list with search + add student (B2 reskin) | `students`, `adminUserId` | `/admin/students` | **canonical** |
| `StudentAvatar` | `src/components/admin/StudentAvatar.tsx` | Deterministic initials avatar: FNV-1a hash of normalized display name (`trim` + lowercase) → one of eight curated `--avatar-1`…`--avatar-8` fills (`student-initials.ts`); 1–2 letter initials (`studentInitials`); white semibold text; `ring-2 ring-background`. Sizes: `sm` (36px), `md` (44px), `lg` (56px). Same name → same color on every surface. | `name`, `size`, `className` | Student list, student detail, scheduler, account dashboard, learner waiting room | **canonical** |

### Recording / Session Capture (Slice 3 collision zone — DO NOT EDIT from UI chunks)

| Component | File | Purpose | Dedup Status |
|---|---|---|---|
| `MainPanel` | `src/components/recording/MainPanel.tsx` | Recording main control panel | **owned by recording slice 3 — do not edit** |
| `RecordingControlPanel` | `src/components/recording/RecordingControlPanel.tsx` | Recording controls | **owned by recording slice 3 — do not edit** |
| `MicControls` | `src/components/recording/MicControls.tsx` | Mic on/off + level | **owned by recording slice 3 — do not edit** |
| `UploadingPanel` | `src/components/recording/UploadingPanel.tsx` | Upload progress panel | **owned by recording slice 3 — do not edit** |
| `ErrorCard` | `src/components/recording/ErrorCard.tsx` | Recording error state | **owned by recording slice 3 — do not edit** |
| `DoneCard` | `src/components/recording/DoneCard.tsx` | Recording done state | **owned by recording slice 3 — do not edit** |
| `SessionCostPanel` | `src/components/admin/SessionCostPanel.tsx` | Per-session AI cost display | **owned by recording slice 3 — do not edit** |

### Whiteboard (Slice 3 collision zone + live session — DO NOT EDIT from UI chunks)

| Component | File | Dedup Status |
|---|---|---|
| `WhiteboardReplay` | `src/components/whiteboard/WhiteboardReplay.tsx` | **owned by recording slice 3 — do not edit** |
| `WhiteboardNotesPanel` | `src/components/whiteboard/WhiteboardNotesPanel.tsx` | **owned by recording slice 3 — do not edit** |
| `TutorNotesSection` | `src/components/whiteboard/TutorNotesSection.tsx` | **owned by recording slice 3 — do not edit** |
| `ExcalidrawDynamic` | `src/components/whiteboard/ExcalidrawDynamic.tsx` | **live session — do not edit from UI chunks** |
| `PageStrip` | `src/components/whiteboard/PageStrip.tsx` | **live session — do not edit from UI chunks** |
| Others in `whiteboard/` | various | **do not edit from UI chunks** |

### A/V

| Component | File | Purpose | Dedup Status |
|---|---|---|---|
| `AVTilesPanel`, `AVTile`, `AVControls`, `AVPermissionsPrompt`, `VideoControls` | `src/components/av/` | Live A/V session components | **live session — do not edit from UI chunks** |

### Utilities

| Component | File | Purpose | Dedup Status |
|---|---|---|---|
| `ImpersonationBanner` | `src/components/ImpersonationBanner.tsx` | Operator impersonation indicator bar | **canonical** |
| `SubmitButton` | `src/components/SubmitButton.tsx` | Simple form submit button (pre-B1 era, some pages still use) | **candidate-for-consolidation** — new code should use `<Button>` from `ui/button.tsx`; migrate opportunistically |
| `ThemeInit` | `src/components/ThemeInit.tsx` | **Dev-only** theme bootstrap (`?theme=light\|dark` + `tutoring-notes-dev-theme` localStorage). System `prefers-color-scheme` is CSS-only (`tokens.css`). **Not** the user-facing toggle — see `ThemeToggle` below. | **canonical (dev-only path)** |
| **`ThemeToggle`** (planned) | `src/components/ThemeToggle.tsx` *(not yet created)* | **Component-library deliverable (pre-master).** Discoverable light/dark control (topbar or settings); persists user choice to localStorage; first visit defaults to system preference; sets `data-theme` on `<html>`. Replaces dev `?theme=` as the user mechanism. | **canonical target — ship before `v1-redesign → master`** |
| `Providers` | `src/components/Providers.tsx` | Root client providers (session, theme, etc.) | **canonical** |
| `LocalDateTimeText` | `src/components/LocalDateTimeText.tsx` | Client-rendered local datetime from UTC | **canonical** |
| `ModalPortal` | `src/components/ModalPortal.tsx` | Portal for modals | **canonical** |

### Notes

| Component | File | Purpose | Dedup Status |
|---|---|---|---|
| `ParentShareNoteCard` | `src/components/notes/ParentShareNoteCard.tsx` | Note card on parent share view | **canonical** |
| `AiGeneratedNoteReviewGate` | `src/components/notes/AiGeneratedNoteReviewGate.tsx` | Gate for AI-generated note review (pre-slice-3 Cancel/dismiss) | **candidate — fold into B4 post-session controls** |
| `TutorStudentNoteExpandedBody` | `src/components/notes/TutorStudentNoteExpandedBody.tsx` | Expanded note body (structured fields, `pre-wrap`) | **canonical** for student notes list — **not** for markdown `TutorNote.content` |
| `NotesSearchBar` | `src/components/notes/NotesSearchBar.tsx` | Notes search | **canonical** |
| `PageSizeSelect` | `src/components/notes/PageSizeSelect.tsx` | Pagination size selector | **candidate-for-consolidation** — consider shadcn Select |
| **`FormattedNotesBody`** (planned) | `src/components/notes/FormattedNotesBody.tsx` *(not yet created)* | **Canonical** rendered-markdown display for AI session notes: parses MD → styled headings/lists inside `.ai-prose` (`src/styles/typography.css`). **REQ-S3-1** — slice 3 smoke found `TutorNotesSection` shows raw source; B4 must route all auto-notes through this (or alias `RecapEditor` read-only mode). **REQ-S3-4** — section headings must match the canonical schema (topics / assessment / plan / links + vetted additions), not slice-3's dropped-field markdown shape. **No duplicate raw-MD renderer.** | **canonical target — implement at Chunk 3** |
| **`RecapEditor`** (planned) | per [`v1-component-redesign-design-2026-05-31.md`](handoff/v1-component-redesign-design-2026-05-31.md) §5.5 | B4 session-detail recap panel: `.ai-prose`, editable inline, Regenerate. May compose `FormattedNotesBody` + edit chrome. **REQ-S3-4** — editor field model must align with canonical schema; cross-ref **REQ-S3-2** Save/Cancel. | **canonical target — Chunk 3** |
| `NewNoteForm` | `src/app/admin/students/[id]/NewNoteForm.tsx` | Structured note create/edit; **"Save note"** submit (pre-slice-3 manual WB flow). **REQ-S3-4** — baseline canonical field set (topics / assessment / plan / links; homework optionally folded into Plan per Sarah pilot feedback). | **canonical** for structured `SessionNote` fields — reference for Save affordance and schema baseline |
| `WhiteboardNotesPanel` | `src/components/whiteboard/WhiteboardNotesPanel.tsx` | Pre-slice-3 manual generate → review → Save/Cancel flow | **superseded by auto-notes** — B4 replaces with post-session controls per **REQ-S3-2** (see also §4 lock list) |
| `TutorNotesSection` | `src/components/whiteboard/TutorNotesSection.tsx` | Slice 3 auto-notes polling UI (raw MD bug; slice-3 markdown schema diverges from canonical fields per **REQ-S3-4**) | **owned by recording slice 3 — redesign absorbs into Chunk 3, do not patch ad hoc** (see also §4 lock list) |

---

## §1A. Ratified Primitive Spec

> **Purpose:** This section defines the design-token patterns for the fundamental UI primitives — the building blocks every surface draws on. Derived from the six-surface final mock (`docs/brand-previews/palette-mocks-FINAL-mynka-blue.html`) and the prose design spec (`docs/handoff/v1-component-redesign-design-2026-05-31.md`). All specs are theme-agnostic (tokens only, no `dark:` or hardcoded values). Every surface B2–B6 builds from these primitives toward the mock-faithful target (see §5 migration checklist).

---

### 1A.1 Primary CTA button (coral)

**Mock source:** `.btn-primary { background: var(--accent); color: var(--accent-on); border-radius: 999px; }`

**Library:** `<Button variant="accent">` — `bg-primary text-primary-foreground hover:bg-accent-strong rounded-full` (maps to `--accent` fill + `--accent-on` foreground via `--primary-foreground`). **Do not** hand-roll coral pills with `rounded-full` on `variant="default"`; do not use `bg-accent` for the fill (`bg-accent` is `--accent-soft`, not coral).

**Foreground contract (WCAG — hard to regress):** `--accent-on` = dark text on coral in **both** themes: light `#15203a` (5.64:1 AA), dark `#051a24` (6.22:1 AA). Never light/cream text on coral (`#fcfbf4` on `#e27d60` fails). Token lives in `tokens.css`; shadcn `--primary-foreground` aliases it. For `Button asChild` + `<Link>`, `globals.css` excludes `[data-slot="button"]` from `a { color: inherit }` so link CTAs keep `--accent-on` instead of inheriting body text.

**Token class (legacy / non-Button only):** `bg-primary text-primary-foreground hover:bg-accent-strong rounded-full font-medium transition-colors`

| Size | Classes | Use when |
|---|---|---|
| Large (`btn-lg`) | `px-5 py-2.5 text-base min-h-11` | Hero CTAs, full-page action moments |
| Default | `px-4 py-2 text-sm min-h-11` | Most surfaces: dashboard, session start |
| Small (`btn-sm`) | `px-3 py-1.5 text-xs min-h-9` | Nav bar, inline compact contexts |

**Usage:** "Start session", "Share with parent", "Start free trial", "Ready to record →", "Save changes" (primary form submit). The coral CTA is the highest-signal action on the page — one per view where possible.

**NOT used for:** Active tool selection (uses inverse colors, see 1A.9), destructive actions (use `destructive` variant), secondary ghost actions.

---

### 1A.2 Ghost / outline button

**Mock source:** `.btn-ghost { background: transparent; color: var(--text); border: 1px solid var(--border-strong); border-radius: 999px; }`

**Token class:** `border border-border-strong bg-transparent text-foreground hover:bg-muted/60 rounded-full font-medium transition-colors`

**Usage:** "See a sample recap", "Continue last whiteboard", "Cancel", "← Back", secondary pairings alongside a coral CTA. The ghost/coral pairing is the canonical two-CTA pattern (mock Surface 1 hero, Surface 3 pre-session actions).

---

### 1A.3 Accent strip (AI / pending-action signal)

**Mock source:** `.dash-pending-summaries, .pre-context, .mkt-visual-summary { background: var(--accent-soft); border-left: 3px solid var(--accent); border-radius: 0 var(--radius-md) var(--radius-md) 0; }`

**Token class:** `bg-accent-soft border-l-[3px] border-accent rounded-r-[10px] p-3 pl-4`

The accent strip is the consistent visual signal for two cases — AI-generated content and pending-action prompts. Both get the same treatment so users learn the pattern.

| Label inside strip | Token class |
|---|---|
| Eyebrow label ("AI summary", "3 recaps waiting") | `text-[10px] font-mono font-semibold uppercase tracking-widest text-accent-text mb-1` |
| Body text (AI prose) | `.ai-prose text-foreground text-sm` (Fraunces serif for AI) |
| Body text (action prompt) | `text-sm text-foreground font-normal` (Inter for pending-action) |
| CTA link inside | `text-sm font-medium text-accent-text underline-offset-2 hover:underline` |

**Usage — where this pattern appears:**
- Dashboard: pending recaps strip ("3 recaps waiting — Maya, Devon, Emma. [Review all →]")
- Pre-session: last-session context memory strip
- Session detail: editable/AI-generated recap sections (`cursor-text`, hover ring `ring-2 ring-accent inset`)
- Marketing: "AI summary so far" mini panel in hero visual
- Whiteboard session: any in-session AI/context hint panels

---

### 1A.4 Brand-bg card ("Up next" / primary next-action)

**Mock source:** `.dash-upnext { background: var(--brand); color: var(--surface); border-radius: var(--radius-md); padding: var(--space-4) var(--space-5); }`

**Token class:** `bg-brand text-brand-on rounded-[10px] p-4 pl-5`

This is the one surface where the brand navy fills a card background — use sparingly (one per view). In the mock it holds the "Up next" session card. In V1 (no scheduling) it holds the primary "Start a session" CTA.

| Sub-element | Token class |
|---|---|
| Label ("Up next · 4 PM") | `text-[10px] font-mono font-medium uppercase tracking-widest opacity-70 mb-2` |
| Name heading | `font-display text-[22px] font-bold tracking-tight leading-[1.1] mb-2` (Fraunces heading) |
| Sub-detail | `text-[13px] font-mono opacity-80 mb-4` |
| CTA inside | `bg-accent text-accent-on rounded-full px-4 py-2 text-[13px] font-medium inline-flex items-center gap-2` |

Note: `text-brand-on` = `var(--surface)` (cream on light / near-navy text on dark). Map this alias in `shadcn-theme.css` if not yet present.

---

### 1A.5 Stat tile (data-unit card)

**Mock source:** `.dash-stat { padding: var(--space-4) var(--space-5); border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface-raised); }`

**Token class:** `bg-card border border-border rounded-[10px] px-5 py-4`

| Sub-element | Token class |
|---|---|
| Label ("This week", "Active students") | `text-[11px] font-mono font-medium uppercase tracking-widest text-muted-foreground mb-2` |
| Value number | `font-display text-[28px] font-bold tracking-tight leading-none text-foreground` (Fraunces heading) |
| Delta positive ("+3 vs last week") | `text-[11px] font-mono text-accent-text mt-2` |
| Delta neutral | `text-[11px] font-mono text-muted-foreground mt-2` |

Stats grid: `grid grid-cols-4 gap-3 mb-6` (responsive: `sm:grid-cols-2`).

---

### 1A.6 Session status pill / badge

**Mock source:** `.dash-session-status { font-mono uppercase; padding: 3px 7px; border-radius: 999px; }` — active = `accent-soft bg + accent-text`; done = `border border-border text-muted`.

| State | Token class |
|---|---|
| Active/ready ("Recap ready", "Live") | `bg-accent-soft text-accent-text rounded-full px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest whitespace-nowrap` |
| Done/sent | `border border-border text-muted-foreground rounded-full px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest whitespace-nowrap` |

---

### 1A.7 Session row (list item)

**Mock source:** `.dash-session { display: grid; grid-template-columns: 32px 1fr auto auto; gap: var(--space-3); padding: var(--space-3) var(--space-4); border-bottom: 1px solid var(--border); }`

**Token class:** `grid grid-cols-[32px_1fr_auto_auto] items-center gap-3 px-4 py-3 border-b border-border hover:bg-muted/40 cursor-pointer last:border-b-0 transition-colors`

| Column | Token class |
|---|---|
| Avatar circle | `w-8 h-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-xs font-semibold border border-border` (use `--avatar-N` for `StudentAvatar`) |
| Name | `text-sm font-medium text-foreground` |
| Subject / sub-detail | `text-xs text-muted-foreground mt-0.5` |
| Status pill | see 1A.6 |
| Timestamp | `text-[11px] font-mono text-muted-foreground whitespace-nowrap` |

Panel wrapping rows: `bg-card border border-border rounded-[10px] overflow-hidden` (the parent `.dash-panel` in mock).

---

### 1A.8 Left sidebar nav (tutor dashboard shell)

**Mock source:** `.dash-sidebar { background: var(--surface-raised); border-right: 1px solid var(--border); padding: var(--space-5); display: flex; flex-direction: column; gap: var(--space-5); width: 220px; }`

This is the **mock-faithful tutor shell** — Surface 2 uses a permanent 220px left sidebar, NOT a top-nav-only layout. The B2 redesign must switch to this shell.

**Outer container:** `w-[220px] flex flex-col gap-5 bg-card border-r border-border p-5 min-h-screen`

| Sub-element | Token class |
|---|---|
| Wordmark | `.wordmark text-[22px] mb-3` |
| Section label ("Today", "Library", "Account") | `text-[10px] font-mono font-semibold uppercase tracking-widest text-muted-foreground mb-2 ml-2` |
| Nav group | `flex flex-col gap-0.5 mb-3` |
| **Nav link (default)** | `flex items-center gap-2 px-2.5 py-1.5 rounded-sm text-[13px] font-medium text-foreground hover:bg-muted/60 transition-colors min-h-[32px]` |
| **Nav link (active)** | `bg-accent-soft text-accent-text` (add to base) |
| Nav icon | `text-[12px] font-mono w-4 text-center opacity-60` (active: `opacity-100`) |

**User identity chip (bottom — satisfies REQ-S3-3):**

```
mt-auto border border-border rounded-[10px] p-3 flex items-center gap-3 bg-background
```

| Chip sub-element | Token class |
|---|---|
| Avatar circle | `w-8 h-8 rounded-full bg-brand text-[color:var(--surface)] flex items-center justify-center text-[13px] font-semibold` |
| Name | `text-[13px] font-medium text-foreground` |
| Role / email | `text-[11px] font-mono text-muted-foreground mt-0.5` |
| Impersonation badge | `ml-auto text-[10px] font-mono uppercase tracking-wider bg-destructive/10 text-destructive rounded px-1.5 py-0.5` |

**Mobile (≤768px):** sidebar collapses to hidden; top nav `AdminNav` (or a hamburger variant) takes over. Grid: `grid-cols-1` below breakpoint.

---

### 1A.9 Toolbar / icon-control button (whiteboard)

**Mock source:** `.rec-tool { width: 26px; height: 26px; font: 11px var(--font-mono); color: var(--text-muted); border-radius: 4px; }` / `.rec-tool.is-active { background: var(--text); color: var(--surface); }`

The active-tool state uses **inverse colors** (dark/navy bg + cream text) — NOT coral. This is a firm boundary.

| State | Token class |
|---|---|
| Default | `w-9 h-9 flex items-center justify-center rounded-md bg-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground cursor-pointer transition-colors` |
| **Active** | **`bg-foreground text-background`** |
| Touch size (TM-10) | `w-12 h-12` (48px) |
| Focused | `ring-2 ring-ring ring-offset-1` |
| Disabled | `opacity-50 cursor-not-allowed` |

**Strip container:** `bg-card border-r border-border flex flex-col items-center py-2 gap-0.5`

**Floating mini toolbar:** `bg-background border border-border rounded-md p-1 flex gap-0.5`

**Full visual design spec:** [`docs/handoff/whiteboard-chrome-p1.2-visual-design-2026-06-08.md`](handoff/whiteboard-chrome-p1.2-visual-design-2026-06-08.md)

---

### 1A.10 Chip toggle (multi-select preset button)

Used in Properties popover (More styles tier): roughness, edge type, fill mode, stroke style, font size, arrowheads, etc.

| State | Token class |
|---|---|
| Default | `border border-border bg-transparent text-foreground text-xs h-7 px-2 rounded-md font-medium` |
| Selected | `bg-foreground text-background border-foreground` |
| Hover | `hover:bg-muted/60` |

Chip groups: `flex gap-1` inline.

---

### 1A.11 Popover / context menu container

| Type | Token class |
|---|---|
| Properties popover | `w-60 p-3 bg-popover border border-border shadow-md rounded-[10px]` |
| Overflow panel | `min-w-[180px] p-1 bg-popover border border-border shadow-md rounded-[10px]` |
| Context menu | `min-w-[160px] p-1 bg-popover border border-border shadow-md rounded-[10px]` |
| Popover menu item | `w-full flex items-center justify-between gap-3 px-3 py-1.5 text-sm rounded-sm text-foreground hover:bg-muted/60 font-normal cursor-pointer` |
| Destructive menu item | `text-destructive hover:bg-destructive/10` (add to base) |
| Keyboard shortcut hint | `text-xs font-mono text-muted-foreground ml-auto` |
| Section separator | `h-px my-1 bg-border` |

---

### 1A.12 Persistent signed-in identity chip (REQ-S3-3)

The user identity chip in the sidebar (1A.8) IS this primitive — it satisfies REQ-S3-3. On surfaces without a sidebar (auth, marketing, student join), identity is shown in `AdminNav` / `AppHeader` account realm via avatar + name display or email. The chip always shows:
1. Current user's display name / email
2. Current role (Tutor / Admin / AccountHolder / Student)
3. Impersonation badge when `isImpersonating: true` (distinct from `ImpersonationBanner` which is a page-level alert)

---

## §2. UX Rubric — Consistency Contract

**Future chunks MUST follow these conventions. Deviating requires updating this doc and stating why.**

### 2.1 Layout & Spacing

- **Page max-width (admin/tutor shell):** `max-w-6xl` (1152px) with `xl:max-w-7xl` (1280px) at xl breakpoint — set on `admin/layout.tsx` `<main>`; centered with `mx-auto px-4 py-6 md:px-6 md:py-8`. Other realms (account, marketing) may use narrower widths per surface.
- **Page max-width (legacy default):** `max-w-4xl` (896px) where a surface has not yet adopted the admin shell width.
- **Section spacing:** `gap-8` between `PageShell` page-title block and content (admin/account realms); `gap-6` between sibling `SectionCard` components and between sidebar rail and main column (`PageShell` admin `sidebar` layout)
- **Form field spacing within a section:** `space-y-4` (between field groups), `space-y-1.5` (between label and input)
- **Content max-width within cards:** `max-w-md` or `max-w-lg` for form fields; never full card width for narrow inputs
- **Mobile:** single-column; cards stack naturally. Min touch target: `min-h-11` (44px)

### 2.2 Page Shell Pattern

Every tutor/admin page uses `PageShell realm="admin"` inside the `admin/layout.tsx` main container:

```tsx
<PageShell realm="admin" title="Settings" description="Manage your account and preferences.">
  <SectionCard realm="admin" title="Profile" description="Your display name and password.">
    {/* form content */}
  </SectionCard>
</PageShell>
```

- `AdminNav` is provided by `admin/layout.tsx` — never add a second nav inside a page
- `PageShell` admin realm handles the `<h1>` — never write a raw `<h1>` inside page content
- The `eyebrow` prop renders a back-link or breadcrumb above the `<h1>`

### 2.3 Card-Usage Convention — CRITICAL (Andrew's explicit guidance, reconciled with mock)

**The settings NAV/INDEX (the page listing Profile, Email, 2FA, etc.) MUST NOT be card-heavy.**

Andrew's approved mock (Surface 2 — dashboard) demonstrates the "variety of usage" he likes:
- Dashboard **stat tiles** (`.dash-stat`): each is a distinct data unit → cards appropriate
- Dashboard **session list panel** (`.dash-panel` + `.dash-session` rows): the panel is a card, but individual rows are NOT cards — they are horizontal rows with `border-bottom` separators, hover highlight only
- Dashboard **pending summaries**: uses accent-soft left-border strip (NOT a full card) for AI/pending-action signal
- **Marketing feature grid** (`.mkt-feature`): feature cells in a grid → light cards appropriate
- **Session detail** (`.session-summary-card`, `.session-side-panel`): content subsections → cards appropriate

**What the mock does NOT show:** A settings index with every nav item wrapped in a card. The mock's "variety" includes plain horizontal rows (`.dash-session`), borderless sections, and minimal nav links alongside cards — cards are contextually used for distinct content units, not for every grouping.

**Site-wide rule:**

| Surface type | Card appropriate? | Pattern to use |
|---|---|---|
| Navigation index (Settings index, sub-nav list) | **No** — over-chrome | Plain list with `<Link>` rows. Hover: `hover:bg-muted/60` row highlight, no card border. Group with a section divider or heading if needed. |
| Content subsections within a page (Profile form, Email form) | **Yes** | `SectionCard` — groups and labels the subsection clearly |
| Stat/metric tiles on a dashboard | **Yes** | Raised-surface card (`.dash-stat` pattern) — each is a distinct numerical unit |
| Data rows within a list/panel | **No** — row styling only | `border-b border-border` row with hover background, inside a card container |
| Pending-action / AI signal | **Partial** — strip, not card | `accent-soft` tinted strip with `border-l-4 border-accent` (`.dash-pending-summaries` mock pattern) |
| Primary action on landing/dashboard | **Yes** | `SectionCard` or custom card for each distinct action unit |
| Operator/debug pages (Feedback, Waitlist) | **Minimal** | One `AdminPageShell` + one `SectionCard` for the list; individual items = row styling |

**Current card usage audit (as of chunk 1):**
- Landing/marketing page (Phase D): cards for feature grid — **appropriate** per mock
- Dashboard B2 reskin: `SectionCard` for pending recaps + recent sessions — **appropriate** (distinct action units per mock pattern)
- Settings index (pre-chunk-1): wraps every nav item in `className="card"` — **over-chrome; corrected in chunk 1**
- Settings sub-pages (post-chunk-1): `SectionCard` per logical form group — **appropriate**

### 2.4 Typography Roles (from approved mock)

| Role | CSS class | Font variation | Usage |
|---|---|---|---|
| Wordmark "Mynk·" | `.wordmark` | Fraunces `opsz 144, SOFT 60, wght 700` | `<AdminNav>`, `<MynkWordmark>`, auth header |
| Page title (h1) | `.heading` | Fraunces `opsz 144, SOFT 0, wght 700` | `AdminPageShell title` prop |
| Section heading (h2/h3) | Tailwind `text-lg font-semibold text-foreground` | Inter 600 | `SectionCard` title |
| Body text | `text-base text-foreground` | Inter 400 (V2 weight) | Page descriptions, form helper text |
| Muted body | `text-sm text-muted-foreground` | Inter 400 | Secondary descriptions |
| Form label | `text-sm font-medium leading-none` | Inter 500 | shadcn `Label` |
| Eyebrow / metadata | `.label-mono` | JetBrains Mono 500 | Timestamps (`.dash-stat-label`, `.dash-session-when`, `.rec-timer`), session metadata, status badges |
| AI prose | `.ai-prose` | Fraunces `opsz 14, SOFT 30, wght 400` | AI-generated content blocks (summaries, recaps — `.session-summary-section p`, `.parent-prose`) |
| Quote/italic prose | Fraunces `opsz 144, SOFT 30, wght 500` italic | Fraunces italic | Testimonials, pull quotes (mock: `.mkt-quote-body`) |

### 2.5 Nav Patterns

- **Active link:** `bg-accent-soft text-foreground`
- **Inactive link:** `text-muted-foreground hover:bg-muted hover:text-foreground`
- **Min height on all nav links:** `min-h-11` (44px touch target)
- **Settings sub-nav:** Use `<nav>` with role-appropriate `aria-label`. On mobile, settings sub-pages show an eyebrow back-link to "← Settings" via `AdminPageShell eyebrow` prop rather than a persistent sidebar.

### 2.6 Button Naming Conventions

| Context | Variant | Text pattern |
|---|---|---|
| Primary form submit | `default` (blue) | "Save [thing]", "Update [thing]" |
| Primary CTA on landing/empty states | `default` or custom coral | "Start a session →", "Add student" |
| Destructive action | `destructive` | "Delete [thing]", "Disconnect Gmail" |
| Secondary / cancel | `outline` | "Cancel" |
| Navigation-as-button | `ghost` | "← Back", "← All settings" |
| Sign out | `ghost` with `hover:text-destructive` | "Sign out" |

### 2.7 Form Field Pattern

Standard form field group:

```tsx
<div className="space-y-1.5">
  <Label htmlFor="field-id">Field label</Label>
  <Input id="field-id" name="fieldName" type="text" ... />
  <p className="text-sm text-muted-foreground">Helper text here.</p>
</div>
```

Error state: set `aria-invalid="true"` on the `Input`; display error text below with `role="alert"` or via `AuthFieldError`. Never use inline `style={{color: 'var(--sign-out-hover-text)'}}` for errors — use `text-destructive` class.

### 2.8 Empty / Loading / Error States

| State | Pattern |
|---|---|
| Loading | Skeleton matching content shape (Tailwind `animate-pulse bg-muted rounded`) |
| Empty list | `<p className="text-sm text-muted-foreground py-4">No [items] yet.</p>` |
| Form success | `<p className="text-sm text-success mt-2">Saved.</p>` |
| Form error | `<p className="text-sm text-destructive mt-2" role="alert">{error}</p>` |
| Network / server error | Inline banner, never swallowed silently |

### 2.9 Token Usage

- Always use structured tokens (`--surface-1`, `--text-default`, `--border-default`) or Tailwind semantic classes (`bg-card`, `text-foreground`, `border-border`)
- **Never use raw hex values** in component files (ESLint hex-ban active)
- Never use legacy aliases (`--bg`, `--panel`, `--text`) in new code
- Coral accent (`bg-accent text-accent-on`) for primary CTAs only

### 2.10 Component Chunk 1 smoke feedback (2026-06-07)

**Source:** Andrew functional smoke of Component Chunk 1 (Settings + operator surfaces), 2026-06-07. **Not** chunk-by-chunk visual approval — inputs for the **cohesive visual review** per §3 Review protocol. Pointer in [`docs/handoff/v1-redesign-STATUS.md`](handoff/v1-redesign-STATUS.md) § 2026-06-07 checkpoints.

| # | Feedback | Pass / priority |
|---|---|---|
| 1 | **Settings nav pattern** — evaluate a **left settings sub-nav** (GitHub/Stripe/Linear pattern) vs the current chevron-row list, for a settings area at this scale. Pairs with the sidebar shell coming in Chunk 2. | Cohesive pass + Chunk 2 shell |
| 2 | **Sub-page density/hierarchy** — settings sub-pages feel cluttered and hard to parse; everything on the same justification, no indentation/visual hierarchy. Reskin only swapped components; **layout/hierarchy/density were not redesigned** and need work in the cohesive pass. | Cohesive pass |
| 3 | **Email OAuth notice placement** — the "handled through mortensenapps.com" text should sit **above** the Connect-Gmail button (or inside it); users click the button before reading text beneath it. | Cohesive pass (legal binding — see v1-redesign-STATUS Auth-via-mortensenapps.com notice) |
| 4 | **Color usage** — current reskin is very **monochrome** vs the mock's color variety; cohesive pass should bring in the mock's color usage. | Cohesive pass |
| 5 | **Warning color shade** — reads as **yellow rather than amber**; tune the shade (token fix works; it's not black). | Cohesive pass / token tweak |
| 6 | **Input validation-state coloring (OPEN)** — Andrew expected possible **input validation-state coloring / password-strength indicator** (red/yellow/green bar); never built. **Open question:** do we want validation-state coloring on inputs? **Not a bug.** | Low priority — decide in cohesive pass |
| — | **Runbook correction** — there is **no** admin "outbox" page; that smoke runbook line was an error. Chunk 1 surfaces corrected in §3 tracker. | N/A |

### 2.11 Theme-agnostic components — HARD per-component acceptance gate (Andrew 2026-06-07)

**Architectural principle (Andrew 2026-06-07):** components must be **theme-agnostic**. A component references **only** semantic design tokens / CSS variables (e.g. `var(--surface-base)`, `var(--text-default)`, Tailwind semantic classes like `bg-card`, `text-foreground`) and contains **no reference to "light" or "dark"** — no `dark:` Tailwind variants keyed to a named theme, no `prefers-color-scheme` checks in component code, no `if (theme === 'dark')` styling branches. All theme-specific values live **only** in the token-definition layer (`src/styles/tokens.css`, `src/styles/shadcn-theme.css`), swapped by `[data-theme="…"]` on `<html>`. Components therefore respond automatically to **any** theme — light, dark, or a future theme — with zero component changes. The architecture is **N-theme-capable**, not just light/dark.

**Binding build standard:** slot the theme toggle wherever it makes sense, but **every component is designed and verified for both current themes as it is built** — there is **no separate pass** that touches everything again just to add theming.

#### Boundary exceptions (narrow — not loopholes)

1. **Token-definition layer** (`tokens.css`, `shadcn-theme.css`) — the **one** place theme names and per-theme values exist. By design.
2. **JS boundary adapters** that pass a value to something that isn't CSS may read the active theme, but **must** get it from the central `useTheme` (never hardcode or branch inline in components):
   - **Excalidraw `theme` prop** — Excalidraw only accepts `"light"|"dark"`; the adapter hook maps app-theme → its binary API.
   - **`ThemeToggle` UI** — the control itself.
   - **Raw color/asset handed into JS/canvas** rather than CSS.

#### Migration target — `dark:` variants are debt

~30 existing Tailwind `dark:` usages **violate** the theme-agnostic principle (they encode "dark" in component code). The `@custom-variant` bridge (makes `dark:` follow `[data-theme=dark]`) is an **interim** fix. The **pure end-state** is migrating those usages to token-driven classes so the literal word `dark` leaves component code entirely. Do this opportunistically as those components are touched in the component pass — **not** as a separate sweep.

#### Acceptance gate (HARD — not optional polish)

A redesigned or new **component or page is NOT done** until it is **theme-agnostic per the principle above** and **designed AND verified in BOTH light and dark** in the same build slice. Theme parity is checked **per component** as each surface ships — not deferred to a cohesive visual review or a later theming sweep.

| Rule | Requirement |
|---|---|
| **Done definition** | Theme-agnostic (tokens only, no `light`/`dark` in component code) **and** both themes verified before the component/page is marked complete in this tracker or handed off as smoke-ready. |
| **Theming mechanism** | **MUST** go through design tokens / CSS variables / `[data-theme]` on `<html>` (`src/styles/tokens.css`, `src/styles/shadcn-theme.css`). **NEVER** OS-only `prefers-color-scheme` or bare Tailwind `dark:` that keys off system preference instead of `[data-theme=dark]` — and **prefer eliminating `dark:` entirely** in favor of tokens (see migration target above). |
| **No retrofit pass** | There will be **no** standalone "theming pass." Theme-agnostic + both-theme verification are built in with each component. |
| **Agent enforcement** | [`.cursor/rules/both-theme-components.mdc`](../.cursor/rules/both-theme-components.mdc) — scoped to component/page source. |

#### Foundational theme plumbing — FIRST slice of the component pass (done once)

Ship **before** later component chunks so every surface inherits correct theming. **Not** a standalone touch-everything sweep — one foundational slice, then per-component work inherits it:

1. **Tailwind `@custom-variant`** — `dark:` follows app selection, e.g. `@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));` (fixes ~30 existing `dark:` usages that today key off OS, not toggle).
2. **`useTheme` provider** — persisted user choice in localStorage; first visit defaults to system `prefers-color-scheme` until the user picks; sets `data-theme` on `<html>`.
3. **FOUC-safe bootstrap** — promote `ThemeInit` from dev-only `?theme=` hook to production FOUC-safe init (read stored preference before paint).
4. **Excalidraw hook** — extend/replace `useExcalidrawThemeFromSystem` so Excalidraw `theme` follows **app-selected** theme, not OS-only (**TU-12**; resolves BACKLOG:307).
5. **`ThemeToggle` UI** — discoverable control wired into `AdminNav` / account settings (§1 inventory); replaces dev `?theme=` as the user mechanism.

Token palettes for light + dark already exist via `[data-theme]` + `prefers-color-scheme` fallbacks in `tokens.css` / `shadcn-theme.css`. The gap is the **user-facing control plane** — this slice closes it once.

#### Per-component build checklist

- Use semantic tokens (`bg-card`, `text-foreground`, `--surface-*`) — never raw hex, OS-only color branches, or `light`/`dark` references in component code (no `dark:` variants; migrate existing `dark:` to tokens when touching a file).
- Smoke or screenshot **both** `[data-theme=light]` and `[data-theme=dark]` before marking the surface done.
- **Whiteboard:** Mynk chrome + Excalidraw `theme` prop follow app selection (**TU-12** in [`whiteboard-chrome-requirements.md`](handoff/whiteboard-chrome-requirements.md); design: [`whiteboard-chrome-design-2026-06-07.md`](handoff/whiteboard-chrome-design-2026-06-07.md)).
- **Backlog of record:** [`BACKLOG.md`](BACKLOG.md) § V1 redesign — pre-master requirements.

### 2.12 Single-source-of-truth components — no duplication (HARD gate, Andrew 2026-06-11)

**Architectural principle (Andrew 2026-06-11):** *"I'm getting the feeling that we aren't re-using components properly just based on the fact that you'd had to fix colors and what not on things on separate pages. We should NOT have any duplicate components unless absolutely necessary after the re-design. Every complex component should be composed of components. If you fix how something works in one place it should fix it everywhere."*

Post-redesign, the component tree is a **library**, not a page-by-page reimplementation. The "fix color in two places" smell is a **BLOCKER** for marking a surface done.

#### Rules

| # | Rule |
|---|---|
| **(a)** | **No duplicate components** post-redesign unless **absolutely necessary** — and if necessary, document **why** in this doc's inventory table (`Dedup Status` column) or the PR handoff. |
| **(b)** | Every **complex / composite** component **MUST** be composed of shared lower-level components and primitives (`ui/*`, §1A primitives, inventory canonicals) — not re-implemented inline on each page. |
| **(c)** | **Styling and behavior are single-source** — no per-page hardcoded colors, spacing, or one-off JSX structure. Consume design tokens and shared components only; a fix to a shared component's look or behavior **must propagate to every consumer** without duplicate edits. |
| **(d)** | **Acceptance:** reviewer greps for duplicated JSX/structure and hardcoded color/style literals in component code; a change to a shared component's look/behavior must **visibly affect every consumer** in smoke. Pairs with §2.11 (tokens, not hex) and §2.9 (no raw hex). |

#### Agent enforcement

[`.cursor/rules/component-reuse.mdc`](../.cursor/rules/component-reuse.mdc) — scoped to component/page source. **Backlog audit:** [`BACKLOG.md`](BACKLOG.md) § V1 redesign — component-duplication audit + consolidation (feeds **Gate A1**).

---

## §2.13 Token Vocabulary Gap Resolution

> **Status:** Design intent decisions for tokens not yet in `tokens.css`. The next token-extension pass should add these. Derived from mock `:root`.

### Spacing scale

The mock defines an explicit spacing scale matching Tailwind's default 4px base. Tailwind utilities already map correctly — use them directly and they will match the mock's intended rhythm. No new CSS custom properties are needed for spacing.

| Mock token | Value | Tailwind utility |
|---|---|---|
| `--space-1` | 4px | `p-1`, `gap-1`, `m-1` |
| `--space-2` | 8px | `p-2`, `gap-2`, `m-2` |
| `--space-3` | 12px | `p-3`, `gap-3`, `m-3` |
| `--space-4` | 16px | `p-4`, `gap-4`, `m-4` |
| `--space-5` | 20px | `p-5`, `gap-5`, `m-5` |
| `--space-6` | 24px | `p-6`, `gap-6`, `m-6` |
| `--space-8` | 32px | `p-8`, `gap-8`, `m-8` |
| `--space-12` | 48px | `p-12`, `gap-12`, `m-12` |
| `--space-16` | 64px | `p-16` |
| `--space-20` | 80px | `p-20` |

### Radius scale unification

The mock uses four named radii. Current `tokens.css` is inconsistent (mixes 14px, 16px, 6px values). **Canonical target from mock:**

| Semantic name | Mock value | Tailwind equivalent | Usage |
|---|---|---|---|
| `--radius-sm` / chip | 6px | `rounded-md` (Tailwind md = 6px) | Chips, mini toolbar, small interactive, session rows |
| `--radius-md` / panel | **10px** | `rounded-[10px]` | Cards, panels, popovers, stat tiles, top bar — PRIMARY panel radius |
| `--radius-lg` / container | 16px | `rounded-2xl` | Marketing/device frames in mock — rarely used in app chrome |
| `--radius-xl` / device | 24px | `rounded-3xl` | Outer device mock frames only |
| Pill | 999px | `rounded-full` | All buttons, badges, live badge, page tabs |
| Avatar | 50% | `rounded-full` | |

**Gap:** `--radius-md: 10px` has no exact Tailwind default (Tailwind's `rounded-md` = 6px, `rounded-lg` = 8px). Use `rounded-[10px]` until a token is added to `tailwind.config.ts`:

```js
// tailwind.config.ts — add to theme.extend.borderRadius
borderRadius: {
  panel: '10px',   // --radius-md: cards, panels, popovers
  chip: '6px',     // --radius-sm: chips, mini toolbar
}
```

Once added, use `rounded-panel` and `rounded-chip` in component code.

**Note:** Unify existing `tokens.css` radius values to this scale in the next token-pass. Remove any `14px` or `0.625rem` values that don't map to the four-step scale.

---

## §2.14 Cohesion Resolutions (§2.10 items — ratified design decisions)

Ratified design decisions addressing Andrew's Chunk-1 cohesion feedback (§2.10). Reference tokens, not implementation — executors build to these specs.

### Resolution of §2.10 #4 — Monochrome vs mock color variety (CORE)

> **Scope refinement (2026-06-08):** The current reskin is correctly described as monochrome. This is NOT a minor cohesion tweak — it requires building the mock-faithful compositions surface by surface. The token foundation is correct; the composition (where/how accent color appears) has not been built.

**Required accent application across surfaces — derived from mock:**

| Surface | Where `--accent` / `accent-soft` / `accent-text` appears | Mock ref |
|---|---|---|
| **All surfaces** | Primary CTA buttons (`bg-accent text-accent-on`) | All |
| **Dashboard sidebar** | Active nav item: `bg-accent-soft text-accent-text` | S2 `.dash-side-link.is-active` |
| **Dashboard stats** | Positive delta label: `text-accent-text` | S2 `.dash-stat-delta.is-up` |
| **Dashboard** | "Recap ready" / "Live" session status pill: `bg-accent-soft text-accent-text` | S2 `.dash-session-status` |
| **Dashboard** | Pending recaps strip: `bg-accent-soft border-l-[3px] border-accent` | S2 `.dash-pending-summaries` |
| **Dashboard** | "Up next" / "Start session" card nested CTA: `bg-accent text-accent-on` | S2 `.dash-upnext-cta` |
| **All active sessions** | Live dot: `bg-accent` + glow-halo `shadow-[0_0_0_3px_var(--accent-soft)]` | S1, S4 `.live-dot` |
| **Recording top bar** | Live badge: `bg-accent-soft text-accent-text rounded-full` | S4 `.rec-live` |
| **Pre-session** | Context/memory strip: `bg-accent-soft border-l-[3px] border-accent` | S3 `.pre-context` |
| **Pre-session** | Mic level bars (active): `bg-accent` | S3 `.mic-bar.lvl-N` |
| **Pre-session** | Eyebrow ("Pre-session"): `text-accent-text` | S3 `.pre-eyebrow` |
| **Session detail** | Active tab underline: `border-b-2 border-accent` | S5 `.session-tab.is-active` |
| **Session detail** | Editable AI recap sections: `bg-accent-soft border-l-[3px] border-accent` | S5 `.editable` |
| **Session detail** | Transcript speaker (tutor): `text-accent-text` | S5 `.transcript-line .speaker` |
| **Session detail** | "Regenerate" / "Regenerate recap" link: `text-accent-text font-medium` | S5 footer |
| **Parent share** | Section heading underline: `border-b-2 border-accent` inline-block | S6 `parent-section h2` |
| **Parent share** | Moment timestamp pill: `text-accent-text font-mono font-semibold` | S6 `.parent-moment-ts` |
| **Marketing** | Feature card icon cells: `bg-accent-soft text-accent-text rounded-[10px]` | S1 `.mkt-feature-icon` |
| **Marketing** | Hero eyebrow: `text-accent-text` | S1 `.mkt-hero-eyebrow` |
| **Marketing** | Trust checkmarks: `text-accent font-bold` | S1 `.checkmark` |

**The fix is compositional, not a token change.** Each B2–B6 chunk must implement these patterns for its surfaces. The §5 migration checklist flags each surface accordingly.

### Resolution of §2.10 #2 — Layout/hierarchy/density not redesigned

The reskin applied tokens to pre-existing layouts. Mock-faithful layouts for key surfaces:

| Surface | Current (reskin floor) | Target (mock-faithful) |
|---|---|---|
| Dashboard | Top-nav + AdminPageShell, flat page | Left sidebar (220px, 1A.8) + stats row (4-col) + two-column main (sessions list 2fr + right col 1fr) + pending strip + Start Session card (`bg-brand`) |
| Session detail | Single-column stacked | Two-column (recap 1.2fr + side 1fr), tab strip (Recap / Transcript / Whiteboard / Audio), AI sections with `accent-soft` tint |
| Active workspace | AdminNav wrap + whiteboard | Session bar 44px (mock `rec-topbar`) + dominant canvas + status bar + optional transcript side panel; NO AdminPageShell wrapping |
| Pre-session | Basic centered card | Centered full-viewport, mic-check + whiteboard preview in `grid-cols-2`, `accent-soft` last-session strip, coral CTA |
| Settings | Cards on index + sub-pages | Left sub-nav (180px, GitHub/Stripe/Linear pattern) + content area; NO card-on-every-nav-item |

### Resolution of §2.10 #1 — Settings sub-nav pattern

**Decision:** Implement **left settings sub-nav** (180px sidebar) for the settings section — matching GitHub / Stripe / Linear density and IA clarity. The sidebar uses the same component pattern as 1A.8 (sidebar nav) but narrower. The main area keeps `SectionCard` for content grouping.

**Implement in:** Cohesive visual pass (after Chunk 1 functional merge).

### Resolution of §2.10 #3 — Email OAuth notice placement

**Decision:** `AuthMortensenNotice` moves **above** the Connect-Gmail button (or into the button label area as a sub-caption). Never below the primary action — users click before reading. **Legal binding placement** per `v1-redesign-STATUS.md`.

**Implement in:** Next auth-surface touch (cohesive pass or targeted B1 follow-up).

### Resolution of §2.10 #5 — Warning color shade

**Decision:** Tune `--warning` in `tokens.css` light mode from current yellow-green to amber. Target: `#d97706` (amber-600, Tailwind default). Dark mode `--warning: #fde047` is correct per dark spec — no change needed.

**Implement in:** Single token change in cohesive pass (1 line, `tokens.css`).

### Resolution of §2.10 #6 — Input validation-state coloring

**Decision:** Deferred. `aria-invalid` + `text-destructive` error text is sufficient for v1. `PasswordStrengthField` zxcvbn bar covers the most important validation affordance. Per-field red/yellow/green border coloring is not a v1 blocker. Revisit if pilot feedback requests it.

---

## §3. Component-Pass Chunk Tracker

### Review protocol (LOCKED — Andrew 2026-06-07)

- **Tracked chunks** — component pass ships in chunks (this tracker) for clean, de-duplicated architecture.
- **Foundation chunks** — merge on **functional correctness only** (renders cleanly, no regressions). **Not** visually smoked/approved chunk-by-chunk; a foundation reskin has no meaningful standalone visual target.
- **Cohesive visual review** — **one** end-to-end review when enough chunks form a **complete page/flow** worth judging holistically.
- **No high-fi page mock** — Andrew chose this over "high-fidelity page-design target first." Cohesive review is judged against the approved **palette/font mock** ([`docs/brand-previews/palette-mocks-FINAL-mynka-blue.html`](brand-previews/palette-mocks-FINAL-mynka-blue.html) / [`docs/MYNK-BRAND-PHASE-2-DECISIONS.md`](MYNK-BRAND-PHASE-2-DECISIONS.md)) **plus accumulated UX feedback** (§2.10 and future chunk smokes).
- **Agent implication** — do **not** hand Andrew a foundation chunk as "smoke + approve the look"; hand it as **"functional foundation — merge on no-regression"** and accumulate visual feedback for the cohesive review.

Full decision record: [`docs/handoff/v1-redesign-STATUS.md`](handoff/v1-redesign-STATUS.md) § 2026-06-07 checkpoints (Component Chunk 1 smoke + review protocol).

| Chunk | Phase | Surface(s) | Status | Branch | Dedup-checked |
|---|---|---|---|---|---|
| A — Foundations | A | `tokens.css` dark mode, `fonts.ts`, `typography.css` | SHIPPED (on `v1-redesign`) | `v1-redesign` @ `5aa3c7d` | N/A |
| **A′ — Theme plumbing + toggle (first slice)** | A | Tailwind `@custom-variant dark` → `[data-theme]`; `useTheme` + FOUC-safe bootstrap (promote `ThemeInit`); `ThemeToggle` in nav/settings; Excalidraw hook follows app theme; §2.11 HARD gate for all later chunks | **PENDING — first slice of component pass (pre-master)** | — | — |
| B1 — Auth surfaces | B1 | `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/setup` | SHIPPED (on `v1-redesign`) | `v1-redesign` @ `b798494` | ✅ |
| B2 — Dashboard + Students | B2 | `/admin`, `/admin/students`, `/admin/students/[id]` | SHIPPED (on `v1-redesign` @ `0424206`) | `component-b2-dashboard-students` → merged | ✅ |
| D — Landing + Features | D | `/` (landing), `/features` | FIRST CUT (on `feature/phase-d-landing-about`, not merged) | `feature/phase-d-landing-about` @ `37d8178` | ✅ |
| **Chunk 1 — Settings + Operator** | B | `/admin/settings`, `/admin/settings/profile`, `/admin/settings/email`, `/admin/settings/2fa`, `/admin/feedback`, `/admin/waitlist` | **FUNCTIONALLY SMOKED** (2026-06-07; visual feedback → §2.10) | `v1-component-spine` | ✅ |
| Chunk 2 — Session list / billing log | B3 | `/sessions` (new route) | PENDING | — | — |
| Chunk 3 — Session detail / replay | B4 | `/sessions/[id]` | PENDING — **REQ-S3-1/2/4** (§3.1) | — | — |
| Chunk 4 — Live workspace + solo mode | B5 | `/sessions/[id]/workspace` | PENDING | — | — |
| Chunk 5 — Student-side mobile | B6 | `/join/[token]` | PENDING | — | — |
| C — URL restructure | C | All `/admin/**` → flatter routes | PENDING (Andrew-gated) | — | — |

---

## §3.1 Slice 3 smoke → B4 requirements (2026-06-07)

Captured from Andrew smoke of `feat/recording-p1-slice3-autonotes`. **Documentation only** — implementation belongs to Chunk 3 / Phase B4, not the recording slice.

### REQ-S3-1 — Formatted markdown display (dedupe)

- **Current bug surface:** `src/components/whiteboard/TutorNotesSection.tsx` renders `note.content` with `whiteSpace: pre-wrap` — users see literal `##` / `-` markdown.
- **Required:** one canonical path — `FormattedNotesBody` (or `RecapEditor` read-only) wrapping a markdown parser output in `.ai-prose`. No second ad-hoc raw-text renderer elsewhere on session review.
- **Repo today:** `.ai-prose` exists in `src/styles/typography.css`; **no** `ReactMarkdown` / `remark` utility yet — Chunk 3 introduces the shared renderer.

### REQ-S3-2 — Post-session note controls

- **Required actions:** **Save notes** (primary); **Cancel and delete session data** (destructive, confirmation dialog copy exactly: *"Are you sure you want to delete this session and all related data?"*).
- **Regression vs pre-slice-3:** `WhiteboardNotesPanel` paired `AiGeneratedNoteReviewGate` (Cancel) with `NewNoteForm` (Save note).

### REQ-S3-2a — OPEN design question

**Save notes** semantics undefined for auto-generated + regeneratable `TutorNote` rows. B4 design pass must choose before wiring (edit commit vs accept draft vs pin version, etc.). See [`v1-redesign-STATUS.md`](handoff/v1-redesign-STATUS.md) § 2026-06-07.

### REQ-S3-3 — Signed-in identity indicator (shell)

- **Gap (slice 3 smoke):** no on-page indication of which account is active — hard to confirm normal tutor vs admin vs impersonating vs test account.
- **Required:** app shell / `AdminNav` (and `AppHeader` account realm where applicable) always shows current signed-in identity; clear badge when impersonating (`ImpersonationBanner` complements but does not replace) or on test accounts.
- **Pass:** shell / nav redesign (B3–B6), not recording slice 3.

### REQ-S3-4 — Canonical notes schema (no field drops; Plan mandatory)

- **Problem:** slice 3 map-reduce (`notes-worker.ts` reduce, `extract-chunk.ts` map) emits markdown `TutorNote.content` with sections Session Summary / Topics Covered / Student Questions / Corrections & Misconceptions / Homework / Follow-up — **dropping** legacy form fields `assessment`, `plan`, and `links` from the pre-slice-3 shape (`NewNoteForm`, `src/lib/ai.ts`: topics / homework / assessment / plan / links).
- **Required (Andrew, 2026-06-07):** no straight drops without justification; legacy fields are baseline; **`Plan` mandatory**; **`homework` may fold into `Plan` only** per Sarah pilot feedback ([`sarah-pilot-feedback-2026-05-26-orchestrator-report.md`](handoff/sarah-pilot-feedback-2026-05-26-orchestrator-report.md) ~line 312 + § 2.6); new sections (Summary, Questions, Corrections) allowed as vetted **additions**, not replacements. **One converged schema** for manual + auto notes: topics / assessment / plan / links (+ optional additions; homework subsumed into Plan per Sarah). Reconcile slice-3 prompt + rendering in **B4 design pass** — not recording slice 3.
- **Component targets:** `FormattedNotesBody`, `RecapEditor`, `NewNoteForm`, `TutorNotesSection` (see Notes inventory). Cross-ref **REQ-S3-1** (formatted render), **REQ-S3-2** (Save/Cancel).
- **Sub-note (non-directive):** reduce `temperature: 0.3` may explain verbose-vs-terse run-to-run variance; consider pinning style in B4.

---

## §4. "Owned by Other In-Flight Work — Do Not Edit"

The following files are locked to recording slice 3 or live-session infrastructure. **Future UI chunk passes must NOT touch these files.**

### Recording Slice 3 (feat/recording-p1-slice3-autonotes)

- `src/lib/recording/extract-chunk.ts`
- `src/lib/recording/notes-enqueue.ts`
- `src/lib/recording/notes-worker.ts`
- `src/lib/recording/transcribe-sweep.ts`
- `src/lib/recording/transcription-worker.ts`
- `src/components/recording/MainPanel.tsx`
- `src/components/recording/RecordingControlPanel.tsx`
- `src/components/recording/MicControls.tsx`
- `src/components/recording/UploadingPanel.tsx`
- `src/components/recording/ErrorCard.tsx`
- `src/components/recording/DoneCard.tsx`
- `src/components/admin/SessionCostPanel.tsx`
- `src/components/whiteboard/TutorNotesSection.tsx`

### Session Review Route (Slice 3 post-session)

- `src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/page.tsx`
- `src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceClient.tsx`
- `src/app/admin/students/[id]/whiteboard/notes-actions.ts`
- `src/components/whiteboard/WhiteboardNotesPanel.tsx`
- `src/components/whiteboard/WhiteboardReplay.tsx`

### Prisma Schema + Migrations

- `prisma/schema.prisma` — locked to identity phases + recording slice; all migration changes must come from the owning branch
- `prisma/migrations/` — additive only; never drop or rename columns

---

## §5. Legacy-Surface Migration Checklist

> **Purpose:** Maps every current surface to its mock-faithful composition target. Flags which surfaces are "reskin floor today" vs "mock-faithful target." The composition build-out roadmap — not just primitive-swaps.

**Status legend:**
- **[RESKIN FLOOR]** — tokens applied to pre-existing layout; composition NOT mock-faithful
- **[MOCK-FAITHFUL]** — what needs to be built (or verify it is built)
- **[NOT YET BUILT]** — surface does not yet exist
- **[FIRST CUT / NOT MERGED]** — partially built, not yet in master

| # | Surface | Route | Current state | Composition target | Chunk | Priority |
|---|---|---|---|---|---|---|
| 1 | **Dashboard** | `/admin` | **[RESKIN FLOOR]** Top-nav + AdminPageShell. Monochrome. No sidebar, stats row, two-column, pending strip, brand-bg card. | **Left sidebar (1A.8)** + stats row 4-col + two-column main (sessions 2fr + right col 1fr) + `accent-soft` pending-recap strip + `bg-brand` Start Session card (replaces mock's scheduling card). All accent application per §2.14 #4. | B2 | **HIGH** |
| 2 | **Student list** | `/admin/students` | **[RESKIN FLOOR]** Top-nav + AdminPageShell + `StudentsRoster`. Monochrome. | Same sidebar shell as dashboard. Student list with search. Per-student `accent-soft` status badge. Coral "Add student" / "Start session" CTA. | B2 | HIGH |
| 3 | **Student detail** | `/admin/students/[id]` | **[RESKIN FLOOR]** AdminPageShell. | Student header: `bg-brand` avatar circle, student name `.heading`, metadata `.label-mono`. Session list for student. `accent-soft` "Recap ready" badges. Coral "Start session" CTA. | B2 | MEDIUM |
| 4 | **Session list / billing** | `/sessions` | **[NOT YET BUILT]** | Date range picker + student filter + session table + subtotal row + export button. Session rows use 1A.7 pattern. | B3 | MEDIUM |
| 5 | **Session detail / replay** | `/sessions/[id]` | **[RESKIN FLOOR]** `WhiteboardNotesPanel` + raw markdown display. Single column. | Two-column layout (recap card 1.2fr + side panel 1fr). Tab strip with `border-b-2 border-accent` active underline. AI recap card: `accent-soft` editable sections. Transcript speaker `text-accent-text`. Whiteboard snapshot 2×2 grid. "Regenerate" `text-accent-text` footer link. Full `.ai-prose` for AI content. | B4 | **HIGH** |
| 6 | **Parent share** | `/share/[token]` | **[RESKIN FLOOR]** `ParentShareNoteCard` + basic layout. First parent impression — critical. | Section headings: `border-b-2 border-accent inline-block`. `parent-moment` cards: timestamp `text-accent-text font-mono`. AI content: `.ai-prose` Fraunces serif. Sign-off avatar: `bg-brand text-brand-on`. "Play" ghost buttons. Centered max-w-[680px] layout. | B4 | **HIGH** |
| 7 | **Live workspace** | `/sessions/[id]/workspace` | **[RESKIN FLOOR]** Existing workspace with `AdminNav` chrome. | Session bar (44px, `bg-card border-b`): live badge `bg-accent-soft text-accent-text` + coral dot + timer `font-mono font-semibold` + end-session inverse button. Canvas dominant. P1.2 chrome per visual design doc. Status bar bottom. Optional transcript side panel. NO `AdminPageShell` wrapping. | B5 + P1.1 | **HIGH** |
| 8 | **Pre-session preview** | Workspace before Start | **[RESKIN FLOOR]** Basic centered card. | Centered full-viewport. Eyebrow `text-accent-text` label-mono. 2-column mic-check + whiteboard preview cards. `accent-soft` last-session context strip. Coral "Start session" btn-lg + ghost "Continue last whiteboard". | B5 | **HIGH** |
| 9 | **Student join** | `/join/[token]` | **[RESKIN FLOOR]** Current workspace layout. | Phone-first, `100dvh`. Canvas ≥80% viewport. Compact page strip (pill tabs). Follow-tutor toggle: `bg-accent-soft text-accent-text` when ON. AV tile: `position: fixed` bottom-right overlay. Minimal floating tool buttons. | B6 | HIGH |
| 10 | **Auth surfaces** | `/login`, `/signup`, `/forgot`, `/reset` | **[PARTIALLY MOCK-FAITHFUL]** B1 shipped wordmark + centered card. | Verify: `bg-background` (cream/navy) page bg. Wordmark `text-[28px]`. OAuth notice ABOVE Connect-Gmail button (§2.14 #3 resolution). Coral CTA pair with ghost. | B1 follow-up / cohesive | LOW |
| 11 | **Marketing landing** | `/` | **[FIRST CUT / NOT MERGED]** Phase D, `feature/phase-d-landing-about` @ `37d8178`. | Phase D v2 decisions (see v1-component-redesign-design-2026-05-31.md §5 D v2). MarketingHeader with single Sign-in menu. Hero: "Session notes that write themselves." `accent-text` eyebrow. Coral CTA pair. Value props 3-col. "How it works" 3-step. Trust CTA. SiteFooter. | D (Phase D v2 review) | MEDIUM |
| 12 | **Settings index + sub-pages** | `/admin/settings/**` | **[RESKIN FLOOR / CHUNK 1]** Chunk 1 functional. §2.10 items apply. | Left settings sub-nav (180px sidebar per §2.14 #1). Content area with `SectionCard`. OAuth notice above button (§2.14 #3). Amber warning token (§2.14 #5). | Cohesive pass | MEDIUM |
| 13 | **Whiteboard chrome** | Workspace overlay | **[NOT YET BUILT]** P1.1 pending. | P1.2 visual design: [`docs/handoff/whiteboard-chrome-p1.2-visual-design-2026-06-08.md`](handoff/whiteboard-chrome-p1.2-visual-design-2026-06-08.md). Surface 4 visual language. Active tool = inverse colors (NOT coral). | P1.1 | **HIGH** |
| 14 | **`SubmitButton` sites** | Various forms | **[DEBT]** Pre-B1 component. | Migrate to `<Button>` from shadcn/ui opportunistically when touching a page. No forced sweep. | Ongoing | LOW |
| 15 | **`dark:` hardcodes** (~30 usages) | Various components | **[DEBT]** Key off OS not `[data-theme]`. | Migrate to token-driven classes per §2.11 end-state. Eliminate `dark:` from component code when touching a file. | Ongoing | LOW |
| 16 | **Session replay chrome** | `WhiteboardReplay` | **[RESKIN FLOOR / LOCKED]** Slice 3 ownership — do not touch. | After slice 3 merges: apply B4 session-detail chrome (Surface 4 visual language for replay toolbar). | B4 post-slice-3 | MEDIUM |

### Build order (guidance)

| Order | Work | Why |
|---|---|---|
| 1st | **A′ Theme plumbing** | All subsequent chunks inherit dark mode correctly |
| 2nd | **B2 Dashboard + shell** | Establishes sidebar shell all B3–B6 share |
| 3rd | **P1.1 Whiteboard chrome** | Parallel to B chunks; separate team/agent. Sarah's live surface. |
| 4th | **B4 Session detail + Parent share** | Sarah's primary review; parent's first impression |
| 5th | **B5 Workspace** | Sarah's live surface; depends on P1.1 for chrome |
| Parallel | **B3 Session list**, **D Landing** | After B2; D is its own branch |
| After B2 | **B6 Student join (mobile)** | Phone-first; requires real-device test |
| After B2–B6 | **Cohesive visual pass** | Settings sub-nav, density, warning token, OAuth placement |
| Gated (Andrew) | **C URL restructure** | After B+A stable |

---

## §6. Frozen foundation (2026-06-11)

**Branch:** `v1-design-system` — **critical-path dependency root** for full-site v1 visual redesign. Surface-conversion agents consume this output; do not reinvent primitives.

### Primitive catalog (27 files in `src/components/ui/`)

`accordion`, `alert`, `alert-dialog`, `avatar`, `badge`, `button`, `calendar`, `card`, `checkbox`, `dialog`, `dropdown-menu`, `input`, `label`, `popover`, `progress`, `radio-group`, `scroll-area`, `select`, `separator`, `sheet`, `skeleton`, `sonner` (Toaster), `switch`, `table`, `tabs`, `textarea`, `tooltip`

**New runtime deps (2026-06-11):** `date-fns`, `react-day-picker`, `sonner` (plus `next-themes` pulled by shadcn CLI but **not used** — app theme is `ThemeProvider` / `[data-theme]`).

### Theme-agnostic contract (HARD)

- Primitives use **only** semantic token classes (`bg-background`, `text-foreground`, `border-border`, `bg-primary`, `text-muted-foreground`, etc.) mapped in `shadcn-theme.css`.
- **No `dark:` variants** in `src/components/ui/` — dark mode is handled exclusively by `[data-theme]` token swaps.
- Agent rules: [`.cursor/rules/both-theme-components.mdc`](../.cursor/rules/both-theme-components.mdc) + strengthened [`.cursor/rules/component-reuse.mdc`](../.cursor/rules/component-reuse.mdc).

### Shell additive changes (no breaking prop changes)

| Shell | Change |
|---|---|
| `PageShell` | Admin realm: optional `sidebar` + `sidebarWidth` (`default` 220px / `narrow` 180px) for dashboard + settings sub-nav layouts |
| `Providers` | `TooltipProvider` + `Toaster` (sonner) mounted app-wide |
| `/admin/pending-approval` | Removed duplicate `AdminNav` (layout already provides it) |

Existing shells (`AdminNav`, `AuthShell`, `PageShell`, `AppHeader`, `MarketingHeader`, `StudentsRoster`, etc.) already compose `ui/` primitives — no behavioral changes.

### Surface conversion build order (tonight)

| Order | Group | Surfaces |
|---|---|---|
| 1 | Public / legal / feedback | `/`, `/features`, `/privacy`, `/terms`, `/feedback` |
| 2 | Parent share | `/s/[token]`, `/s/[token]/all` |
| 3 | Admin / tutor | `/admin`, `/admin/students`, `/admin/students/[id]`, settings, operator pages |
| 4 | Account / parent | `/account/**` |
| 5 | Student | `/join`, `/w/[joinToken]`, `/students/login` |
| 6 | New pages | `/sessions` (billing log), other net-new routes |
| 7 | Scheduling | Calendar-backed scheduling UI (post-v1 if gated) |

### Deferred library gaps (surface agents own)

- `ThemeToggle` — inventory lists as planned; already in `AdminNav` but not documented as frozen here
- `FormattedNotesBody`, `RecapEditor` — Chunk 3/B4 targets (§1 Notes inventory)
- `AdminSidebarNav` composed component — use `PageShell` admin `sidebar` + §1A.8 token patterns; no dedicated component yet
- `rounded-panel` (`10px`) Tailwind token — use `rounded-[10px]` until `tailwind.config` extends (§2.13)
- Legacy `.btn` / `.card` / `.container` in `globals.css` — still required by unmigrated surfaces; remove only after full conversion

---

## Changelog

- **2026-07-10:** **Wave B `PageShell` + `AppHeader` dedupe** — `PageShell` (`realm`: admin/account/student/share) replaces `AdminPageShell`, `AccountPageShell`, `StudentPageShell`, `ParentShareShell`; `AppHeader` (`realm`: account/student) extracts shared top chrome; share helpers moved to `SharePageHelpers.tsx`.
- **2026-06-12:** **Doc sync — post-review tweak wave** (library remains FROZEN): admin shell max width `max-w-6xl xl:max-w-7xl` + sidebar `gap-6` (§2.1); `CheckboxField` inventory row; `StudentAvatar` deterministic FNV-1a `--avatar-N` palette spec expanded. Shipped on `v1-design-system` @ `6587592`.
- **2026-06-11:** **§6 Frozen foundation** — full shadcn new-york primitive catalog on `v1-design-system`; theme-agnostic reconciliation (no `dark:` in `ui/`); `AdminPageShell` sidebar props; pending-approval dup-nav fix; `Providers` toaster/tooltip; strengthened `component-reuse.mdc`; surface conversion build order.
- **2026-06-07:** Initial doc. Component-pass chunk 1 (Settings/operator reskin). Authored by Sonnet subagent on branch `v1-component-spine`.
- **2026-06-07:** Slice 3 smoke requirements **REQ-S3-1/2/2a** added (§3.1, Notes inventory, Chunk 3 row). Branch `docs/v1-redesign-notes-ux-reqs`.
- **2026-06-07:** **REQ-S3-3** signed-in identity indicator (§3.1, `AdminNav` inventory). Branch `docs/v1-redesign-notes-ux-reqs`.
- **2026-06-07:** **REQ-S3-4** canonical notes schema — no field drops, Plan mandatory, homework→Plan per Sarah pilot feedback (§3.1, Notes inventory). Branch `docs/v1-redesign-notes-ux-reqs`.
- **2026-06-07:** Component-pass **review protocol** (§3) + **Chunk 1 smoke feedback** (§2.10); Chunk 1 tracker row updated (functional smoke; removed nonexistent `/admin/outbox`). Branch `docs/v1-redesign-notes-ux-reqs`.
- **2026-06-07:** **§2.11 light/dark theme parity** + planned `ThemeToggle` deliverable (§1 inventory, §3 tracker row A′). Pre-master gate per Andrew.
- **2026-06-07:** **§2.11 strengthened to HARD per-component acceptance gate** — no separate theming pass; foundational plumbing = first slice (A′); agent rule `.cursor/rules/both-theme-components.mdc`.
- **2026-06-07:** **§2.11 sharpened to theme-agnostic architectural principle** — tokens only in components (no `light`/`dark`); N-theme-capable; boundary-adapter carve-outs; `dark:`→token migration target as end-state debt.
- **2026-06-08:** **PAPER design pass additions** (Opus orchestrator, SCOPE REFINEMENT applied): added **§1A Ratified Primitive Spec** (11 primitives derived from mock six surfaces: coral CTA, ghost button, accent strip, brand-bg card, stat tile, session badge, session row, left sidebar nav + identity chip, toolbar icon-control, chip toggle, popover container); **§2.13 Token vocabulary gap resolution** (spacing scale = Tailwind default, radius unification: `--radius-panel: 10px`); **§2.14 Cohesion resolutions** (§2.10 #1–#6 ratified: settings left sub-nav, layout/density/density composition targets per surface, OAuth notice above CTA, amber warning token, validation-state coloring deferred); **§5 Legacy-surface migration checklist** (all surfaces flagged RESKIN FLOOR vs MOCK-FAITHFUL TARGET, build-order guidance). Branch `v1-redesign`.
- **2026-06-11:** **§2.12 Single-source-of-truth components — no duplication** (HARD gate, Andrew directive); prior §2.12/§2.13 renumbered to §2.13/§2.14. Companion rule `.cursor/rules/component-reuse.mdc`. Branch `v1-redesign`.
