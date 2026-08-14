# Tutoring-notes (Mynk) — "where do I look for X" index

> **Start here.** This is the single entry point for any new chat, agent, or human picking up work in this repo. Every canonical doc is mapped below by topic. For the curated reading-list with in-depth framing, see [AGENTS.md](../AGENTS.md) § Key docs.
>
> Last updated: 2026-07-09 (doc-cleanup pass — 133 transient docs + 29 plans archived).

---

## Docs cleanup / archival policy

On every docs-cleanup pass: **archive** anything verified to be captured elsewhere or later superseded/overridden — but **never** archive information that would be lost if it's still valid and unique.

Bar to archive a doc or section: **(a)** its still-valid content is provably captured in a canonical consolidated doc, **or** **(b)** it's been explicitly superseded. If removing it would lose valid unique information, **keep it**. Goal: reduce docs sprawl without losing signal.

**Canonical pattern:** consolidate scattered feedback into one source, verify capture, **then** archive the redundant copies. Open work lives in [docs/BACKLOG.md](BACKLOG.md); historical material in the Archive section below.

---

## Archive

[`docs/archive/`](archive/) is **cold storage** — superseded or captured-elsewhere docs; not authoritative. [`docs/archive/ARCHIVE-LEDGER.md`](archive/ARCHIVE-LEDGER.md) is the audit trail. Agents ignore this tree by default (`.cursorindexingignore`). When an INDEX row used to point at an archived doc, check the ledger or BACKLOG for where that info now lives.

**Cursor plans:** tutoring-notes plan files archived to `~/.cursor/plans/archive/`; canonical sequencing = [docs/RELEASE-ROADMAP.md](RELEASE-ROADMAP.md) + [docs/BACKLOG.md](BACKLOG.md).

---

## Sequencing + roadmap

| Doc | What's in it | When to read |
|---|---|---|
| [docs/RELEASE-ROADMAP.md](RELEASE-ROADMAP.md) | Canonical wave-by-wave sequencing from solo-tutor reliability floor to Aug 2026 university-pitch readiness. Re-validate quarterly or after major Sarah feedback. | Start of any session where you're deciding what to work on next |
| [docs/handoff/ORCHESTRATOR-STATE.md](handoff/ORCHESTRATOR-STATE.md) | **Living orchestrator bootstrap** — current branch/tip, merge gate, execution order, build status | **Every fresh orchestrator chat — read HEAD first** |
| [docs/handoff/ANDREW-FOLLOW-UPS.md](handoff/ANDREW-FOLLOW-UPS.md) | **Andrew drop-in checklist** — Console / human work that does not block agent feature progress | When returning after a gap; Google Console tasks |
| [docs/BACKLOG.md](BACKLOG.md) | Pilot feedback items, known follow-ups, reliability gaps (Axes 1–5), security recon, deferred phase notes, pointers to archived bootstrappers | Whenever triaging new work, checking reliability posture, or looking for a deferred item |

---

## Testing + quality

| Doc | What's in it | When to read |
|---|---|---|
| [docs/TESTING-COVERAGE.md](TESTING-COVERAGE.md) | Feature × automated-coverage tier matrix (U/I/E/RB/M), teeth-gap summary, Playwright smoke-automation roadmap | Before planning test work, pre-merge gates, or converting manual smokes to e2e |

---

## Reliability + architecture

| Doc | What's in it | When to read |
|---|---|---|
| [docs/RECORDER-LIFECYCLE.md](RECORDER-LIFECYCLE.md) | **Must-read gate.** Three-pillar FSM + outbox + atomic end-session; end-session flow diagram; Phase 1c surfaces (snapshot PNG, preview-before-Start); per-session ID registry (`rid`, `wbsid`, `obx`, `snp`, `pvw`, `avx`, …) | Before touching `lifecycle-machine.ts`, `upload-outbox.ts`, `endWhiteboardSession`, or workspace `handleEndSession` |
| [docs/WHITEBOARD-STATUS.md](WHITEBOARD-STATUS.md) | Current whiteboard build status, guardrails, adversarial review, demo gate, sync-host deploy notes | Before any whiteboard feature work or smoke pass |
| [docs/handoff/whiteboard-chrome-requirements.md](handoff/whiteboard-chrome-requirements.md) | **Custom Mynk whiteboard chrome** — LOCKED decision, Sarah UX requirements (toolbar, properties, defaults, mobile), feasibility tags | Before any Excalidraw UI replacement work |
| [docs/LIVE-AV.md](LIVE-AV.md) | Live A/V architecture cheat sheet — peer-mesh, signaling, `useLiveAV`, `mic-recorder-audio`, participants-reconcile effect | Before touching `peer-mesh.ts`, `useLiveAV.ts`, `mic-recorder-audio.ts`, or anything claiming to "simplify" peer connection or audio recording |
| [docs/PLATFORM-ASSUMPTIONS.md](PLATFORM-ASSUMPTIONS.md) | Inventory of every load-bearing infra, runtime, browser, and OS assumption (Vercel Pro 300s ceiling, Neon branching, Vercel Blob, CSP origins, Node 20+, ffmpeg-static, Excalidraw API surface) + migration checklist | Before migrating platform, changing managed-service tier, or adding a new external dependency |
| [docs/BACKLOG.md](BACKLOG.md) §3 Reliability | Per-axis audit with BLOCKER-PROD and deferred items | 5-axis reliability check for any new feature plan |
| *Historical STATUS docs* | Phase handoffs (1b outbox, 4a live-A/V, recorder refactor, chrome design) | Archived; see Archive section. Current cheat sheets: RECORDER-LIFECYCLE, LIVE-AV, WHITEBOARD-STATUS. |

