import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { rateLimit } from "@/lib/rate-limit";

// ---------------------------------------------------------------------------
// Security headers — applied to every response
// ---------------------------------------------------------------------------
const securityHeaders: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(self), geolocation=()",
  "X-DNS-Prefetch-Control": "on",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    // media-src must include blob: so the AI assist panel can preview a
    // newly recorded/uploaded audio Blob via URL.createObjectURL before
    // sending it for transcription. Without this, Chrome's CSP blocks the
    // <audio> element with "MEDIA_ELEMENT_ERROR: Media Load rejected by
    // URL safety check" and the user sees "Preview unavailable".
    //
    // The *.public.blob.vercel-storage.com host is also needed because once
    // a recording is saved, subsequent visits play it directly from the
    // Vercel Blob CDN (not from a local blob: URL).
    "media-src 'self' blob: https://*.public.blob.vercel-storage.com",
    "font-src 'self'",
    // connect-src must allow:
    //   - 'self' for our own /api routes (auth, upload-token, AI actions)
    //   - https://vercel.com for client-direct blob uploads. The
    //     @vercel/blob/client `upload()` helper (B1 refactor, used by the
    //     recorder and the upload tab) PUTs the audio bytes from the
    //     browser to https://vercel.com/api/blob/?pathname=... — without
    //     this, the upload silently hangs on the first PUT with
    //     "Refused to connect because it violates the document's CSP"
    //     in the console.
    //   - https://*.public.blob.vercel-storage.com for fetch()-based
    //     reads of saved recordings (e.g. retrying transcription on an
    //     existing blob URL).
    "connect-src 'self' https://vercel.com https://*.public.blob.vercel-storage.com",
    "frame-ancestors 'none'",
  ].join("; "),
};

function addSecurityHeaders(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(securityHeaders)) {
    response.headers.set(key, value);
  }
  return response;
}

// ---------------------------------------------------------------------------
// Rate-limit configurations per route group
// ---------------------------------------------------------------------------
const AUTH_RATE_LIMIT = { max: 10, windowMs: 60_000 };  // 10 req/min
const API_RATE_LIMIT  = { max: 30, windowMs: 60_000 };  // 30 req/min
const SETUP_RATE_LIMIT = { max: 5, windowMs: 60_000 };  // 5 req/min

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

function rateLimitResponse(retryAfterMs: number): NextResponse {
  return addSecurityHeaders(
    NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) },
      }
    )
  );
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const ip = getClientIp(req);

  // --- Rate limiting on sensitive endpoints ---
  if (
    pathname.startsWith("/api/auth/") ||
    pathname === "/login" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password"
  ) {
    const rl = rateLimit(`auth:${ip}`, AUTH_RATE_LIMIT.max, AUTH_RATE_LIMIT.windowMs);
    if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);
  } else if (pathname.startsWith("/api/")) {
    const rl = rateLimit(`api:${ip}`, API_RATE_LIMIT.max, API_RATE_LIMIT.windowMs);
    if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);
  } else if (pathname === "/setup") {
    const rl = rateLimit(`setup:${ip}`, SETUP_RATE_LIMIT.max, SETUP_RATE_LIMIT.windowMs);
    if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);
  }

  // --- Admin route protection ---
  if (pathname.startsWith("/admin")) {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("callbackUrl", pathname);
      return addSecurityHeaders(NextResponse.redirect(loginUrl));
    }
  }

  // --- All other routes: pass through with security headers ---
  return addSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, sitemap.xml, robots.txt
     * - public assets
     */
    "/((?!_next/static|_next/image|favicon\\.ico|sitemap\\.xml|robots\\.txt).*)",
  ],
};
