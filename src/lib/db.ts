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
 *
 * See docs/learning-prisma.md.
 */
export function isTransientDbConnectionError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("kind: closed") ||
    msg.includes("connection is closed") ||
    msg.includes("server has gone away") ||
    msg.includes("server closed the connection") ||
    msg.includes("connection terminated") ||
    msg.includes("connection reset") ||
    msg.includes("econnreset")
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
  const maxRetries = opts.maxRetries ?? 2;
  const baseDelayMs = opts.baseDelayMs ?? 100;

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
