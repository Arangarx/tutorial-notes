# Platform assumptions

> **Purpose**: a single discoverable inventory of every load-bearing infrastructure, runtime, browser, and OS assumption baked into this codebase. Read this BEFORE migrating to a different compute platform (AWS, Cloudflare, self-hosted), changing managed-service tiers, or onboarding a new external dependency. Each assumption lists *what it is*, *where it's baked in*, and *what breaks if it's violated*.
>
> **Maintenance rule**: any commit that introduces a new platform-level assumption (a hardcoded timeout cap, a per-tier limit dependency, a new external origin, a new runtime requirement) MUST update this doc in the same PR. The orchestrator owns this gate during executor handoffs.
>
> **Capability-contract rule (Andrew, 2026-06-06):** Tie-ins to Vercel-specific functionality are fine while we run on Vercel. Every such dependency MUST be documented here (or in a feature design doc cross-registered here) as: **Vercel X provides capability Y; generic/AWS equivalent = Z.** Include delivery semantics, size/timeout limits, and plan-availability caveats where uncertain — say "verify at build time" rather than assert. This is the standard extension of the maintenance rule above; see §1.7 for the template and §11 for design-stage recording re-architecture entries.
>
> **Last audited**: 2026-08-28 (§1.6 transcribe-sweep cadence `*/15 * * * *`; §2.4b scale-to-zero 300s; TXC-SWEEP-METRICS + NEON-SCALE-TO-ZERO-REVISIT). Prior: 2026-06-07 (Slice 3 smoke fixes: `after()` §1.8, workspace maxDuration=300; Vercel Cron transcription sweep + DB-as-queue transport). Prior full audit: 2026-06-06 (capability-contract rule + recording re-arch design-stage deps).

---

## Quick reference — current platform stack

| Layer | Service | Tier / version | Notes |
|---|---|---|---|
| Compute | Vercel | **Pro** ($20/mo + $20 metered-usage credit) | Upgraded from Hobby 2026-05-17 ~9:00 PM to unblock long-form transcribe. See §1. |
| Database | Neon Postgres | **Launch** (~$19/mo) | Branched: prod branch + dev branch. Preview deploys → dev; Production → prod. Re-pointed 2026-05-17 per Phase 2 task 13. |
| Object storage | Vercel Blob | included in Vercel Pro | **Single shared store across all envs** (per-env split slotted as Phase 2 task 15). |
| Live A/V signaling | `wb.mortensenapps.com` (excalidraw-room fork) | self-hosted WebSocket | Pinned upstream SHA; verify every 90 days. |
| Auth | NextAuth | v4.24.x | Credentials + Google OAuth. Session JWT. |
| AI | OpenAI API | Tier 1 paid (presumed) | Whisper for transcribe; gpt-4o-mini for notes/AI assist. |
| Email | SMTP (optional) | depends on operator config | Falls back to no-op when unset. |
| Domain | Vercel custom + legacy alias | n/a | Production canonical **`https://usemynk.com`** (cutover 2026-05-30); legacy **`tutoring-notes.vercel.app`**. `NEXTAUTH_URL` must match the browser origin. |

**Total fixed/mo as of this audit**: ~$39 (Neon $19 + Vercel $20). OpenAI variable, tracked via `CostEvent`.

---

## 1. Compute platform — Vercel Pro tier

### 1.1 Server-action / serverless function `maxDuration`

- **Assumption**: Vercel **Pro** tier (300-second hard ceiling on serverless function execution).
- **Where baked in**:
  - `src/app/admin/students/[id]/page.tsx:41` — `export const maxDuration = 300;`
  - `src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/page.tsx` — `export const maxDuration = 300;` (raised from 60 → 300 in slice-3 rework; required so deleteWhiteboardSessionAndDataAction cascade completes within budget)
  - `src/lib/transcribe.ts` — Whisper-per-part loop parallelized with concurrency cap 6 (`WHISPER_INNER_CONCURRENCY`) post-Tier-1 (shipped 2026-05-17). Assumes 300s wall-clock budget at the action boundary.
  - `src/app/admin/students/[id]/actions.ts` — `transcribeAndGenerateAction` outer per-segment loop, parallelized with cap 3 (`TRANSCRIPT_OUTER_CONCURRENCY`) post-Tier-1.
  - `src/app/admin/students/[id]/whiteboard/actions.ts` — whiteboard transcribe path, same outer-cap-3 pattern (`WB_TRANSCRIPT_OUTER_CONCURRENCY`).
- **What breaks if violated**:
  - **Hobby tier (60s ceiling)**: long-form transcribe (>5 min audio) silently times out. Sarah's April 24 50-min recording hit this. `maxDuration = 300` declarations are silently plan-capped to 60s without any warning. **Re-introducing Hobby = re-breaking long-form transcribe for the pilot.**
  - **AWS Lambda default (~15 min hard max, but 30s default)**: depends on configured timeout per function. If migrating, every `maxDuration` declaration must be re-validated against the new platform's per-function timeout config. Lambda's 900s ceiling is generous, but the per-invocation cost model changes.
  - **Cloudflare Workers (CPU-time limits, ~30s wall-clock)**: incompatible without major refactor — long-running synchronous transcribe loops would never fit. Would force Tier 2 background queue work.
- **Migration check**: confirm new platform's per-function/per-action wall-clock ceiling ≥ 300s before deploying. Re-test `transcribeAndGenerateAction` with a 60-min audio fixture against the new platform's Preview URL.

### 1.2 Function runtime (Node.js, not Edge)

- **Assumption**: Routes that read/write binary buffers (audio, blobs, ffmpeg) run on **Node.js runtime**, NOT Edge runtime.
- **Where baked in** (explicit `export const runtime = "nodejs"`):
  - `src/app/api/whiteboard/[sessionId]/tutor-asset/route.ts:12`
  - `src/app/api/w/[joinToken]/wb-asset/route.ts:14`
  - `src/app/api/whiteboard/[sessionId]/math/render/route.ts:32`
  - Other API routes default to Node.js implicitly; explicit declaration is for clarity where binary handling is critical.
- **What breaks if violated**:
  - Edge runtime lacks `Buffer`, full `fs`, `node:child_process` (used by `ffmpeg-static`), and the Prisma client (without Edge-compatible driver).
  - `transcribe-ffmpeg.ts` literally cannot run on Edge — it spawns ffmpeg subprocess.
- **Migration check**: any platform that doesn't support Node.js-runtime serverless (e.g. Workers-only) requires extracting ffmpeg-bound work into a separate compute (container, dedicated worker).

### 1.3 Edge function `maxDuration`

- **Assumption**: No Edge functions in current code (all explicitly Node.js or default Node.js).
- **What breaks if violated**: n/a today; flag for future. If anyone migrates a route to Edge runtime to gain global distribution, Vercel's Edge `maxDuration` is 25s (Hobby) / 30s (Pro) — much tighter than Node.js function ceiling.

### 1.4 Build execution

- **Assumption**: Build environment has **git** and **Node** available. `ignoreCommand` runs `node scripts/vercel-ignore-build.cjs`, which shells out to `git diff $VERCEL_GIT_PREVIOUS_SHA HEAD --name-only`.
- **Where baked in**: `vercel.json` (`ignoreCommand`), `scripts/vercel-ignore-build.cjs`.
- **Env var**: `VERCEL_GIT_PREVIOUS_SHA` — last commit deployed on this branch. When unset (first deploy on a branch), the script **builds** (fail-safe).
- **Polarity**: exit **0 = skip** deploy, exit **1 = run** build (Vercel convention; inverted polarity previously shipped — see `docs/BACKLOG.md` Vercel ignored build step).
- **What breaks if violated**: docs/rule-only commits re-trigger full builds (cost + time). Missing git/Node or `VERCEL_GIT_PREVIOUS_SHA` on a new platform → script fails safe to BUILD. Wrong exit polarity would skip real code deploys.
- **Migration check**: confirm new platform exposes a previous-deploy SHA env var and supports an `ignoreCommand`-equivalent with the same exit-code semantics; port or reimplement `scripts/vercel-ignore-build.cjs`.

### 1.5 Prisma migrate at deploy time

- **Assumption**: `npm run build` runs `node scripts/migrate-with-retry.mjs` which calls `prisma migrate deploy` against `DATABASE_URL` BEFORE `next build`.
- **Where baked in**: `package.json:7`
- **What breaks if violated**:
  - If `DATABASE_URL` is misconfigured (e.g. Preview pointing at prod — see Phase 2 task 13 incident), migrations apply to the WRONG database. Caught 2026-05-17 when cost-events migration landed on prod from a Preview build. Additive migrations are harmless; DROP/RENAME/NOT NULL would have broken prod.
  - Phase 2 task 13 (env-scoping audit + `scripts/safe-migrate.mjs` guard) is the structural hardening; not yet shipped.
- **Migration check**: any new platform must support per-environment `DATABASE_URL` scoping AND run migrate-deploy with strict env separation. Add the `safe-migrate.mjs` guard if not already shipped.

### 1.6 Vercel Cron — transcription backstop sweep

- **Capability provided**: Scheduled GA HTTP trigger (cron expression → GET to a serverless route on a fixed cadence).
- **Why we depend on it**: Recording re-arch Phase 1 D2 durable async transport — `TranscriptChunk` rows with `status=pending` (or retryable `failed`) are the durable queue; the cron sweep at `/api/cron/transcribe-sweep` catches orphans when the immediate fire-and-forget worker attempt dies with the function instance. End-session sweep is a separate layer (slice 3).
- **Generic / AWS equivalent**: **Amazon EventBridge Scheduler** (or EventBridge rules) → **API Gateway / Lambda** or any HTTP endpoint.
- **Where baked in**:
  - `vercel.json` — `crons` entry: `*/15 * * * *` → `/api/cron/transcribe-sweep` (every 15 minutes on **Pro**; Hobby minimum is once/day — verify plan at deploy time). Slowed 2026-08-28 from `* * * * *` until sweep-usefulness metrics exist (BACKLOG TXC-SWEEP-METRICS); every-minute cadence was waking Neon continuously.
  - `src/app/api/cron/transcribe-sweep/route.ts` — auth via `CRON_SECRET` + `Authorization: Bearer` header (standard Vercel Cron pattern).
  - `src/lib/recording/transcribe-sweep.ts` — bounded batch + time-budget sweep over stale `TranscriptChunk` rows.
