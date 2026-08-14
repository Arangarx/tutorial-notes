/**
 * Playwright-local hermetic Vercel Blob substitute.
 *
 * Active only when BOTH `PLAYWRIGHT_TEST === "1"` AND `BLOB_HARNESS_LOCAL === "1"`.
 * Production deploys and normal `npm run dev` never set both — behavior is unchanged.
 */

import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { isPlaywrightTestProductionLocked } from "@/lib/playwright-test-route";

/** Vercel Blob hostname guard — production shape. */
export const ALLOWED_BLOB_HOST_RE =
  /(^|\/\/)[\w.-]*blob\.vercel-storage\.com\//i;

const HARNESS_OBJECT_PREFIX = "/api/test/blob/object/";

type StoredObject = {
  bytes: Buffer;
  contentType: string;
};

const HARNESS_STORE_KEY = Symbol.for("tutoring-notes.blob.harness.store");

const HARNESS_PENDING_PUT_KEY = Symbol.for("tutoring-notes.blob.harness.pendingPut");

type HarnessGlobal = typeof globalThis & {
  [HARNESS_STORE_KEY]?: Map<string, StoredObject>;
  [HARNESS_PENDING_PUT_KEY]?: Map<string, string>;
};

function harnessStore(): Map<string, StoredObject> {
  const g = globalThis as HarnessGlobal;
  if (!g[HARNESS_STORE_KEY]) {
    g[HARNESS_STORE_KEY] = new Map();
  }
  return g[HARNESS_STORE_KEY];
}

function pendingPutTokens(): Map<string, string> {
  const g = globalThis as HarnessGlobal;
  if (!g[HARNESS_PENDING_PUT_KEY]) {
    g[HARNESS_PENDING_PUT_KEY] = new Map();
  }
  return g[HARNESS_PENDING_PUT_KEY];
}

/** Clear in-memory harness state (Playwright per-test isolation). */
export function resetHarnessStore(): void {
  harnessStore().clear();
  pendingPutTokens().clear();
}

export function issueHarnessPutToken(pathname: string): string {
  const key = pathname.replace(/^\/+/, "");
  const token = randomBytes(16).toString("hex");
  pendingPutTokens().set(key, token);
  return token;
}

export function consumeHarnessPutToken(pathname: string, token: string | null): boolean {
  if (!token) return false;
  const key = pathname.replace(/^\/+/, "");
  const expected = pendingPutTokens().get(key);
  if (!expected || expected !== token) return false;
  pendingPutTokens().delete(key);
  return true;
}

export function isBlobHarnessActive(): boolean {
  if (isPlaywrightTestProductionLocked()) {
    return false;
  }
  return (
    process.env.PLAYWRIGHT_TEST === "1" &&
    process.env.BLOB_HARNESS_LOCAL === "1"
  );
}

/** Allowed origins for harness blob URLs (same-origin + local dev). */
function isHarnessBlobOrigin(origin: string): boolean {
  if (origin === "null") return false;
  try {
    const host = new URL(origin).hostname;
    if (host === "localhost" || host === "127.0.0.1") return true;
    const nextAuth = process.env.NEXTAUTH_URL?.trim();
    if (nextAuth) {
      return new URL(nextAuth).origin === origin;
    }
  } catch {
    return false;
  }
  return false;
}

export function isHarnessBlobUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.pathname.startsWith(HARNESS_OBJECT_PREFIX) &&
      isHarnessBlobOrigin(u.origin)
    );
  } catch {
    return false;
  }
}

export function isAllowedBlobUrl(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false;
  if (ALLOWED_BLOB_HOST_RE.test(url)) return true;
  if (isBlobHarnessActive() && isHarnessBlobUrl(url)) return true;
  return false;
}

/** Object key inside the harness store (no leading slash). */
export function pathnameFromHarnessUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (!u.pathname.startsWith(HARNESS_OBJECT_PREFIX)) return null;
    const segments = u.pathname
      .slice(HARNESS_OBJECT_PREFIX.length)
      .split("/")
      .filter(Boolean)
      .map((s) => decodeURIComponent(s));
    if (!segments.length) return null;
    return segments.join("/");
  } catch {
    return null;
  }
}

export function harnessBlobUrl(requestOrOrigin: Request | string, pathname: string): string {
  const origin =
    typeof requestOrOrigin === "string"
      ? requestOrOrigin
      : new URL(requestOrOrigin.url).origin;
  const key = pathname.replace(/^\/+/, "");
  const segmentPath = key
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/");
  return `${origin}${HARNESS_OBJECT_PREFIX}${segmentPath}`;
}

export function harnessStorePut(
  pathname: string,
  body: Buffer,
  contentType: string
): void {
  const key = pathname.replace(/^\/+/, "");
  harnessStore().set(key, { bytes: body, contentType });
}

