/**
 * Tunables for the Vercel Cron transcription backstop sweep.
 * Recording re-arch Phase 1 — durable DB-as-queue transport (slice 2c).
 *
 * Cadence lives in `vercel.json` (currently every 15 minutes — Andrew 2026-08-28:
 * slow until we have evidence the every-minute backstop is actually used).
 * Usefulness metrics to decide whether to tighten: BACKLOG TXC-SWEEP-METRICS.
 */

/** Max worker attempts before a chunk is left permanently failed. */
export const TRANSCRIBE_SWEEP_MAX_ATTEMPTS = 5;

/** Minimum age before a pending/failed row is eligible for cron pickup (avoids racing the immediate attempt). */
export const TRANSCRIBE_SWEEP_STALE_THRESHOLD_MS = 60_000;

/** Max chunks processed per cron invocation. */
export const TRANSCRIBE_SWEEP_BATCH_LIMIT = 20;

/** Wall-clock budget per sweep — stay well under Vercel Pro's 300s function ceiling. */
export const TRANSCRIBE_SWEEP_TIME_BUDGET_MS = 240_000;