- **Env var**: `CRON_SECRET` — **required** for cron auth. Vercel sends `Authorization: Bearer <CRON_SECRET>` when this env var is set. **Setting it in Vercel project env is a greenlight-gated follow-up for the operator** (MCP write-safety); until set, cron invocations are rejected with 401.
- **DB-as-queue pattern** (portable): durable work lives in Postgres (`TranscriptChunk.status` + `attempts` + `updatedAt`); any platform with a DB + a periodic scheduler can replicate the transport without Vercel Queues.
- **What breaks if violated**: orphaned `pending` chunks never transcribe if both the immediate attempt and cron are absent; cron without `CRON_SECRET` is a no-op (401). Migrating off Vercel requires replicating the schedule + authenticated HTTP trigger.
- **Migration check**: provision EventBridge (or equivalent) on the same cadence; protect the sweep endpoint with a shared secret; confirm batch/time-budget fits the new platform's per-invocation ceiling (§1.1).

### 1.9 Vercel Cron — erasure worker batch

- **Capability provided**: Scheduled GA HTTP trigger (cron expression → GET to a serverless route).
- **Why we depend on it**: Learner/family right-to-erasure (E5a) — `ErasureJob` rows in `requested` (past `purgeEligibleAt`), `blobs_purging`, or `db_scrubbing` are advanced by `processErasureBatch` at `/api/internal/erasure/process`. Tombstone is immediate at request time; cron drives blob + DB purge after the 7-day grace window and resumes partial jobs.
- **Generic / AWS equivalent**: **Amazon EventBridge Scheduler** → HTTP/Lambda consumer with shared-secret auth.
- **Where baked in**:
  - `vercel.json` — `crons` entry: `0 */6 * * *` → `/api/internal/erasure/process` (every 6 hours on **Pro**).
  - `src/app/api/internal/erasure/process/route.ts` — GET (cron) + POST (manual); auth via `ERASURE_WORKER_SECRET` or `CRON_SECRET` bearer (`src/lib/erasure/erasure-worker-auth.ts`).
  - `src/lib/erasure/process-erasure-batch.ts` — bounded batch (`take: 10`) calling `processErasureJob` per row.
  - `scripts/erasure-resume.ts` — CLI `npm run erasure:resume -- --jobId=<id>` for support/manual single-job resume.
