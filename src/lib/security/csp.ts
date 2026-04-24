/**
 * Content-Security-Policy builder for the Tutoring Notes app.
 *
 * Centralized so both `src/middleware.ts` (the runtime emitter) and the
 * regression tests (`src/__tests__/regressions/csp-headers.test.ts`)
 * compute the exact same string. Any directive change MUST update tests
 * — see file-level comment in csp-headers.test.ts for rationale.
 *
 * The whiteboard live-collab relay origin is sourced from
 * `WHITEBOARD_SYNC_URL` (validated in `src/lib/env.ts`) so dev /
 * preview / production each emit the right CSP without code edits.
 */

/**
 * Convert a configured `WHITEBOARD_SYNC_URL` (e.g. `wss://wb.mortensenapps.com`)
 * into the CSP `connect-src` origins the browser needs.
 *
 * Returns BOTH the websocket scheme AND the http(s) scheme of the same
 * host because socket.io performs an HTTP polling fallback in addition
 * to the WebSocket upgrade — the CSP must allow both or the polling
 * transport is silently blocked.
 *
 * Returns an empty array if the URL is missing or doesn't use a
 * websocket scheme (matches the env validator's accepted set).
 */
export function whiteboardSyncOrigins(rawUrl: string | undefined): string[] {
  if (!rawUrl || typeof rawUrl !== "string") return [];
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return [];
  }
  if (parsed.protocol !== "wss:" && parsed.protocol !== "ws:") return [];
  const wsScheme = parsed.protocol === "wss:" ? "wss" : "ws";
  const httpScheme = parsed.protocol === "wss:" ? "https" : "http";
  return [
    `${wsScheme}://${parsed.host}`,
    `${httpScheme}://${parsed.host}`,
  ];
}

export type CspOptions = {
  /** Value of process.env.WHITEBOARD_SYNC_URL (or equivalent). */
  whiteboardSyncUrl?: string;
};

/**
 * Build the full Content-Security-Policy header value.
 *
 * Directive notes (kept here, not at the call site, so reviewers see
 * intent + history when changing a single line):
 *
 *   - `script-src 'unsafe-inline' 'unsafe-eval'` — required by Next.js
 *     hydration + the Excalidraw runtime. Tightening this would break
 *     SSR hydration silently.
 *
 *   - `media-src blob: + Vercel Blob CDN` — the AI assist panel
 *     previews newly recorded audio via URL.createObjectURL (blob:),
 *     and saved recordings replay from the Vercel Blob CDN. Without
 *     either, Chrome blocks <audio> with "Media Load rejected by URL
 *     safety check".
 *
 *   - `connect-src https://vercel.com` — `@vercel/blob/client.upload()`
 *     PUTs audio bytes from the browser straight to vercel.com (B1
 *     refactor). Removing this silently hangs the upload.
 *
 *   - `connect-src wss://<relay> + https://<relay>` — derived from
 *     WHITEBOARD_SYNC_URL. socket.io tries websocket then falls back
 *     to https long-polling, so both schemes must be allowed.
 *
 *   - `frame-ancestors 'none'` — clickjacking protection. Don't relax.
 */
export function buildContentSecurityPolicy(opts: CspOptions = {}): string {
  const connectSrc = [
    "'self'",
    "https://vercel.com",
    "https://*.public.blob.vercel-storage.com",
    ...whiteboardSyncOrigins(opts.whiteboardSyncUrl),
  ].join(" ");

  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob: https://*.public.blob.vercel-storage.com",
    "font-src 'self'",
    `connect-src ${connectSrc}`,
    "frame-ancestors 'none'",
  ].join("; ");
}
