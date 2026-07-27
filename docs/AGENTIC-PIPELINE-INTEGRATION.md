# Agentic pipeline integration plan (living)

Goal (Andrew 2026-07-10): advance the **`agenticPipeline`** project (`C:\Users\arang\Documents\Andrew\dev\agenticPipeline` — first crack, unrefined) toward a true autonomous, **industry-standard black-box agentic dev pipeline**, and **integrate it with tutoring-notes**. Priority stays tutoring-notes functionality/stability/responsiveness; pipeline advances in real, solid steps, deferrable only if it blocks release (Andrew approval), never permanently.

> **Status: Phase 1 DONE + merged to agenticPipeline `master` (2026-07-27)** @ [`aa56225`](https://github.com/Arangarx/agenticPipeline/commit/aa56225). Phase 2+ below remain planned.

## Current state of agenticPipeline (~25–30% of vision)

- **Strong:** stage contracts (`spec → research → design → build → test → verifier → approval → deploy → handoff`), guardrail docs (trust bar, reliability-bar globbed at tutoring-notes), a verifier subagent spec (`.cursor/agents/verifier.md`), working bootstrap/approval scripts (`run.js` start + `--approve`), model-tiering rules.
- **Phase 1 shipped + on agenticPipeline `master` (2026-07-27, `aa56225`):** **change/iteration run mode** for sibling repos (`--mode change`, `spec.source.path` → tutoring-notes; feature branch; stop at approval, no merge/deploy); **fail-closed approval** (`verification-report.md` with `Result: PASS` required); tutoring-notes-targeted `AGENT-PROMPT` template; unit/CLI tests (`change-mode`, approval-gates, approve CLI). See agenticPipeline `docs/CHANGE-MODE.md`.
- **Still missing for full autonomy:** no programmatic stage loop (today a human pastes `AGENT-PROMPT.md` into a Cursor chat); verifier is a prompt, not invoked; no merge/PR automation; no task queue/isolation; no post-release loop; no pipeline self-CI.
- **tutoring-notes already reinvented the core** (executor → independent verifier → gates) as always-apply rules + the overnight Wave A loop. Phase 1 encodes that loop into pipeline machinery.

## Integration principles (hard)

1. **Never auto-merge to tutoring-notes `master`.** The pipeline may branch, run gates, and request approval; merge stays orchestrator/Andrew. Sarah's production path is sacrosanct.
2. **Fail-closed gates.** Approval blocked unless verification report says PASS. No fail-open. *(Enforced in `run.js` as of Phase 1.)*
3. **tutoring-notes stays a sibling repo** (not nested under `pipeline-projects/`); pipeline orchestrates via `spec.source.path` + `--project-dir`.
4. Reuse tutoring-notes' non-negotiable rules (dedupe / exhaustive-testing / agentic-verification / playwright-on-fix / fragile-surface protections) as the verifier's checklist.

## Phased path (ranked; each a real solid step)

### Phase 1 — encode the change-run unit — **DONE (2026-07-27)**

- **`change`/iteration run mode** in `agenticPipeline` (`spec.source.path` → tutoring-notes sibling; scoped acceptance criteria; work on a feature branch; **stop at approval, no merge**).
- **Fail-closed approval:** `run.js --approve` requires `verification-report.md` with `Result: PASS`.
- **Tutoring-notes `AGENT-PROMPT` template:** `templates/AGENT-PROMPT-change-tutoring-notes.md` — executor → independent verifier (TN rules) → TN gates (`npm run test:wb-affected:run`, `npx next build`) → approval-request.
- **Proof:** `node --test tests/approval-gates.test.js tests/run-approve-cli.test.js tests/change-mode.test.js` in agenticPipeline (19 pass); example spec at `spec/examples/tutoring-notes-change.json`. Merged to agenticPipeline `master` @ `aa56225`.

**How to run (Andrew try-this):**

```bash
cd agenticPipeline
node run.js --mode change --spec spec/examples/tutoring-notes-change.json
# Edit spec first: set source.branch + source.instructions for your chunk
# Paste .pipeline/runs/<runId>/AGENT-PROMPT.md into a new Cursor Agent chat
```

### Phase 2 — make verification executable (next)
- Upgrade `scripts/verify-run.js` from prompt-printer to a real invocation (Cursor Agent SDK/CLI of the verifier agent) **and/or** a deterministic checklist script (intent-coverage parse + `results.json` presence + TN gate exit codes). Without this, "black box" never leaves chat-paste.

### Phase 3 — orchestration + safety rails (later, higher blast radius)
- Real stage loop that advances/checkpoints/retries; task queue + worktree isolation + cost budgets; merge/PR automation with required checks (still no silent master push); pipeline self-CI proving the approve gates; learning aggregation stub. Defer greenfield deploy automation / post-release auto-fix / cloud runner — high blast radius, low help for the release track.

## First concrete step when Andrew greenlights
~~Phase 1~~ **Complete.** Next: drive one Wave A dedupe chunk end-to-end through change mode (branch + gates + verify + approval-request, no merge), then Phase 2 executable verifier.

## Cross-refs
- tutoring-notes: [`.cursor/rules/agentic-verification-pipeline.mdc`](../.cursor/rules/agentic-verification-pipeline.mdc), [`docs/DEDUPE-PLAN.md`](DEDUPE-PLAN.md), BACKLOG `PIPELINE-1`.
- agenticPipeline: `run.js`, `docs/CHANGE-MODE.md`, `stages/`, `.cursor/agents/verifier.md`, `docs/PRINCIPLES.md`, `docs/MASTER-FLOW.md`.