- **Env vars**:
  - `ERASURE_WORKER_SECRET` — dedicated bearer for manual/support POST invocations. **Greenlight-gated** Vercel env setup (MCP write-safety).
  - `CRON_SECRET` — Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`; accepted as fallback when `ERASURE_WORKER_SECRET` is unset or for cron-only deploys (same pattern as §1.6).
- **Blob API reliance**: `processErasureJob` enumerates and `deleteBlob`s per family scope; large families depend on Vercel Blob list/delete throughput and the route's `maxDuration = 300` (§1.1) to finish a batch within one invocation. Per-job progress is persisted on `ErasureJob.blobsDeletedJson`; transient Blob API errors leave the job resumable on the next cron tick.
- **What breaks if violated**: jobs stuck in `requested` past grace never purge without cron or CLI resume; missing secrets → 401 on worker route; Blob rate limits → prolonged `blobs_purging` (access still denied via tombstone).
- **Migration check**: replicate schedule + authenticated HTTP trigger; set `ERASURE_WORKER_SECRET` (or equivalent) for non-cron callers; confirm batch size × per-job blob count fits target platform timeout.

### 1.8 Next.js `after()` — deferred post-response work

- **Capability provided**: `after(callback)` from `next/server` schedules an async callback that runs **after** the HTTP response is sent but **before** the serverless function terminates, keeping the function alive (up to `maxDuration`) until the callback resolves.
- **Why we depend on it**: Recording re-arch Phase 1, Slice 3 — the transcription pipeline (`enqueueChunkTranscribe`) and notes pipeline (`enqueueNotesReduce`) previously used bare `void (async () => {...})()` fire-and-forget patterns. Vercel terminates the function when the response is sent, dropping those in-flight promises. On Production the Vercel Cron sweep recovers `pending` chunks; on Preview (no cron) notes never generate. `after()` eliminates this gap.
  - `src/lib/recording/chunk-transcribe-enqueue.ts:fireAndForgetWorker` — chunk transcription worker
  - `src/lib/recording/notes-enqueue.ts:fireAndForgetReduce` — notes reduce worker (with polling loop up to 4.5 min)
  - `src/lib/recording/concat-audio-enqueue.ts:enqueueReplayConcatAfterFinalize` — WS-G post-finalize replay concat (best-effort; does not delay the notes path; silent no-op on failure; no cron backstop — multi-segment replay is the fallback)
  - All three require `maxDuration = 300` on the workspace route segment.
- **Generic / AWS equivalent**: **Lambda extension** (lifecycle hook) or **SQS trigger** (fire a message and let Lambda consume it). The `after()` pattern is a short-cut; longer workloads should use queues. See §11.1–§11.2 for the future Queues/SQS migration path.
- **Where baked in**:
  - `src/lib/recording/chunk-transcribe-enqueue.ts` — `import { after } from "next/server"`
  - `src/lib/recording/notes-enqueue.ts` — same
  - `src/lib/recording/concat-audio-enqueue.ts` — same
  - `src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/page.tsx` — `export const maxDuration = 300`
- **Important limits**:
  - `after()` is stable in Next.js 15 (available as `import { after } from "next/server"`). Do NOT use the unstable `unstable_after` alias from Next.js 14.
  - The deferred work still runs within the function's `maxDuration` ceiling (300s Pro tier). If notes reduce needs > 300s the notes will be partial and cron/regenerate picks up the remainder.
  - `after()` is NOT available in Edge runtime (§1.3). All call sites must run on Node.js runtime (§1.2). ✓
  - On Vercel Preview, cron does NOT run (§1.6), so `after()` is the ONLY backstop for transcription and notes on preview deployments.
- **Migration check**: on AWS Lambda, replace `after()` with an SQS message publish (or Step Functions enqueue) so the function returns immediately and the consumer handles the work asynchronously with its own timeout. Update §11.1–§11.2 entries when that migration happens.

### 1.7 Capability-contract documentation standard

- **Assumption**: Every Vercel-specific (or otherwise platform-specific) dependency is recorded as a **capability contract**, not merely a product name.
- **Required fields** (use in this doc, feature STATUS docs, or design docs cross-registered here):
  1. **Platform primitive** — e.g. Vercel Queues, Vercel Blob multipart.
  2. **Capability provided** — the functional contract (e.g. "at-least-once push delivery to a serverless consumer with retry").
  3. **Why we depend on it** — which pipeline step or code path.
  4. **Generic / AWS equivalent** — e.g. SQS + Lambda, S3 multipart upload, Step Functions.
  5. **Migration notes / gotchas** — delivery semantics, ordering, limits, plan gates; "verify at build time" when limits are uncertain.
- **Where baked in**: this doc; feature design docs (e.g. [`docs/handoff/recording-rearchitecture-design-2026-06-05.md`](handoff/recording-rearchitecture-design-2026-06-05.md) § "Vercel-specific dependencies & migration map").
- **What breaks if violated**: future migration (AWS, self-hosted, etc.) rediscovers hidden coupling at cutover time — missing queues, wrong timeout model, or blob upload semantics that don't match production durability guarantees.
- **Migration check**: before any platform move, walk §11 design-stage entries + every §1–§10 production entry; each "no equivalent provisioned" is a blocker.

---

## 2. Database — Neon Postgres

### 2.1 Branching model (prod vs dev)

- **Assumption**: Neon has a **production branch** and a **development branch**. Production deploys read/write prod; Preview deploys read/write dev.
- **Where baked in**: Vercel environment variable scoping (Preview overrides `DATABASE_URL` + `DIRECT_URL` to dev branch values).
- **What breaks if violated**: Preview testing writes to prod, OR Production reads from dev. Either is catastrophic.
- **Migration check**: any DB platform needs equivalent branch / namespace separation. RDS would need separate instances or schemas with separate URLs.

### 2.2 Connection pooling (`pgbouncer=true`)

- **Assumption**: `DATABASE_URL` uses Neon's pooled connection (with `?pgbouncer=true`); `DIRECT_URL` uses non-pooled (for migrations).
- **Where baked in**: `.env` (gitignored), `src/lib/env.ts` (DATABASE_URL + DIRECT_URL both required by Zod schema).
- **What breaks if violated**:
  - Without pooled `DATABASE_URL`: Prisma exhausts Neon's connection limit under serverless concurrency.
  - Without separate `DIRECT_URL`: Prisma migrations fail (PgBouncer doesn't support some migration-time queries).
- **Migration check**: replicate the pooled/direct split on any new Postgres provider. RDS Proxy is the AWS equivalent.

### 2.3 In-memory state does NOT persist on Vercel serverless

- **Assumption**: Module-global `Map`/`Set` variables reset on every cold start and are NOT shared between concurrent serverless instances.
- **Where baked in**:
  - `src/lib/rate-limit.ts` — general-purpose sliding-window limiter (module-global `Map`). Used for per-IP API buckets, AH login (IP coarse layer), 2FA verify (IP coarse layer) in middleware. Cold-start reset makes these *more* generous, not less — acceptable for low-severity abuse prevention.
  - **Exception (durable, 2026-06-03):** `src/lib/learner-pin-rate-limit.ts` — IAC-10 learner PIN soft cooldown + hard lock. Backed by the `LearnerLoginThrottle` Neon table; **durable across cold starts, shared across instances**. Hard lock at 13 IP-independent failures persists until explicit parent unlock.
  - **Exception (durable, 2026-06-04):** `src/lib/auth-rate-limit.ts` — IAC-11 AH-login (`ah-login:<normalizedEmail>`) and 2FA-verify (`2fa-verify:<adminUserId>`) rate limiters. Backed by the `AuthThrottle` Neon table; **durable across cold starts, shared across instances**. 10 req/min (AH login) and 20 req/min (2FA verify); primary key is stable identity (email / adminUserId), not IP. IP coarse check preserved in middleware as defense-in-depth. See `docs/BACKLOG.md` § Security for remaining in-memory LOW limiters.
- **What breaks if violated**: any rate limiter that truly must NOT reset on cold start (auth lockouts, brute-force guards on short secrets) MUST be Neon-backed. An in-memory limiter for these cases silently becomes ineffective on Vercel.
- **Migration check**: if migrating to a platform with persistent instances (e.g. a long-lived container), the `LearnerLoginThrottle` table approach is still correct (DB is the source of truth). The `rate-limit.ts` in-memory limiters would benefit from Redis or equivalent on a persistent platform.

### 2.4 Idle connection timeout

- **Assumption**: Neon aggressively closes idle connections (~30-60s of inactivity). Scripts that hold a connection while doing long external work (e.g. Vercel Blob LIST) need defensive reconnect.
- **Where baked in**:
  - `scripts/blob-cleanup.mjs` — `withConnectionRetry` wrapper added after the housekeeping smoke surfaced "Server has closed the connection" on `prisma.sessionRecording.findMany()` post-`listAllBlobs()`.
  - Pattern: load DB reference sets immediately after `$connect()`, before any long external call.
- **What breaks if violated**: similar timeouts on other managed Postgres (Supabase, Render) can produce identical symptoms. Self-hosted Postgres typically has more generous defaults but still applies under load.
- **Migration check**: validate idle timeout on new provider; either configure longer timeout or add `withConnectionRetry` wrapper to any script holding a connection during external API calls.

### 2.4b Scale to zero (compute suspend)

- **Assumption (Andrew 2026-08-28):** production + preview-dev + project default use `suspend_timeout_seconds=300` (5 min idle → scale to zero). Always-on (`0` / `-1`) was burning ~314 CU-hours in August with almost no user traffic.
- **Where baked in**: Neon Console / API endpoint settings (not in-repo). First-request-after-idle mitigations: `docs/DEPLOY.md` (`connect_timeout=60`, migrate retry); app `withDbRetry`.
- **What breaks if violated**: first page load after idle can take ~0.5–3s (compute wake). A live session keeps compute awake. Revisit always-on **only** if real-lesson usage shows user-visible cold-start failures — BACKLOG **NEON-SCALE-TO-ZERO-REVISIT**.
- **Migration check**: any serverless Postgres with scale-to-zero needs the same first-connect timeout/retry story.

### 2.4 Additive migrations policy

- **Assumption**: Migrations are **strictly additive**. No DROP COLUMN, no RENAME, no NOT NULL on existing tables without a multi-step migration. Per AGENTS.md convention.
- **Where baked in**: `prisma/migrations/` directory; all historical migrations are additive.
- **What breaks if violated**: production data loss; old deployed code can't read renamed columns; outbox-in-flight rows reference dropped fields.
- **Migration check**: this is a policy, not a platform constraint — preserve the policy across providers.

### 2.4a ErasureJob grace window (E1)

- **Assumption**: Learner/family right-to-erasure is orchestrated via durable `ErasureJob` rows. Blob purge and DB scrub phases must not run until `now() >= purgeEligibleAt` (`requestedAt` + 7 days). Tombstone + access denial in the `requested` phase is immediate (service code in E2+). Partial unique index `erasure_job_active_scope` allows at most one in-flight job per `(scopeKind, scopeId)`.
- **Where baked in**: `prisma/schema.prisma` (`ErasureJob`, `Student.erasedAt`); migration `20260701000000_erasure_job_and_student_erased_at`.
- **Deferred follow-ups (pilot scale):** `WhiteboardAsset` inventory table (H-3), `ErasureJobBlob` child rows (M-5) — not in E1.

### 2.5 The duplicate `_prisma_migrations` row (pre-existing issue)

- **Assumption**: There's a known duplicate row for `20260418000000_multi_recording` in both prod and preview-dev `_prisma_migrations` tables (one with `finished_at` set, one with NULL). Currently harmless; flagged in Phase 2 task 14 as "investigate + clean up."
- **What breaks if violated**: future `prisma migrate deploy` may retry the NULL-finished_at migration unexpectedly.

---

## 3. Object storage — Vercel Blob

### 3.1 Single shared blob store across environments

- **Assumption**: One Vercel Blob store serves both Production and Preview deploys. Blob URLs created during Preview testing are referenced by dev DB only; from prod DB's perspective they look like orphans.
- **Where baked in**: `BLOB_READ_WRITE_TOKEN` is the same token across all envs.
- **What breaks if violated** (or rather, the current safety constraint): `scripts/blob-cleanup.mjs` REQUIRES `PROD_DATABASE_URL` AND `DEV_DATABASE_URL` and only marks a blob as orphan if NEITHER references it. Removing the dual-DB check would risk deleting live dev-environment blobs.
- **Roadmap**: Phase 2 task 15 (separate Blob store per env) is the cleaner architecture. Until then, dual-DB-check is the safety net.
- **Migration check**: any new object storage (S3, R2) should either (a) have per-env buckets from day one, or (b) maintain the dual-reference-check pattern.

### 3.2 Token-based blob auth (no public URLs for student content)

- **Assumption**: Blob URLs require `BLOB_READ_WRITE_TOKEN` for read access; share links use tokenized + revocable URLs (NOT public blob URLs).
- **Where baked in**:
  - `src/lib/blob.ts` — wrapper around `@vercel/blob` SDK.
  - `src/app/api/whiteboard/[sessionId]/tutor-asset/route.ts` etc. — proxies blob reads with auth assertion.
  - `src/lib/whiteboard/resolve-asset-read-url.ts` — resolves tokenized read URLs.
- **What breaks if violated**: student / parent / session-recording content becomes publicly accessible if Blob URLs leak. Critical privacy / safety violation per AGENTS.md "Share links are tokenized + revocable" convention.
- **Migration check**: S3-style migration must replicate signed-URL pattern with short expiry.

### 3.3 Protected path patterns (orphan detection)

- **Assumption**: Two pathname patterns under the blob store are NEVER detected as orphans because their references live inside the events.json blob (not in any DB column):
  - `whiteboard-sessions/{sid}/{wsid}/assets/...` — tutor-inserted image assets, referenced via `customData.assetUrl` in Excalidraw scene state.
  - `whiteboard-checkpoints/...` — IndexedDB checkpoints, no DB reference by design.
- **Where baked in**: `scripts/blob-cleanup-logic.mjs:isPathProtected`.
- **Roadmap**: Phase 2 task 16 — events.json content-aware orphan detection (Option B follow-up) — would allow safe cleanup of genuinely-orphaned asset blobs.
- **Migration check**: replicate this defensive pattern when porting cleanup logic to a new object store. Loosening it requires implementing events.json parsing.

### 3.4 Direct client-to-blob upload (audio)

- **Assumption**: Audio segments upload **client → Vercel Blob directly** via a token issued by our server. Our server never sees the audio bytes during upload.
- **Where baked in**:
  - `src/lib/recording/upload.ts:uploadAudioDirect`
  - `src/app/api/upload/blob/route.ts` (`kind: "audio"`)
- **What breaks if violated**: rate-limit + bandwidth on our server for large audio uploads. Critical for Sarah's 60-90 min sessions.
- **Migration check**: S3 pre-signed PUT URLs are the equivalent pattern.

### 3.5 Multipart upload for canonical audio — **DESIGN-STAGE / NOT-YET-BUILT**

> **Status:** Planned in recording re-architecture Phase 1 — **not in production code.** Full capability contract: [`docs/handoff/recording-rearchitecture-design-2026-06-05.md`](handoff/recording-rearchitecture-design-2026-06-05.md) § "Vercel-specific dependencies & migration map". Promote to production assumption when Phase 1 merges.

- **Vercel primitive**: Vercel Blob SDK `put(..., { multipart: true })`.
- **Capability provided**: Multipart/resumable upload for large canonical merged audio files after server-side ffmpeg concat.
- **Why we depend on it**: Consolidation workflow (D6) uploads `sessions/{studentId}/{wbsid}/canonical.webm`; long sessions may produce files where single-request upload is less reliable.
- **Generic / AWS equivalent**: **S3 multipart upload** (`CreateMultipartUpload` / `UploadPart` / `CompleteMultipartUpload`).
- **Migration notes**: Verify at build time — min part size, max object size, immutability/versioning behavior. Design assumes write-once canonical + HEAD verify before DB status flip; segment blobs deleted only after canonical verified durable.

---

## 4. External APIs

### 4.1 OpenAI transcription models

- **Assumption**: Primary chunk transcription uses `gpt-4o-mini-transcribe`; fallback (silence-hallucination guard) uses `whisper-1`. Legacy single-shot transcribe (`src/lib/transcribe.ts`) uses `whisper-1`. Per-call file size limit **25 MB** (`WHISPER_MAX_BYTES` in `src/lib/transcribe-constants.ts`). Rate limit: ~50 RPM at Tier 1 paid.
- **Env overrides** (optional; defaults above when unset — resolved in `src/lib/ai-models.ts`):
  - `OPENAI_TRANSCRIBE_PRIMARY_MODEL` — recording chunk pipeline primary model.
  - `OPENAI_TRANSCRIBE_FALLBACK_MODEL` — fallback engaged by quality guard in `transcribe-chunk.ts` (response format is coupled to this value: fallback path uses `verbose_json`).
  - `OPENAI_LEGACY_TRANSCRIBE_MODEL` — legacy `transcribe.ts` single-shot path.
- **Where baked in**:
  - `src/lib/ai-models.ts` — resolved model names from env + defaults.
  - `src/lib/recording/transcribe-chunk.ts` — primary + fallback transcription.
  - `src/lib/transcribe.ts:transcribeSinglePart` — calls `client.audio.transcriptions.create`.
  - `src/lib/transcribe-ffmpeg.ts:splitAudioIntoWhisperParts` — splits files over 25 MB via ffmpeg.
  - `CHUNK_TARGET_BYTES = 22 MB` — ffmpeg-split target leaves 3 MB margin.
- **What breaks if violated**:
  - Larger files than 25 MB → 413 from OpenAI.
  - Concurrency above rate limit → 429; current code does NOT retry (Tier 1 bootstrapper adds retry).
  - Changing `OPENAI_TRANSCRIBE_FALLBACK_MODEL` away from `whisper-1` without validating `responseFormatForModel` coupling may break duration extraction on the fallback path.
- **Migration check**: if switching to AWS Transcribe, Whisper.cpp self-hosted, or any other STT — file size limits + concurrency limits differ. Re-validate splitter constants and update `estimateCostUsd` rate-card if model family changes.

### 4.2 OpenAI Chat Completions (gpt-4o-mini family)

- **Assumption**: `gpt-4o-mini` model for map/reduce auto-notes, legacy single-shot notes, and AI form-fill. Token limits per request: 128k input / 16k output.
- **Env overrides** (optional; default `gpt-4o-mini` when unset — resolved in `src/lib/ai-models.ts`):
  - `OPENAI_MAP_MODEL` — per-chunk map extraction (`extract-chunk.ts`).
  - `OPENAI_REDUCE_MODEL` — session reduce / TutorNote generation (`notes-worker.ts`).
  - `OPENAI_LEGACY_NOTES_MODEL` — legacy single-shot notes (`ai.ts`).
- **Where baked in**:
  - `src/lib/ai-models.ts` — resolved model names from env + defaults.
  - `src/lib/ai.ts` — legacy GPT notes call site.
  - `src/lib/recording/extract-chunk.ts` — map phase.
  - `src/lib/recording/notes-worker.ts` — reduce phase.
  - `src/lib/observability/cost-events.ts:estimateCostUsd` — pricing table baked in (captured 2026-05-17). **If OpenAI changes prices or a swapped model is outside the gpt-4o-mini / whisper families, cost rows still log but `estimatedCostUsd` may be `undefined`.**
- **What breaks if violated**: cost estimates drift from actual OpenAI invoice; long transcripts (>128k tokens, ~100k words) silently truncate.
- **Migration check**: model changes require updating the pricing table; provider changes (Anthropic, etc.) require new estimate logic + a new `CostEvent.model` enum entry.

### 4.3 Google OAuth (Connect Gmail + Connect Google Calendar)

- **Assumption**: `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` configured at the deployer level; OAuth callback URLs must match Google Cloud Console allowed redirect URIs.
- **Flows** (same client credentials, **different** redirect URIs and scopes):
  - **Gmail send** — `/api/auth/gmail/callback`; scopes `gmail.send` + `userinfo.email`; optional `GMAIL_CONNECT_ALLOWLIST` per-admin gating.
  - **Google Calendar connect (stub)** — `/api/auth/calendar/callback`; scopes `calendar.events` + `calendar.readonly` + `userinfo.email`; **no allowlist** (any signed-in admin may connect; first chunk).
  - **NextAuth sign-in** — `/api/auth/callback/google`; scopes `openid email profile` only (separate from both connect flows).
- **Where baked in**: `src/lib/env.ts` (optional env vars); `GMAIL_CONNECT_ALLOWLIST` for Gmail only.
- **What breaks if violated**: Gmail send fails; Calendar connect fails; degrades gracefully (no crash).
- **Migration check**: changing `NEXTAUTH_URL` (e.g. moving to a new domain) requires re-adding **both** callback URLs in Google Cloud Console.
- **Production cutover (2026-05-30)**: canonical app host is `https://usemynk.com`; Production `NEXTAUTH_URL` matches. Preview/Dev remain on `*.vercel.app` unless explicitly re-pointed.

