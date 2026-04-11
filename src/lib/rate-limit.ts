/**
 * Sliding-window rate limiter — in-memory, no external dependencies.
 *
 * Acceptable for serverless (Vercel): each isolate gets its own window.
 * Cold starts reset the window, which is *more* generous, not less.
 * For a serious DDoS you'd add Vercel's edge rate-limiting or Cloudflare,
 * but this stops credential-stuffing and form-spam effectively.
 */

interface Window {
  count: number;
  resetAt: number;
}

const store = new Map<string, Window>();

const CLEANUP_INTERVAL_MS = 60_000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, win] of store) {
    if (win.resetAt <= now) store.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export function rateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): RateLimitResult {
  cleanup();
  const now = Date.now();
  let win = store.get(key);

  if (!win || win.resetAt <= now) {
    win = { count: 0, resetAt: now + windowMs };
    store.set(key, win);
  }

  win.count++;

  if (win.count > maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: win.resetAt - now,
    };
  }

  return {
    allowed: true,
    remaining: maxRequests - win.count,
    retryAfterMs: 0,
  };
}
