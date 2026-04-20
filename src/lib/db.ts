import { PrismaClient } from "@prisma/client";

declare global {
  var __prisma: PrismaClient | undefined;
}

export const db =
  global.__prisma ??
  new PrismaClient({
    log: ["error"],
  });

if (process.env.NODE_ENV !== "production") global.__prisma = db;

/**
 * Detect transient PostgreSQL connection drops that can hit Prisma on
 * serverless (Vercel) even when DATABASE_URL points at the pooled
 * (PgBouncer/Neon-pooler) URL. The query itself is fine — re-issuing it
 * on a fresh connection succeeds.
 *
 * Symptoms in logs:
 *   prisma:error Error in PostgreSQL connection: Error { kind: Closed, cause: None }
 *   PrismaClientUnknownRequestError: ... Error { kind: Closed, ... }
 *   PrismaClientInitializationError: ... server has gone away
 *   PrismaClientInitializationError: P1001: Can't reach database server
 *     (Neon free-tier autosuspend cold start; first request after ~5min idle)
 *
 * See docs/learning-prisma.md.
 */
export function isTransientDbConnectionError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  // Match Prisma's P1001 by code as well as text — `PrismaClientInitializationError`
  // exposes `errorCode` on the instance. Use `unknown`-safe access.
  const code = (err as { code?: string; errorCode?: string }).code
    ?? (err as { code?: string; errorCode?: string }).errorCode;
  if (code === "P1001" || code === "P1002" || code === "P1017") return true;
  return (
    msg.includes("kind: closed") ||
    msg.includes("connection is closed") ||
    msg.includes("server has gone away") ||
    msg.includes("server closed the connection") ||
    msg.includes("connection terminated") ||
    msg.includes("connection reset") ||
    msg.includes("econnreset") ||
    // Neon cold-start / serverless PG wake-up.
    msg.includes("p1001") ||
    msg.includes("can't reach database server") ||
    msg.includes("cant reach database server") ||
    msg.includes("connection refused") ||
    msg.includes("econnrefused") ||
    msg.includes("etimedout") ||
    msg.includes("connection timed out")
  );
}

/**
 * Retry a Prisma operation up to `maxRetries` times when the underlying
 * connection drops mid-query. Use this for any DB call that is the first
 * query of a fresh serverless invocation, OR a write that the user can't
 * easily retry without losing in-progress work (e.g. the recording row
 * created right after a Vercel Blob upload).
 *
 * Non-transient errors (validation, FK violation, "table does not exist",
 * etc.) pass through immediately so callers can handle them normally.
 */
export async function withDbRetry<T>(
  fn: () => Promise<T>,
  opts: { maxRetries?: number; baseDelayMs?: number; label?: string } = {}
): Promise<T> {
  // Defaults tuned for Neon free-tier cold starts (~1s wake-up):
  // 3 retries with 300ms base = 300ms / 600ms / 1200ms backoff (~2.1s total wait
  // worst case before throwing). Still snappy when the DB is hot.
  const maxRetries = opts.maxRetries ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 300;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === maxRetries || !isTransientDbConnectionError(err)) throw err;
      const delay = baseDelayMs * Math.pow(2, attempt);
      const label = opts.label ? `[db:${opts.label}]` : "[db]";
      console.warn(
        `${label} transient connection error (attempt ${attempt + 1}/${maxRetries + 1}); retrying in ${delay}ms:`,
        err instanceof Error ? err.message : err
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