### 4.4 SMTP (real email)

- **Assumption**: SMTP server is optional. When unset (`SMTP_HOST` empty), emails are skipped (no error, no crash). Per `src/lib/env.ts:isEmailConfigured`.
- **Migration check**: if email becomes mandatory for any feature (e.g. dunning in Phase 10), `isEmailConfigured` check needs to fail-loud not fail-silent.

---

## 5. Networking, security, real-time

### 5.1 Whiteboard sync server (excalidraw-room fork)

- **Assumption**: WebSocket relay at `WHITEBOARD_SYNC_URL` (currently `wss://wb.mortensenapps.com`). Self-hosted (separate `whiteboard-sync` repo); upstream SHA pinned in `whiteboard-sync/README.md`.
- **Where baked in**:
  - `src/lib/env.ts` — `WHITEBOARD_SYNC_URL` validated to start with `wss://` or `ws://`.
  - `src/lib/whiteboard/sync-client.ts` — WebSocket client.
  - `src/lib/security/csp.ts` — `connect-src` includes this origin (built dynamically at module load).
- **What breaks if violated**:
  - Wrong protocol (http vs wss) → CSP block + connection failure.
  - Origin not in `connect-src` → browser refuses WebSocket.
  - Stale upstream SHA → protocol drift; phase 2 task 9 covers the 90-day verification cadence.
- **Migration check**: a managed alternative (Liveblocks, Pusher) would need protocol-shape adaptation. Self-hosted on AWS/GCP would just need DNS + TLS termination.

### 5.2 WebRTC peer-mesh signaling + STUN