---

## Brand + UX

| Doc | What's in it | When to read |
|---|---|---|
| [docs/V1-COMPONENT-LIBRARY.md](V1-COMPONENT-LIBRARY.md) | **V1 component spine.** Full inventory + dedup status; UX rubric; component-pass chunk tracker; live-session collision-zone lock list | **Before any UI chunk pass** |
| [docs/BRAND.md](BRAND.md) | Engineering-ready brand reference — Mynka Blue palette, coral accent, cream surfaces, Fraunces/Inter/JetBrains Mono typography, voice | Before any UI or branding work |
| [docs/MYNK-BRAND-PHASE-2-DECISIONS.md](MYNK-BRAND-PHASE-2-DECISIONS.md) | Locked palette + typography + voice decisions from the 2026-05-19 PM design session | Before making design decisions or creative direction choices |
| [docs/UX-AND-A11Y-SPEC.md](UX-AND-A11Y-SPEC.md) | Conformance bar, contrast audit, Pre-flight checklist, open IA decisions | Before implementing any UX components or accessibility work |
| [docs/MYNK-BRAND-CAPTURE-CHECKLIST.md](MYNK-BRAND-CAPTURE-CHECKLIST.md) | Tier 1 domain + social handle capture status | When acting on remaining social handle captures or verifying brand asset status |
| [docs/MYNK-BRAND-NAME-VALIDATION-NOTES.md](MYNK-BRAND-NAME-VALIDATION-NOTES.md) | Brand name validation record — VALIDATED 2026-05-18; US-only tutoring pilot stage; trademark still deferred | When reviewing brand decision rationale or trademark gate criteria |
| [docs/Mynk-Pre-Trademark-Implementation-Backlog.md](Mynk-Pre-Trademark-Implementation-Backlog.md) | Pre-trademark implementation backlog — P0 app-surface wiring, social handles, gating criteria | When acting on pre-trademark work items |
| [docs/SARAH-CALL-PREP.md](SARAH-CALL-PREP.md) § brand-awareness check | Deferred brand-awareness check (forwarded to next-call queue from 2026-05-26 call) | When the brand-awareness validation gate opens post-ship |

---

## Pilot feedback

| Doc | What's in it | When to read |
|---|---|---|
| [docs/SARAH-CALL-PREP.md](SARAH-CALL-PREP.md) | **Living doc** — next-call open questions + answered questions from all prior calls (newest at top) | Before any Sarah call or when acting on pilot questions |
| [docs/BACKLOG.md](BACKLOG.md) §1 NOW / Sarah-facing | Actionable pilot feedback and Sarah-merge gate items | When triaging pilot-driven work |
| *Historical pilot/orchestrator reports* | Dated call captures and session retrospectives (e.g. 2026-05-26 pilot feedback) | Archived; see Archive section |

---

## Deploy + ops

| Doc | What's in it | When to read |
|---|---|---|
| [docs/DEPLOY.md](DEPLOY.md) | Vercel + Neon deploy notes | Before any deploy, env setup, or infra change |
| [docs/LOCAL-DEV.md](LOCAL-DEV.md) | Local dev setup | First-time setup or onboarding a new dev environment |
| [docs/GOOGLE-OAUTH-VERIFICATION.md](GOOGLE-OAUTH-VERIFICATION.md) | Google OAuth verification process and current state (Testing mode) | Before scaling Gmail connect beyond listed test users |
| [docs/COST-OBSERVABILITY.md](COST-OBSERVABILITY.md) | `CostEvent` table schema + per-session logging — Phase 9 early action (pre-dashboard) | When working on AI cost tracking or Phase 9 admin dashboard |
| [docs/handoff/incident-response-runbook.md](handoff/incident-response-runbook.md) | Production incident response steps | During or after a production incident |
| [docs/handoff/secret-rotation-runbook.md](handoff/secret-rotation-runbook.md) | Secret rotation procedure | When rotating credentials or reviewing rotation cadence |

---

## Legal

| Doc | What's in it | When to read |
|---|---|---|
| [docs/LEGAL-SYNC.md](LEGAL-SYNC.md) | Sync protocol between the product's `/privacy` + `/terms` facades and the canonical umbrella at `mortensenapps.com`; quarterly drift review cadence; section classification table (umbrella-derived vs. product-specific) | Before touching legal facades, Gmail OAuth consent flow, or any external policy reference |
| `src/app/privacy/page.tsx` | Local subordinate privacy facade — product-specific sections supplement the umbrella; NOT the registered canonical OAuth URL | Edit only per [docs/LEGAL-SYNC.md](LEGAL-SYNC.md) protocol |
| `src/app/terms/page.tsx` | Local subordinate terms facade — same subordinate relationship as privacy | Edit only per [docs/LEGAL-SYNC.md](LEGAL-SYNC.md) protocol |
| [docs/legal-drafts/umbrella-pending-2026-05-18.md](legal-drafts/umbrella-pending-2026-05-18.md) | Drafted umbrella additions NOT yet shipped to `mortensenapps.com` | Before work that depends on umbrella PostHog or AI-edit-signal copy (see [docs/BACKLOG.md](BACKLOG.md)) |

