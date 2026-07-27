# Dedupe eyeball list — Wave A + Wave B

Lightweight Andrew eyeball tracker after agent executor→verifier→merge passes land. **Not** a full smokebook — quick visual sanity on consolidated surfaces.

> **2026-07-27:** Full-site hunting is too expensive for Andrew’s current bandwidth. Queued [`/admin/design-system`](../BACKLOG.md) gallery (platform-maintainer only) will become the primary findable eyeball surface for library components. Until it lands, agents must deep-link exact routes + what to look for — never “look around.”

**Branch:** `master` @ `8a7dc8b6` (Ready-to-teach midwidth)  
**Preview:** _(fill from Vercel `branchAlias` when running)_

---

## Wave A (merged — still needs eyeball)

Run each in **light** and **dark** unless noted.

### ErrorStateCard

- [ ] `/` — force error surface (bad URL / throw if needed)
- [ ] `/` — not-found
- [ ] `/admin` — error
- [ ] `/admin` — not-found

### LegalDocumentShell

Shell chrome only — legal bodies unchanged.

- [ ] `/privacy` — light
- [ ] `/privacy` — dark
- [ ] `/terms` — light
- [ ] `/terms` — dark

### Admin nav

`AdminNav` + `AdminSidebarNav` — link set still correct (active states, all links).

- [ ] Desktop / wide — active states + full link set
- [ ] Narrow / mobile drawer — same link set + active states

### formatDurationMs

Spot-check WB replay / workspace duration strings look normal (byte-identical expected — quick glance).

- [ ] Replay duration display
- [ ] Workspace / in-session duration display

---

## Wave B (as items land — leave unchecked)

### SectionCard realms _(merged `a8a31e46`)_

Canonical `SectionCard` with `realm="admin"|"account"`. Old admin/account cards were class-identical; distinction is `data-realm`.

- [ ] Admin realm — representative pages (settings, roster, schedule)
- [ ] Account realm — dashboard + child detail cards
- [ ] **Consent — "Always-off limits" block** (`/account/children/[id]/consent`): was bespoke `<section>` with `p-4 sm:p-5`; now shared shadcn Card (`<div>`, different padding). Confirm layout + landmark feel OK (verifier a11y note).

### PageShell / AppHeader _(merged `f297e092`)_

Verifier: rendered HTML byte-equivalent per realm — still worth a quick glance.

- [ ] Admin — `/admin`, `/admin/settings/profile` (sidebar)
- [ ] Account — `/account/dashboard`, `/account/children/<id>`
- [ ] Student — `/join` header band
- [ ] Share — `/s/<token>`, `/s/<token>/all`

### SubNav _(merged `f59a1ead`)_

- [ ] Settings — `/admin/settings/profile` (any sub-page): vertical left rail, active pill, all links incl. Known issues
- [ ] Account child — `/account/children/<id>` (+ notes/devices/consent): horizontal tabs, active underline, no stray vertical scrollbar

### consent-write

No UI — **agent gates only; Andrew eyeball N/A** unless consent flow smoke.

- [ ] N/A — agent gates

### blob / share proxy

No UI — **agent gates**; optional share-link asset load smoke.

- [ ] N/A — agent gates _(optional: share-link asset load)_

### Kill `/api/upload/audio` _(merged `0ce5ff4e`)_

No UI — **agent gates**. Audio now via `/api/upload/blob` `{ kind: "audio" }`.

- [ ] N/A — agent gates

---

## tokens.css dark-palette _(merged `f558b145`)_

System preference now always writes resolved `data-theme`. Same surfaces **light / dark / system** (incl. live OS toggle while app open).

- [ ] Login — light / dark / system
- [ ] Admin home — light / dark / system
- [ ] Privacy shell — light / dark / system
- [ ] _(optional)_ Live OS dark/light switch while preference = System

---

## Overall

- [ ] PASS
- [ ] FAIL