- **Assumption**: Peer mesh (≤5 participants — Sarah's realistic max). Signaling tunneled through the existing sync-client WebSocket (additive `webrtc-signal` envelope). Public Google STUN servers; no TURN configured.
- **Where baked in**:
  - `src/lib/av/peer-mesh.ts`, `src/lib/av/signaling.ts`
  - `src/lib/av/webrtc-ice-from-env.ts` — pulls ICE config from env (currently STUN-only).
  - `docs/LIVE-AV.md` — 11 numbered invariants (canonical reference).
- **What breaks if violated**:
  - Cellular peers behind symmetric NAT → ICE-failure with no TURN fallback. Currently a known gap; slotted for "TURN deployment when NAT issues surface."
  - More than ~5 peers → mesh fan-out becomes O(N²) bandwidth on the tutor's connection; would need SFU.
- **Migration check**: if launching paid plans (Phase 10), provision a TURN service (Twilio, Xirsys, self-hosted coturn) before tutors at scale hit it.

### 5.3 CSP — site-wide, locked

- **Assumption**: Content-Security-Policy is built once at module load from `WHITEBOARD_SYNC_URL`. Every external origin (sync server, embed, font CDN) must be added explicitly in `src/lib/security/csp.ts`.
- **Where baked in**:
  - `src/middleware.ts:CONTENT_SECURITY_POLICY`
  - `src/lib/security/csp.ts:buildContentSecurityPolicy` + `buildPermissionsPolicy`
  - Regression pinned: `src/__tests__/regressions/csp-headers.test.ts`
- **What breaks if violated**: any new external origin (e.g. embedding a YouTube video, adding a font CDN, calling a new third-party API) silently fails until added to CSP. Per AGENTS.md convention, document the addition in the feature's STATUS doc.

### 5.3.1 JSXGraph coordinate-plane embed (self-hosted)

- **Assumption**: Graphing uses **self-hosted JSXGraph** (`jsxgraph` npm package). Assets are copied to `public/jsxgraph/` (CSS) and loaded via dynamic `import("jsxgraph")` — **no external CSP origins**. Graph state (expressions + bounding box) persists in Excalidraw `customData.graphStateJson` and syncs through the existing scene pipeline. Rendering uses Excalidraw's `renderEmbeddable` prop with sentinel link `mynk://graph` — **not an iframe**.
- **Where baked in**:
  - `src/components/whiteboard/GraphEmbeddable.tsx` + `src/lib/whiteboard/graph-state.ts` + `graph-persist.ts`
  - `src/lib/whiteboard/insert-asset.ts:GRAPH_EMBED_LINK` + `insertGraphOnCanvas`
  - `src/lib/whiteboard/validate-embeddable.ts` (sentinel-only allowlist)
  - Tutor + student `renderEmbeddable` wiring (`WhiteboardWorkspaceClient`, role-parameterized for both — the student route renders the same component via `WhiteboardSessionShell role="student"`)
  - `frame-src 'self'` only — Desmos origins removed from CSP (2026-06-10 Phase 2b)
- **Legacy read**: Old pilot sessions may still contain Desmos iframe embeds in the event log (`type: "desmos"`). `excalidraw-adapter.ts` maps them for replay without throwing; they no longer render live (CSP blocks external iframes) — acceptable per pilot scope.
- **What breaks if violated**: graph insert shows "Empty Web Embed" if `link`/`validateEmbeddable` drift; student board shows stale graph if `renderEmbeddable` or `graphStateJson` re-hydrate path is removed.
- **Migration check**: new embeddable features should prefer `renderEmbeddable` on `'self'` over third-party iframes to avoid multi-directive CSP expansion.

### 5.4 Permissions-Policy MUST be site-wide (not per-route)

- **Assumption**: `Permissions-Policy: camera=(self), microphone=(self), geolocation=()` is applied site-wide.
- **Why**: Next.js App Router server-action redirects perform a CLIENT-SIDE navigation that reuses the existing document, and Permissions-Policy is per-document. Per-route policy would let `camera=()` from a non-AV page persist after soft-nav into the workspace, blocking `getUserMedia({video:true})` until hard refresh.
- **Where baked in**: `src/middleware.ts` (via `buildPermissionsPolicy` with site-wide returns); `src/lib/security/csp.ts` JSDoc explains the regression history.
- **What breaks if violated**: live A/V mounting silently fails after server-action soft-nav; users see a permission-denied prompt with no obvious cause.
- **Migration check**: any framework with server-action-style soft-nav (Remix, etc.) has the same gotcha. Apply site-wide.

### 5.5 NextAuth session domain

- **Assumption**: `NEXTAUTH_URL` matches the deployed origin. Session cookies are scoped to that origin.
- **What breaks if violated**: login redirects loop; sessions don't persist; Google OAuth callback fails.
- **Migration check**: changing primary domain requires updating `NEXTAUTH_URL` AND Google OAuth redirect URIs simultaneously.
- **Production cutover (2026-05-30)**: Production `NEXTAUTH_URL` is `https://usemynk.com` (apex; `www` 308-redirects). Preview/Dev `NEXTAUTH_URL` unchanged on `*.vercel.app`.

### 5.6 Server-action ownership assertions

- **Assumption**: Every server action that touches student data calls `assertOwnsStudent(adminUserId, studentId)` (or equivalent) before mutation/read.
- **Where baked in**: `src/app/admin/students/[id]/actions.ts`, `src/app/admin/students/[id]/whiteboard/actions.ts`, ownership-assertion helpers.
- **What breaks if violated**: cross-tenant data leak between admin users sharing the same deployment.
- **Migration check**: this is a code-discipline assumption, not a platform one. Preserve across any backend.

### 5.7 Rate-limit middleware

- **Assumption**: In-memory rate-limit (process-local, NOT distributed). Per `src/middleware.ts`:
  - Auth bucket: 10 req/min per IP (Phase 2 task 10 wants to bump to 30).
  - Setup bucket: 5 req/min per IP.
  - API buckets: per-path via `src/lib/security/api-rate-buckets.ts`.
- **What breaks if violated**:
  - Multi-instance deployment (e.g. multiple Vercel regions, K8s pods): rate-limit is process-local, so attackers could distribute across instances. Acceptable today (Vercel typically single-region per function); flag if scaling to multi-region.
  - Bumping `AUTH_RATE_LIMIT.max` from 10→30 is Phase 2 task 10 (Andrew trip-points during normal use).
- **Migration check**: distributed deployments need Redis-backed rate-limiting.

### 5.8 Host allowlist for auth email links (RC-A fix, 2026-06-05)

- **Assumption**: `getRequestBaseUrlSafe()` in `src/lib/public-url.ts` reflects the incoming request host into verify-email links ONLY if the host matches the `ALLOWLISTED_HOST_PATTERNS` array. Any unrecognised host falls back to `getPublicBaseUrl()` (env-derived; injection-safe).
- **Why it exists**: Vercel preview deployments assign a per-deployment `VERCEL_URL` host AND a stable branch-alias host. Before RC-A fix, `getPublicBaseUrl()` returned the per-deployment URL; the user might be browsing on the branch-alias URL. Different hosts = different cookie jars = the `mynk_ah_session` cookie misses on the claim page. Reflecting the request host into the verify email link aligns the cookie domain with the user's browsing host.
- **Allowlist contents** (project-scoped; see `src/lib/public-url.ts:ALLOWLISTED_HOST_PATTERNS`):
  - `localhost` / `127.0.0.1` (any port) — local dev
  - `tutoring-notes.vercel.app` — project legacy default Vercel domain
  - `tutoring-notes-*-arangarx-5209s-projects.vercel.app` — per-deployment and branch-alias preview URLs for this project+team; team slug scopes it to the `arangarx-5209s-projects` Vercel team only
  - `usemynk.com`, `www.usemynk.com` — production canonical hosts
- **Injection guard**: a host NOT in the allowlist is NEVER reflected; `getPublicBaseUrl()` is used instead. Tests in `src/__tests__/public-url-allowlist.test.ts` enforce this contract.
- **Where baked in**: `src/lib/public-url.ts:getRequestBaseUrlSafe`, `src/lib/public-url.ts:isHostAllowlisted`; used in `src/app/api/auth/account-holder/signup/route.ts` for the verify-email link.
- **What breaks if violated**: loosening the allowlist (e.g. accepting `*.vercel.app` without team-slug scoping) opens a host-header injection vector — an attacker with a different `tutoring-notes-*` Vercel project could redirect a parent's verify-email link to an attacker-controlled domain, stealing the handoff token.
- **Migration check**: if the Vercel team slug changes (account rename), update `ALLOWLISTED_HOST_PATTERNS` and the tests in `src/__tests__/public-url-allowlist.test.ts`. If the production domain changes from `usemynk.com`, add the new domain and retain the old during the transition window.

---

## 6. Build + deploy

### 6.1 `npm run test:regression` runs before build

- **Assumption**: `vercel.json:buildCommand` is `npm run test:regression && npm run build`. Regression tests gate every Vercel build.
- **Where baked in**: `vercel.json:2`, `package.json:18`.
- **What breaks if violated**: regressions slip into Production deploys.
- **Migration check**: replicate the test-gate on any new build platform.

### 6.2 `prisma generate` runs postinstall + prebuild

- **Assumption**: Prisma Client is regenerated on `npm install` AND on build. Platform must support `postinstall` hooks.
- **Where baked in**: `package.json:8` (`postinstall`), `:7` (`build` chain).

### 6.3 `scripts/copy-pdfjs-worker.mjs` runs postinstall

- **Assumption**: pdf.js worker (~1 MB) is copied from `node_modules/pdfjs-dist/build/pdf.worker.min.mjs` to `public/pdfjs/` at install time. `public/pdfjs/` is gitignored.
- **Where baked in**: `package.json:8` (`postinstall`), `scripts/copy-pdfjs-worker.mjs`.
- **What breaks if violated**: PDF-page picker (Phase 5 task 1) fails — workers can't load from `node_modules` directly via the Next.js public-asset pattern.

### 6.4 Vercel `ignoreCommand` for docs/rules-only commits

- **Assumption**: Commits whose diff contains **only** non-build-affecting paths skip the Vercel deploy: `docs/**`, `.cursor/**`, `*.md`, `*.mdc`. Mixed diffs (any `src/`, `package.json`, etc.) always build. Script fails safe to BUILD when `VERCEL_GIT_PREVIOUS_SHA` is missing, git fails, or the diff is empty.
- **Where baked in**: `vercel.json` (`ignoreCommand`), `scripts/vercel-ignore-build.cjs`, `src/__tests__/vercel-ignore-build.test.ts`.
- **What breaks if violated**: orchestrator/doc churn re-triggers full builds (wasteful); or, if polarity/safe-set regresses, real code changes could be skipped (dangerous — predicate is unit-tested).

### 6.5 Branch + smoke + direct merge (no PR ceremony)

- **Assumption**: Solo-pilot stage convention per AGENTS.md "Merging convention" section. Executors deliver smokeable branches; merge happens via `git merge --no-ff` directly to master after smoke pass.
- **What breaks if violated**: re-introducing PR ceremony adds overhead without review value at current team size. Revisit when team grows or adversarial CI lands.

---

## 7. Runtime dependencies

### 7.1 Node.js version (implicit)

- **Assumption**: Node.js 20+ (ES modules with `.mjs`, modern fetch API, Web Crypto). No explicit `engines` pin in `package.json`.
- **What breaks if violated**: `scripts/*.mjs` files require modern Node; `@vercel/blob` requires modern fetch; `@prisma/client` 6.x requires Node 18+.
- **Migration check**: add `"engines": { "node": ">=20.0.0" }` to `package.json` BEFORE migrating to any platform with older default Node.

### 7.2 ffmpeg (`ffmpeg-static`)

- **Assumption**: `ffmpeg-static` npm dep provides the binary; falls back to `FFMPEG_BIN` env var if set.
- **Where baked in**: `src/lib/transcribe-ffmpeg.ts:getFfmpegPath`.
- **What breaks if violated**: long-audio transcribe (>25 MB) silently degrades to a friendly error message ("This recording is too large to split automatically"). Long-form transcribe becomes unusable.
- **Migration check**: any platform that strips binary-dep node modules (some serverless runtimes do) needs ffmpeg shipped separately. AWS Lambda layers are the typical fix.

### 7.3 pdfjs-dist (PDF page picker)

- **Assumption**: `pdfjs-dist` 5.6.x; worker version must match main library version (worker is copied at install via `copy-pdfjs-worker.mjs`).
- **What breaks if violated**: version drift = silent PDF parse failures. The copy-script approach is specifically to avoid drift.

### 7.4 ffmpeg-static binary OS compatibility

- **Assumption**: Vercel builds on Linux; `ffmpeg-static` ships the right binary for Linux x64. Local dev on Windows uses the Windows binary (same npm package, OS-conditional download).
- **What breaks if violated**: ARM-only runtimes (Graviton, Apple Silicon serverless) may have ffmpeg-static support issues; verify on first deploy to such a platform.

### 7.5 Excalidraw API surface

- **Assumption**: Excalidraw `^0.18.1`. `excalidrawAPI.getAppState()` returns `{ scrollX, scrollY, zoom: { value }, ... }`. `updateScene({ appState: {...} })` accepts partial appState.
- **Whiteboard UI customization (2026-06-07)**: Excalidraw's main toolbar, left properties palette, and mobile palette popup are **NOT customizable via the public API in 0.18.1** — `UIOptions` only hides canvas menu actions and the image tool (`tools: { image: false }`). Deep whiteboard-UX customization (toolbar reorder, shape dropdowns, compact properties panel, mobile palette click-away dismiss) requires hiding native UI + a **custom chrome layer** driving `excalidrawAPI` (`setActiveTool`, `updateScene({ appState })`, etc.). Load-bearing for the whiteboard-UX roadmap.
- **Where baked in**: per-page view state code, scene-paint engine, replay viewport tier-c-lite (all shipped 2026-05-17 in merge `2cccc04`).
- **What breaks if violated**: any Excalidraw version bump that changes `appState` shape breaks page-switch viewport restoration + replay viewport tracking. Pin major version; test on bump.

### 7.6 socket.io-client (sync transport)

- **Assumption**: `socket.io-client` 4.8.x for the WebSocket relay. Protocol-compatible with the `whiteboard-sync` server's pinned upstream excalidraw-room SHA.
- **What breaks if violated**: major version bumps risk protocol drift. The 90-day pin-verification cadence (Phase 2 task 9) catches this.

---

## 8. Browser support

### 8.0 Pilot device matrix (recalibrated 2026-06-18)

- **Tutor (Sarah, pilot):** primary device assumed **Windows desktop** running **Chromium/Blink** (same engine as Andrew's dev env). **Zero tutor-side WebKit risk** for the pilot norm (desktop tutor + mobile student).
- **Student (test-student / Andrew's wife):** **mobile-web generally** — currently validated on **Android / Chrome-Blink** via wb-unify hardware smoke. **iOS Safari / WebKit student coverage = ZERO** — a real gap; see [`BACKLOG.md`](BACKLOG.md) **WB-STUDENT-MOBILE-VALIDATION**.
- **Implication:** iOS-specific quirks below (§8.1+) still matter for **student-side** mobile-web and for any future tutor-on-iOS scenario, but are **not** the primary pilot tutor risk vector.

### 8.1 iOS Safari / mobile-web MediaRecorder quirks

- **Assumption**: iOS Safari requires `audio/mp4` mimeType (not `audio/webm`). `MediaRecorder.isTypeSupported` is checked at recording-start.
- **Where baked in**: `src/lib/recording/...` (mime selection logic).
- **What breaks if violated**: recording fails silently on iPhone. Phase 2 task 2 (iOS Safari matrix) covers exhaustive testing.
- **Draft durability (`timeslice`, W1 Surface 1, 2026-05-30)**: The whiteboard workspace enables `MediaRecorder.start(30000)` plus a 30s `setInterval` draft checkpoint to IndexedDB (`tutoring-notes-recording-draft`). iOS Safari may **not** emit intermediate `ondataavailable` events on the timeslice interval before `stop()` — the hook logs a warning and still checkpoints on `stop()` / `pagehide` (stop-only path). Mid-recording crash recovery on iOS without timeslice events is **coarser** (only data flushed at last interval or tab hide). **Gate:** Andrew validates on a real iPhone that `timeslice: 30000` fires at least once before `stop()`; if not, accept stop-only + interval checkpoints and document the smoke finding here.

### 8.2 Excalidraw mount lifecycle (canvas wipe race)

- **Assumption**: There's an Excalidraw-internal post-mount effect that resets scene + scroll + zoom within one rAF after `updateScene`. Live-recording mode masks this via the audio play loop's re-push; replay-without-audio + preview-before-Start surfaces it as blank-until-scrub.
- **Where baked in**: `src/components/whiteboard/WhiteboardReplay.tsx:148`, `WorkspacePreviousSessionPreview.tsx` (deferred).
- **Roadmap**: Phase 3 task 1 (scrub-without-audio + canvas wipe race fix).

### 8.3 Browser autoplay policies (AVTile "Tap to hear")

- **Assumption**: Modern browsers block autoplay of audio without user gesture. Phase 4d Commit 10 added "Tap to hear" overlay for autoplay-blocked remote audio. Asymmetric on mobile-web (per 2026-05-15 smoke); **student-side** iOS untested, Android covered in wb-unify pass.
- **Where baked in**: `src/components/av/AVTile.tsx`.

### 8.4 sessionStorage limits

- **Assumption**: ~5 MB per origin. Per-page view state drafts + recording outbox fit comfortably; PDF-page draft state is the upper bound risk.
- **What breaks if violated**: tab-reload draft restoration fails silently. Add quota-exceeded error handling if it ever fires.

### 8.5 IndexedDB for upload outbox + checkpoints

- **Assumption**: IndexedDB available with reasonable storage budget. iOS Safari ITP (Intelligent Tracking Prevention) may evict storage after 7 days of inactivity for non-installed PWAs.
- **Where baked in**: `src/lib/recording/upload-outbox.ts`, `src/lib/recording/recording-draft-store.ts` (`tutoring-notes-recording-draft`), whiteboard checkpoint paths (`tutoring-notes-checkpoints`).
- **What breaks if violated**: cross-day recording session resumption fails on iOS Safari. Acceptable today (sessions are intra-day); flag if persistence across days becomes a feature. The **recording draft** store is subject to the same 7-day ITP eviction risk as the outbox; intra-day sessions are safe.

---

## 9. OS / development environment

### 9.1 Windows-first dev environment (Andrew)

- **Assumption**: Andrew develops on Windows; PowerShell is the default shell. Scripts must work cross-platform but Windows is the primary local env.
- **Where surfaced**:
  - `scripts/branch-sweep.mjs` — early Windows-specific `spawnSync` cwd bug (`6e77ba7` fix).
  - `.gitignore` includes `.git-commit-msg.tmp` for PowerShell multi-line commit message handling.
  - PowerShell can't chain commands with `&&` (use `;` or `if ($?)`).
- **Migration check**: Linux/Mac contributors must verify scripts on their platform; CI runs on Linux so prod-build path is Linux-tested by default.

### 9.2 Git available locally + in build env

- **Assumption**: `git` binary available in dev + Vercel build env. Required by `vercel.json:ignoreCommand` (`git diff`) and by housekeeping scripts (`git fetch --prune`, `git merge-base`).

### 9.3 DNS resolution flakiness

- **Assumption**: Transient `Could not resolve host: github.com` failures happen during `git fetch` / `git push`. Pattern: retry once before failing.
- **Where baked in**: AGENTS.md `git-push-retry` rule; should be ported to `scripts/branch-sweep.mjs` (open follow-up).
- **Migration check**: any CI / dev environment with restrictive networking needs the retry pattern; firewalled environments may need a git proxy.

### 9.4 Docker required for whiteboard regression net (wb-regression harness)

- **Assumption**: `npm run test:wb-sync` and `npm run relay:build` require Docker Desktop (or equivalent daemon) on the dev machine. The local relay container (`wb-relay-local`) wraps the same `excalidraw-room` sha used in production (`03ff435860b508d7cd9e005cfc90f7977ae2a593`).
- **Where baked in**: `package.json` `relay:build` script; `playwright.config.ts` wb-regression `webServer` entry; `docs/LOCAL-DEV.md` setup steps.
- **What breaks if violated**: `npm run relay:build` fails; Playwright's relay `webServer` fails to start; wb-regression tests fail immediately. Fallback to production relay (`wss://wb.mortensenapps.com`) reintroduces prod dependency for local tests — explicitly avoided by the regression net.
- **Migration check**: GitHub Actions Phase 2 gate should use `docker/setup-buildx-action` + build `../whiteboard-sync/Dockerfile`. Image already exists in sibling `whiteboard-sync/` repo.

### 9.5 Local relay CORS allowlist for test runs

- **Assumption**: `wb-relay-local` runs with `CORS_ORIGIN=http://localhost:3100`, matching Playwright `baseURL`.
- **Where baked in**: `playwright.config.ts` relay `webServer` docker command (`-e CORS_ORIGIN=http://localhost:3100`).
- **What breaks if violated**: Socket.IO connections from `http://localhost:3100` are rejected; both peers fail to connect; all wb-regression tests time out on `"student connected"`.
- **Migration check**: If dev server port changes from 3100, update relay `CORS_ORIGIN` in `playwright.config.ts` and document in `docs/LOCAL-DEV.md`.

---

## 10. Operational + secrets

### 10.1 `.env` is gitignored; secrets never in source control

- **Assumption**: `.env`, `.env.local`, `.env.*.local` are gitignored per `.gitignore:3-5`.
- **What breaks if violated**: API keys, DB credentials, OAuth secrets leak via git history. Catastrophic.
- **Migration check**: GitHub secret-scanning + pre-commit hook recommended. Andrew's current `.env` files contain real secrets — DO NOT commit, screenshot, or paste into chat.

### 10.2 Cost-events accumulating since 2026-05-17

- **Assumption**: `CostEvent` table receives a row per Whisper / GPT call. Pricing table baked into `src/lib/observability/cost-events.ts:estimateCostUsd`.
- **Where baked in**: `prisma/schema.prisma:CostEvent`, `src/lib/observability/cost-events.ts`.
- **What breaks if violated**:
  - Pricing-table drift: when OpenAI changes prices, cost estimates drift. Acceptance criterion per master plan: reconcile within 5% of OpenAI's monthly invoice.
  - Migration to a different AI provider: requires new `CostEvent.model` enum entries + new estimate logic.

### 10.2a First-party ProductEvent funnel (tutor signup → session)

- **Assumption**: `ProductEvent` rows in Neon record the tutor funnel (`TUTOR_SIGNUP`, `TUTOR_LOGIN`, `TUTOR_APPROVED`, `TUTOR_WAITLIST_BLOCKED`, `SESSION_CREATED`, `SESSION_STARTED`, `SESSION_ENDED`) via `src/lib/observability/product-events.ts`. First-party only — no PostHog, no client beacons, no third-party analytics egress.
- **Where baked in**: `prisma/schema.prisma:ProductEvent`, call sites in signup/auth/tutor-approval/whiteboard actions.
- **What breaks if violated**: funnel analytics queries drift or silently miss steps; privacy posture breaks if PII (email, IP, UA) is written to metadata or logs.

### 10.3 Per-session ID logging mandatory

- **Assumption**: Every state transition logs a 3-letter prefix + session-scoped ID per AGENTS.md. Registry: `rid` (audio), `wbsid` (whiteboard), `obx` (outbox), `snp` (snapshot), `pvw` (preview), `pvs` (per-page view state), `avx` (live A/V), `cev` (cost event), `blb` (blob cleanup CLI), `brs` (branch sweep CLI).
- **What breaks if violated**: prod debugging becomes impossible. Sarah-reported bug ("my session lost audio") can't be traced without per-session IDs.
- **Migration check**: this is a code-discipline assumption; preserve across phases. Each new feature with a state machine MUST register a prefix. WS-B adds `wbp` (live whiteboard event-batch persist).

### 10.3a WS-B live whiteboard batch persist (~1s cadence)

- **Assumption**: During ACTIVE sessions, the tutor client POSTs incremental event slices to `POST /api/whiteboard/[sessionId]/checkpoint` about once per second (plus on `visibilitychange` → hidden and before End). Each batch includes `boardDocumentJson` (~2–5 KB) plus a bounded event slice. Batches upsert into `WhiteboardEventBatch` — no per-second Vercel Blob writes (SF-3).
- **Body-size / rate**: Typical batch fits comfortably under the 4.5 MB Vercel serverless body cap; sustained ~1 write/s per active session is acceptable at pilot scale on Neon + Vercel Pro.
- **Where baked in**: `src/hooks/useWhiteboardRecorder.ts` (`runServerPersist`), `src/app/api/whiteboard/[sessionId]/checkpoint/route.ts`.
- **What breaks if violated**: tab-kill loses strokes server-side; End-and-review finalize has nothing to assemble (WS-C). Tutor sees `checkpointStatus` warning after ≥3 consecutive persist failures.

### 10.4 TOTP_ENCRYPTION_KEY — AES-256-GCM key for 2FA secrets (Identity Phase 1)

- **Assumption**: `TOTP_ENCRYPTION_KEY` env var must be present and decode to exactly 32 bytes (base64url) on any deployment that has real (non-test) admins. Missing or wrong key causes 2FA enrollment and verification to fail.
- **Where baked in**:
  - `src/lib/crypto/totp-secret.ts` — `loadKey()` reads and validates at call time.
  - `src/lib/env.ts` — optional at boot (to not break local dev without 2FA), but the crypto module throws if absent when actually called.
  - `AdminUser2FA.totpSecretEnc` column — ciphertext is unreadable without the key.
- **Key-rotation story**:
  - V1 ships **single-key**: one `TOTP_ENCRYPTION_KEY` encrypts all TOTP secrets.
  - There is **NO dual-key decrypt path** in V1. Rotating the key means:
    1. All `AdminUser2FA` rows become unreadable with the old key.
    2. Every enrolled tutor must re-enroll after the key is rotated.
  - **Future hardening**: dual-key decrypt (new key for new enrollments, old key for existing rows) is documented here as the path forward but intentionally deferred to Phase 2.
  - **Rotation procedure (V1)**:
    1. Export `AdminUser2FA` rows for backup.
    2. `DELETE FROM "AdminUser2FA";` (all re-enroll on next login).
    3. Set new `TOTP_ENCRYPTION_KEY` on all envs.
    4. Redeploy.
- **What breaks if violated**:
  - Missing key: 2FA setup/verify server actions return error; enrolled users cannot access `/admin`.
  - Wrong key: decryption fails with auth-tag mismatch (GCM integrity check) — same user-facing error.
  - Leaked key: attacker with DB access can decrypt TOTP secrets and clone authenticators.
- **Migration check**: MUST add `TOTP_ENCRYPTION_KEY` to all envs (Vercel env vars for prod/preview; local `.env`). Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.

---

### 10.5 AH_SESSION_HMAC_SECRET — AccountHolder session token signing (Identity Phase 2a)

- **Assumption**: `AH_SESSION_HMAC_SECRET` env var must be present (32+ bytes, base64) on any deployment where AccountHolder auth is active. Missing key causes `getAccountHolderSession()` and `createAccountHolderSession()` to fail-closed (return null / throw) without crashing the build.
- **Where baked in**:
  - `src/lib/account-holder-session.ts` — read at call time via `process.env.AH_SESSION_HMAC_SECRET`.
  - `src/lib/crypto/session-tokens.ts` — `hmacToken()` throws if secret is empty.
- **Security tier**: same as `NEXTAUTH_SECRET` — treat as a session signing key. An attacker who obtains this secret can forge valid AccountHolder session cookies.
- **Rotation**: rotating this key invalidates ALL active AccountHolder sessions (all existing tokenHash values become unverifiable). Coordinate with a maintenance window if rotating in production. No dual-key support in V1.
- **Build safety**: key is optional in `env.ts` Zod schema — `next build` succeeds without it. Auth fails at request time only.
- **Migration check**: MUST add `AH_SESSION_HMAC_SECRET` to all envs before P2b goes live. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.

### 10.6 LEARNER_SESSION_HMAC_SECRET — Learner device session token signing (Identity Phase 2a)

- **Assumption**: `LEARNER_SESSION_HMAC_SECRET` env var must be present (32+ bytes, base64) on any deployment where learner PIN login is active. Fail-closed at request time; does not crash build.
- **Where baked in**:
  - `src/lib/learner-session.ts` — read at call time.
  - `src/lib/crypto/session-tokens.ts` — same `hmacToken()` path.
- **Security tier**: same tier as `AH_SESSION_HMAC_SECRET`. An attacker with this key can forge learner session cookies.
- **Rotation**: invalidates ALL active learner device sessions. Children must re-login with their PIN on all devices. Inform parents before rotating.
- **Build safety**: optional in `env.ts`; build succeeds without it.
- **Migration check**: MUST add `LEARNER_SESSION_HMAC_SECRET` to all envs before P2b goes live.

### 10.7a ADMIN_TFA_DEVICE_HMAC_SECRET — Admin trusted-device token signing (2FA remember-device, 2026-06-13)

- **Assumption**: `ADMIN_TFA_DEVICE_HMAC_SECRET` env var must be present (32+ bytes, base64) on any deployment where the admin/tutor "Remember this device" 2FA skip feature is active. Missing key causes `mintAdminTrustedDevice()` to throw and `validateAdminTrustedDevice()` to return null → user is always prompted for TOTP (fail-closed, not an error page).
- **Where baked in**:
  - `src/lib/admin-trusted-device.ts` — `getHmacSecret()` reads `process.env.ADMIN_TFA_DEVICE_HMAC_SECRET` at call time.
  - `src/lib/crypto/session-tokens.ts` — `hmacToken()` throws if secret is empty.
- **Security tier**: high — an attacker who obtains this secret can forge trusted-device cookies and bypass the TOTP login gate (but NOT sensitive-op step-up, which always requires a live code in the request). Treat with same care as `NEXTAUTH_SECRET`.
- **Rotation**: rotating this key **instantly invalidates ALL existing trusted-device rows** — stored `tokenHash` values were computed with the old secret, so no cookie will match after rotation. All users are silently demoted to TOTP-required on their next login (no error surfaced). Plan a maintenance window or notify users if rotating. No dual-key support in V1.
- **Build safety**: optional in `env.ts` Zod schema — `next build` succeeds without it. Remember-device feature fails-closed at request time only.
- **Migration check**: MUST add `ADMIN_TFA_DEVICE_HMAC_SECRET` to Vercel env vars before remember-device ships. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.

### 10.7 AH_TOTP_ENCRYPTION_KEY — AccountHolder TOTP secret encryption (Phase 6, reserved)

- **Assumption**: Reserved now (Identity Phase 2a) so Phase 6 executor does not pick a conflicting name. Must decode to exactly 32 bytes (base64url) when Phase 6 AccountHolder 2FA enrollment is activated.
- **Where baked in**:
  - `src/lib/env.ts` — validated (same 32-byte base64url check as `TOTP_ENCRYPTION_KEY`).
  - Phase 6 will add `src/lib/crypto/ah-totp-secret.ts` reading this key.
- **Isolation from TOTP_ENCRYPTION_KEY (AH-3 LOCKED)**: rotating tutor TOTP key (`TOTP_ENCRYPTION_KEY`) must NOT affect parent 2FA. Separate key achieves this.
- **Build safety**: optional in `env.ts`; build and P2a auth succeed without it.
- **Migration check**: NOT required until Phase 6. Set before Phase 6 AccountHolder 2FA enrollment ships.

### 10.8 WB_E2E_HARNESS — Playwright wb-regression harness 2FA bypass

- **Assumption**: Post-Identity-Phase-1, the wb-regression Playwright harness logs in as `playwright@test.local` using a credentials-based flow. Because this account is not an `isTestAccount` DB row, it must receive a `twoFactorVerified=true` JWT at mint time to bypass the 2FA middleware gate. This bypass is guarded by a **server-only** env var `WB_E2E_HARNESS=1` (not `NEXT_PUBLIC_`-prefixed), which prevents the flag from being inlined into the client bundle.
- **Where baked in**:
  - `src/lib/playwright-harness.ts` — `isPlaywrightHarnessActive()` checks `WB_E2E_HARNESS === "1" && !VERCEL`.
  - `src/auth-options.ts` — JWT callback calls `isPlaywrightHarnessActive()` to decide `twoFactorVerified`.
  - `playwright.config.ts` webServer `cmd` — sets `WB_E2E_HARNESS=1` so the local harness server carries the flag.
- **Client-side bridge** (separate concern): `NEXT_PUBLIC_WB_E2E_SCENE_HOOK=1` is still set by the webServer and used by the client-side wb-e2e bridge mount. It carries NO auth privilege; moving it to a server-only var is unnecessary.
- **MUST NEVER be set in Vercel**: `WB_E2E_HARNESS` must not appear in any Vercel project env var (neither Production nor Preview). Vercel always injects `VERCEL=1` which is the defense-in-depth guard — even if the flag were accidentally set in Vercel, `!process.env.VERCEL` blocks the bypass. But the primary control is: **never instruct anyone to set `WB_E2E_HARNESS` in Vercel**.
- **`playwright@test.local` prod-safety**: this account is created only by `tests/visual/helpers.ts` → `seedTestAdmin()`, which calls `assertLocalDatabaseUrlForHarness()` and aborts unless `DATABASE_URL` points to a local Docker Postgres. The webServer forces a local DB URL; Neon (prod/preview) is never the target. There is no API endpoint or admin UI path that creates `playwright@test.local` in a production DB.
- **Migration check**: any new test runner or CI environment that needs the wb-regression suite must set `WB_E2E_HARNESS=1` in its local webServer env. This flag must never be set in platform env vars (Vercel, AWS, etc.).

### 10.9 NOTES_AUTH_WALL — notes share-page authentication gate

- **Assumption**: `NOTES_AUTH_WALL` is a **server-only** env var (no `NEXT_PUBLIC_` prefix) that controls whether `/s/[token]` notes pages require authentication.
- **Where baked in**:
  - `src/lib/share-access-scope.ts` — `isNotesAuthWallEnabled()` reads `process.env.NOTES_AUTH_WALL`.
  - `src/middleware.ts` — reads `process.env.NOTES_AUTH_WALL` for edge-layer cookie-presence check.
- **Default: false / unset** — grace window; anonymous `/s/*` access preserved exactly as today for family onboarding.
- **Wall activation** (`true`): flip in Vercel env after all of Sarah's families complete the claim flow. Do NOT flip before the family onboarding grace window completes.
- **Value semantics**: `"true"` or `"1"` → wall on; anything else (including unset) → wall off. The flag is read at request time, not at build time — toggling in Vercel triggers no redeploy.
- **MUST NOT** be set in production until onboarding is complete. Premature activation locks out any parent without an AccountHolder account.
- **Migration check**: when flipping to `true` in Vercel, confirm in `sal=` logs that no `action=access_denied_redirect` floods appear for active-session parents (would indicate accounts not yet created).

### 10.10 Dev-tools fixture dashboard — VERCEL_ENV gate

- **Assumption**: The `/admin/dev-tools` page and its server actions are enabled only when `VERCEL_ENV !== 'production'`. The gate is checked in two places for defense-in-depth:
  1. `isDevToolsEnabled()` in `src/lib/dev-fixtures.ts` — called at the top of every fixture function (throws in prod).
  2. `page.tsx` calls `notFound()` when `!isDevToolsEnabled()` — UI surface never renders.
- **Vercel env semantics**: Vercel sets `VERCEL_ENV=production` for Production deployments and `VERCEL_ENV=preview` for Preview deployments. Local dev has `VERCEL_ENV` undefined, which also passes the gate. This means the dashboard is reachable locally and on Preview (Andrew smokes on preview) but INERT in production.
- **Auth gate** (orthogonal): operator-authenticated (`assertIsAdmin()`) required regardless of environment. Account holders and students cannot reach this surface even in preview.
- **Hard deletion guard**: the delete path includes `isTestFixture: true` in every `WHERE` clause. This guard lives in the business logic (`dev-fixtures.ts`), not just the UI — physically incapable of deleting a real user.
- **Migration check**: confirm `VERCEL_ENV` is NOT overridden in any production Vercel env var. The dashboard must remain inert there.

### 10.11 Deploy build identity — `VERCEL_GIT_COMMIT_SHA`, client bake, `/api/version`

- **Assumption**: Vercel injects `VERCEL_GIT_COMMIT_SHA` (full git commit) on **all** deployments (Production, Preview, and branch previews). Local `next dev` / `next build` without Vercel has it **unset** — code falls back to the literal `"development"`.
- **Where baked in**:
  - `src/lib/build-identity.ts` — `getBuildIdentity()` reads `VERCEL_GIT_COMMIT_SHA`, `VERCEL_GIT_COMMIT_REF`, `VERCEL_ENV`; single source for server deploy metadata.
  - `next.config.ts` — `env.NEXT_PUBLIC_BUILD_SHA` bakes `VERCEL_GIT_COMMIT_SHA ?? "development"` at **build time** into the client bundle (no new secret env var; same Vercel-injected SHA).
  - `src/app/api/version/route.ts` — public `GET` returns `{ sha, shortSha }` with `export const dynamic = "force-dynamic"` and `Cache-Control: no-store, max-age=0` (future client poll compares baked vs live).
  - `src/app/layout.tsx` + `src/components/SiteFooter.tsx` — prod footer shows `shortSha` in all envs.
  - `src/lib/preview-branch-badge.ts` — thin wrapper over `getBuildIdentity()`; preview pill unchanged (still `VERCEL_ENV === 'preview'` only).
  - `src/lib/deploy/chunk-load-error.ts` + `src/components/DeployClientGuards.tsx` — global `ChunkLoadError` one-shot reload (respects capture defer via `capture-defer-registry.ts`).
  - `src/lib/deploy/capture-defer-registry.ts` — ref-counted module-level defer registry; whiteboard workspace + standalone note recording call `setCaptureDeferActive` while live capture/end-session is in flight; poller and chunk recovery read `isCaptureDeferred()` and latch reload until all sources clear. Observability: `[dfr] source=<id> active=<bool> deferred=<bool>`.
  - `src/hooks/useDeployFreshness.ts` — event-driven client poll of `/api/version` on `document.visibilitychange` (tab visible) and `usePathname()` change only (no background interval); compares remote `sha` to baked `NEXT_PUBLIC_BUILD_SHA`; mismatch + safe → `location.reload()`; mismatch + deferred → single `sonner` toast + reload on defer clear. Local dev guard: skips when baked SHA is `"development"` or falsy.
- **Capability provided (Vercel)**: automatic per-deploy git SHA in the build environment without operator configuration.
- **Generic / AWS equivalent**: CI injects `GIT_COMMIT` / `SOURCE_VERSION` at build time; expose the same via a no-store `/api/version` and bake into client at compile time.
- **What breaks if violated**: client deploy-freshness poll (deliverable 2) and footer SHA show `"development"` or stale baked values; `/api/version` misreports the running deploy; chunk-recovery still works but users stay on skewed bundles longer without the poll.
- **Migration check**: confirm the new platform exposes an immutable deploy commit SHA at build **and** runtime for the version endpoint; re-bake client env at compile; keep `/api/version` public and no-store.

---

## 11. Planned platform dependencies — recording re-architecture (**DESIGN-STAGE / NOT-YET-BUILT**)

> **Status:** Ratify-ready design only — **no production code, no Vercel resource provisioning yet.** Canonical design: [`docs/handoff/recording-rearchitecture-design-2026-06-05.md`](handoff/recording-rearchitecture-design-2026-06-05.md). Full capability-contract table in that doc § "Vercel-specific dependencies & migration map". **Promote each entry to §1–§3 production assumptions in the Phase 1 build commit** when the dependency is actually wired.
>
> **Superseded for transcription transport (2026-06-07):** Vercel Cron backstop sweep is **built** for D2 — see §1.6. End-session sweep remains event-driven (slice 3). Vercel Queues (§11.1) is **not provisioned**; Andrew ratified DB-as-queue + cron/sweep over Queues beta.

### 11.1 Vercel Queues — topic `chunk-transcribe`

- **Capability provided**: At-least-once durable message delivery; push mode invokes a serverless consumer per message with automatic retry on failure.
- **Why we depend on it**: Phase 1 transcription pipeline (D2) — chunk blob uploaded → async transcribe → `TranscriptChunk` row; decouples upload from Whisper and removes monolithic post-click transcribe.
- **Generic / AWS equivalent**: **Amazon SQS** (standard queue) + **Lambda** event source mapping; DLQ for poison messages.
- **Migration notes**: Consumer idempotent on `(sessionId, chunkBlobUrl)`. No cross-message ordering guarantee. Verify at build time: max payload size, consumer timeout, retry/DLQ on current Vercel plan.

### 11.2 Vercel Queues — topic `notes-reduce`

- **Capability provided**: Same as §11.1 — async trigger with retry for session-end notes work.
- **Why we depend on it**: Phase 1 notes pipeline (D7) — auto-fire on session end; completion gate waits for all chunk transcriptions (or 5min partial timeout) before reduce.
- **Generic / AWS equivalent**: **SQS + Lambda** (separate queue from §11.1).
- **Migration notes**: Idempotent on `sessionId`; must abort if `WhiteboardSession.endedAt` unset. Verify at build time: delayed/requeue semantics for "wait for chunks" polling pattern.

### 11.3 Vercel Workflows — consolidation orchestration

- **Capability provided**: Durable multi-step orchestration (`"use workflow"` / `"use step"`); each step is its own invocation with automatic retry — no single 300s ceiling across the full concat pipeline.
- **Why we depend on it**: Phase 1 consolidation (D6) — fetch segments → download blobs → ffmpeg-concat → upload canonical → verify → DB flip.
- **Generic / AWS equivalent**: **AWS Step Functions** orchestrating Lambda steps; **fallback** (if Workflows unavailable): SQS + Lambda + manual `consolidationStatus` state machine (same semantics, more code).
- **Migration notes**: Verify at build time — Vercel Workflows plan availability, per-step timeout. Optional Vercel Sandbox for ffmpeg if a step exceeds function limits → AWS equivalent **ECS Fargate** or Lambda + ffmpeg layer with higher timeout/memory.

### 11.4 Vercel serverless split — removing the 300s cliff (design intent)

- **Capability provided**: Many short Node.js function invocations instead of one invocation owning full-session Whisper + GPT + concat.
- **Why we depend on it**: Replaces today's production cliff (`transcribeAndGenerateAction` in one call — see §1.1).
- **Generic / AWS equivalent**: Multiple Lambda functions with per-function timeouts; no change to the *capability* — only the orchestration primitive (Queues/Workflows vs SQS/Step Functions) differs.
- **Migration notes**: Re-test with 60-min audio fixture on Preview after any platform move. Edge runtime remains incompatible with ffmpeg (§1.2).

### 11.5 Cross-reference — Vercel Blob multipart

- See §3.5 (canonical audio multipart upload — design-stage).

## Migration checklist — copy + check yes/no before deploying to a new platform

> When considering AWS, Cloudflare, self-hosted, or any other platform migration, walk this list. Every "no" or "unsure" is a regression risk.

### Compute

- [ ] New platform supports **≥300s** wall-clock per server-action / per-function invocation. (§1.1)
- [ ] **Node.js runtime** (not Edge-only) for all blob/audio/ffmpeg routes. (§1.2)
- [ ] Capability-contract entries reviewed for every Vercel-specific dependency (§1.7). (§1.6 + §11 if recording re-arch shipped)
- [ ] Build hook supports `ignoreCommand`-equivalent for docs-only commit skipping. (§1.4)
- [ ] `after()` deferred work replaced with queue-based async (SQS + Lambda) or equivalent. (§1.8)
- [ ] Build runs `prisma migrate deploy` with strict per-env `DATABASE_URL` scoping. (§1.5)
- [ ] Build command can chain `npm run test:regression && npm run build` (or equivalent). (§6.1)
- [ ] `postinstall` hooks supported (Prisma generate + pdfjs worker copy). (§6.2, §6.3)

### Database

- [ ] Per-environment (prod / dev) DB branch or instance separation. (§2.1)
- [ ] Pooled + direct connection split supported (PgBouncer or RDS Proxy equivalent). (§2.2)
- [ ] Idle connection timeout validated; `withConnectionRetry` pattern in place for long-running scripts. (§2.3)
- [ ] Additive-migrations policy preserved. (§2.4)

### Object storage

- [ ] Per-env buckets OR dual-reference-check pattern preserved. (§3.1)
- [ ] Tokenized + revocable share URLs supported (no public student content). (§3.2)
- [ ] Direct client → storage upload supported (signed PUT URL pattern). (§3.4)
- [ ] If recording re-arch Phase 1 shipped: multipart upload for canonical audio (§3.5) → S3 multipart equivalent.

### Async messaging + durable workflows (if recording re-arch Phase 1 shipped)

- [ ] Transcription trigger: SQS (or equivalent) + Lambda with at-least-once semantics and idempotent consumer. (§11.1)
- [ ] Notes-reduce trigger: separate queue + Lambda; completion-gate / partial-timeout behavior preserved. (§11.2)
- [ ] Consolidation: Step Functions or queue + state machine; per-step timeout ≥ longest ffmpeg step. (§11.3)

### External APIs

- [ ] OpenAI API key valid for new deployment; rate-limit tier validated. (§4.1, §4.2)
- [ ] Cost-events pricing table audited for current OpenAI prices (or new provider). (§10.2)
- [ ] Google OAuth callback URL updated in Google Cloud Console. (§4.3, §5.5)

### Networking + security

- [ ] CSP `connect-src` includes new sync server origin if changing. (§5.1, §5.3)
- [ ] Permissions-Policy applied **site-wide** (not per-route). (§5.4)
- [ ] WebRTC ICE config valid; TURN provisioned if NAT failures expected. (§5.2)
- [ ] Ownership-assertion helpers preserved on all student-data server actions. (§5.6)
- [ ] Rate-limit middleware re-architected as Redis-backed if multi-instance deployment. (§5.7)
- [ ] `NEXTAUTH_URL` matches new domain; session cookies scoped correctly. (§5.5)

### Runtime

- [ ] Node.js ≥20 (add explicit `engines` pin in `package.json` if migrating). (§7.1)
- [ ] ffmpeg-static binary works on new platform's OS + arch (or ffmpeg shipped separately via Layers / image). (§7.2, §7.4)
- [ ] Excalidraw + socket.io-client major versions unchanged unless re-tested. (§7.5, §7.6)

### Browser support

- [ ] iOS Safari recording matrix re-verified post-migration (mimetype handling unchanged). (§8.1)
- [ ] Autoplay-block UI ("Tap to hear") still triggers correctly. (§8.3)

### Operational

- [ ] `.env` discipline preserved; no secrets in source control. (§10.1)
- [ ] Per-session ID logging preserved across all new code paths. (§10.3)
- [ ] Cost-events instrumentation continues firing on new AI call sites. (§10.2)
- [ ] `TOTP_ENCRYPTION_KEY` set on all envs (32-byte base64url); key-rotation story documented to tutors. (§10.4)
- [ ] `AH_SESSION_HMAC_SECRET` set on all envs before P2b AccountHolder auth goes live (§10.5)
- [ ] `LEARNER_SESSION_HMAC_SECRET` set on all envs before P2b learner login goes live (§10.6)
- [ ] `ADMIN_TFA_DEVICE_HMAC_SECRET` set on Vercel before remember-device feature is used (§10.7a); rotation story documented above.
- [ ] `AH_TOTP_ENCRYPTION_KEY` reserved; required before Phase 6 AccountHolder 2FA ships (§10.7)
- [ ] `WB_E2E_HARNESS` is NOT set in any Vercel env var (prod or preview); it is local-harness-only (§10.8)
- [ ] Host allowlist in `ALLOWLISTED_HOST_PATTERNS` (`src/lib/public-url.ts`) updated for new Vercel team slug or production domain (§5.8)
- [ ] `VERCEL_ENV` is NOT overridden in any production Vercel env var (dev-tools fixture gate relies on Vercel's auto-injected `VERCEL_ENV=production` to stay inert — §10.9)

---

## Change log

- **2026-06-07** — Slice 3 smoke fixes: added §1.8 Next.js `after()` deferred post-response work (chunk-transcribe-enqueue + notes-enqueue migration from bare `void` to `after()`; workspace page maxDuration=300). Migration checklist updated.
- **2026-06-06** — Capability-contract rule (Andrew directive): header maintenance rule extended; added §1.6 documentation standard; §3.5 Blob multipart (design-stage); §11 recording re-architecture planned Vercel deps (Queues, Workflows, 300s-cliff split). Migration checklist updated.
- **2026-06-05** — Dev-tools fixture dashboard: added §10.9 VERCEL_ENV gate for `/admin/dev-tools`. Migration checklist updated.
- **2026-06-05** — Auth-boundary hardening: added §10.8 WB_E2E_HARNESS (harness 2FA bypass re-gated on server-only flag + !VERCEL; migrated off NEXT_PUBLIC_ client-bundle gate). Added §5.8 host allowlist for auth email links (RC-A fix: `getRequestBaseUrlSafe` with injection guard). Migration checklist updated.
- **2026-06-02** — Identity Phase 2a (session infra + claim flow): added §10.5 AH_SESSION_HMAC_SECRET, §10.6 LEARNER_SESSION_HMAC_SECRET, §10.7 AH_TOTP_ENCRYPTION_KEY. Migration checklist updated.
- **2026-05-31** — Identity Phase 1 (2FA): added §10.4 TOTP_ENCRYPTION_KEY assumption. Key-rotation story documented. Migration checklist updated.
- **2026-05-17** — initial inventory. Audited post-Vercel-Pro upgrade. Captures: Vercel Pro 300s ceiling now real (§1.1), housekeeping smoke lessons (§2.3, §3.1, §3.3, §9.1), cost-events shipped (§10.2), per-page view state shipped (§7.5).