---

## Security

No standalone security doc. Open security items and the 2026-05-18 recon + Tier A audit results live in [docs/BACKLOG.md](BACKLOG.md) §6 Auth / identity / consent / privacy / legal / COPPA (subsection **Security**). The audit found no critical gaps; Tier A work shipped same day.

---

## Smoke + manual runbooks

| Doc | What's in it | When to read |
|---|---|---|
| [docs/handoff/SMOKEBOOK-TEMPLATE.md](handoff/SMOKEBOOK-TEMPLATE.md) | Canonical smokebook/runbook template — per-item Action/Expect/Ignore/PASS/FAIL/Notes; header with branch, tip commit, verified preview URL | Before authoring any smokebook or smoke-runbook |
| [docs/SMOKE-LONG-FORM-TRANSCRIBE.md](SMOKE-LONG-FORM-TRANSCRIBE.md) | Long-form transcribe (60–90 min) Tier 1 smoke harness — **Wave 1 BLOCKER-PROD** (Vercel Pro 300s ceiling validation) | Before running long-form transcribe smoke on Production or Preview |
| [docs/PHASE-2-IOS-SMOKE-MATRIX.md](PHASE-2-IOS-SMOKE-MATRIX.md) | iOS Safari real-hardware smoke matrix — **Wave 1 BLOCKER-PROD** (Axis 4 cross-platform parity) | Before iOS Safari smoke pass; fill on real hardware only |
| [docs/whiteboard-smoke-log.md](whiteboard-smoke-log.md) | Manual whiteboard smoke log — living doc updated after each smoke pass or pilot quote capture | After any whiteboard smoke run |
| *Dated smokebooks* | Per-branch/feature smoke runbooks from prior waves | Archived; see Archive section |

---

## Recorder lifecycle (must-read gate)

> **Always read [docs/RECORDER-LIFECYCLE.md](RECORDER-LIFECYCLE.md) before touching `lifecycle-machine.ts`, `upload-outbox.ts`, `endWhiteboardSession`, or workspace `handleEndSession`.** This is a hard gate, not a suggestion. The three-pillar pattern (FSM, outbox, atomic end-session) is the load-bearing architecture of the capture pipeline.

| Doc | What's in it |
|---|---|
| [docs/RECORDER-LIFECYCLE.md](RECORDER-LIFECYCLE.md) | Three-pillar architecture, end-session flow diagram, Phase 1c surfaces (snapshot, preview-before-Start), per-session ID registry, cheat sheet for common questions |
| *Historical STATUS docs* | Phase 1b / recorder-refactor handoffs | Archived; see Archive section |

---

## Handoff docs (bootstrappers + orchestrator reports)

See [docs/handoff/README.md](handoff/README.md) for the lifecycle, naming convention, and templates.

| Doc | What's in it | When to read |
|---|---|---|
| [docs/handoff/ORCHESTRATOR-STATE.md](handoff/ORCHESTRATOR-STATE.md) | Living orchestrator bootstrap | Every fresh orchestrator chat |
| [docs/handoff/orchestrator-state-template.md](handoff/orchestrator-state-template.md) | Template for heavy ORCHESTRATOR-STATE restructures | At merge milestones or session wind-down |
| [docs/handoff/SMOKEBOOK-TEMPLATE.md](handoff/SMOKEBOOK-TEMPLATE.md) | Smokebook template | Before authoring smoke runbooks |
| [docs/handoff/whiteboard-chrome-requirements.md](handoff/whiteboard-chrome-requirements.md) | Locked whiteboard chrome requirements | Before chrome replacement work |
| *Historical bootstrappers + orchestrator reports* | Dated executor briefings and session retrospectives; future-phase specs (PostHog, AI edit signal, cost logging, etc.) | Archived; pointers in [docs/BACKLOG.md](BACKLOG.md) (especially §5, §10) — see Archive section |

---

## Org + commercial launch readiness (future)

| Doc | What's in it | When to read |
|---|---|---|
| [docs/MYNK-ORG-PILOT-BACKLOG.md](MYNK-ORG-PILOT-BACKLOG.md) | Organization/university pilot backlog — **NOT YET STARTED**; gated on solo-tutor stability + UX refresh complete + brand finalized + Mynk trademark filed | When the org-pilot gate criteria are met |
| [docs/COMMERCIAL-LAUNCH-CHECKLIST.md](COMMERCIAL-LAUNCH-CHECKLIST.md) | Post-PMF commercial launch checklist — NOT a now list; a reference for when scaling beyond pilots | When you're ready to launch at scale beyond the pilot |