export function harnessStoreGet(pathname: string): StoredObject | null {
  const key = pathname.replace(/^\/+/, "");
  return harnessStore().get(key) ?? null;
}

function randomSuffix(len = 12): string {
  return randomBytes(len).toString("hex").slice(0, len);
}

export type HarnessMintResponse = {
  type: "blob.generate-client-token";
  harness: true;
  putUrl: string;
  blobUrl: string;
  pathname: string;
  putToken: string;
};

type GenerateClientTokenBody = {
  type: "blob.generate-client-token";
  payload: {
    pathname: string;
    clientPayload: string | null;
    multipart?: boolean;
  };
};

/**
 * Server-side substitute for @vercel/blob `put()` when the harness is active.
 */
export async function harnessServerPut(
  pathname: string,
  body: string | Buffer | Uint8Array,
  options: { contentType?: string; addRandomSuffix?: boolean },
  requestOrigin: string
): Promise<{ url: string; pathname: string }> {
  let finalPath = pathname.replace(/^\/+/, "");
  if (options.addRandomSuffix) {
    finalPath = `${finalPath}-${randomSuffix()}`;
  }
  const bytes = Buffer.isBuffer(body)
    ? body
    : Buffer.from(typeof body === "string" ? body : body);
  const contentType = options.contentType ?? "application/octet-stream";
  harnessStorePut(finalPath, bytes, contentType);
  return {
    url: harnessBlobUrl(requestOrigin, finalPath),
    pathname: finalPath,
  };
}

/**
 * Mint harness PUT + blob URLs after `onBeforeGenerateToken` auth succeeds.
 */
export async function handleHarnessBlobGenerateClientToken(
  request: Request,
  body: GenerateClientTokenBody,
  onBeforeGenerateToken: (
    pathname: string,
    clientPayload: string | null,
    multipart: boolean
  ) => Promise<{
    allowedContentTypes?: string[];
    maximumSizeInBytes?: number;
    addRandomSuffix?: boolean;
    tokenPayload?: string;
  }>
): Promise<HarnessMintResponse> {
  const { pathname, clientPayload, multipart = false } = body.payload;
  const tokenOptions = await onBeforeGenerateToken(
    pathname,
    clientPayload,
    multipart
  );
  let finalPathname = pathname.replace(/^\/+/, "");
  if (tokenOptions.addRandomSuffix) {
    finalPathname = `${finalPathname}-${randomSuffix()}`;
  }
  const origin = new URL(request.url).origin;
  const blobUrl = harnessBlobUrl(origin, finalPathname);
  const putToken = issueHarnessPutToken(finalPathname);
  return {
    type: "blob.generate-client-token",
    harness: true,
    putUrl: blobUrl,
    blobUrl,
    pathname: finalPathname,
    putToken,
  };
}

function parseRange(
  rangeHeader: string | null,
  total: number
): { start: number; end: number } | null {
  if (!rangeHeader || !rangeHeader.startsWith("bytes=")) return null;
  const spec = rangeHeader.slice(6).trim();
  const [startStr, endStr] = spec.split("-");
  if (startStr === "" && endStr) {
    const suffix = parseInt(endStr, 10);
    if (!Number.isFinite(suffix)) return null;
    const start = Math.max(0, total - suffix);
    return { start, end: total - 1 };
  }
  const start = parseInt(startStr ?? "0", 10);
  const end = endStr ? parseInt(endStr, 10) : total - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) return null;
  return { start: Math.min(start, total - 1), end: Math.min(end, total - 1) };
}

/** Range-aware GET for harness object keys (audio replay / scrub). */
export function serveHarnessObject(
  pathname: string,
  req: Request,
  fallbackContentType = "application/octet-stream"
): Response {
  const stored = harnessStoreGet(pathname);
  if (!stored) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const total = stored.bytes.byteLength;
  const range = parseRange(req.headers.get("range"), total);
  const contentType = stored.contentType || fallbackContentType;

  if (!range) {
    return new Response(new Uint8Array(stored.bytes), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(total),
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  const slice = stored.bytes.subarray(range.start, range.end + 1);
  return new Response(new Uint8Array(slice), {
    status: 206,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(slice.byteLength),
      "Content-Range": `bytes ${range.start}-${range.end}/${total}`,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600",
    },
  });
}

/** Proxy helper — stream harness bytes with range support (same contract as Vercel fetch). */
export async function streamHarnessBlobWithRangeSupport(
  req: Request,
  blobUrl: string,
  mimeType: string
): Promise<Response> {
  const pathname = pathnameFromHarnessUrl(blobUrl);
  if (!pathname) {
    return NextResponse.json({ error: "Audio unavailable" }, { status: 502 });
  }
  return serveHarnessObject(pathname, req, mimeType);
}
