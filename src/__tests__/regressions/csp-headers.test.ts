/**
 * Regression tests for the Content-Security-Policy header.
 *
 * Background:
 *
 *   - A missing `media-src 'self' blob:` directive caused Chrome to silently
 *     block the audio preview in the AI assist panel with
 *     "MEDIA_ELEMENT_ERROR: Media Load rejected by URL safety check". The
 *     preview pulls in audio via URL.createObjectURL (a blob: URL), which
 *     falls back to default-src 'self' if media-src isn't explicitly set.
 *
 *   - A missing connect-src entry for the @vercel/blob/client upload host
 *     (B1 refactor) silently hung the audio upload with "Refused to connect
 *     because it violates the document's Content Security Policy".
 *
 *   - A missing connect-src entry for `wss://wb.mortensenapps.com` (the
 *     whiteboard live-collab relay) blocked the WebSocket so the student
 *     page sat on "Joining…" forever — the symptom that drove this file
 *     to be rewritten as a behavior test.
 *
 *   - A missing `font-src data:` entry blocked Excalidraw 0.18's bundled
 *     fonts (Cascadia/Virgil/Assistant — shipped as base64 data URIs in
 *     the package's CSS) with "Loading the font '<URL>' violates the
 *     following Content Security Policy directive: font-src 'self'".
 *     The canvas silently fell back to system fonts, so labels rendered
 *     in the wrong typeface. data: for fonts is safe (no network egress).
 *
 * If you change the CSP and break one of these, FIRST verify there's an
 * alternative directive that still permits the same thing. Don't just
 * delete the assertion — the CSP exists to prevent supply-chain attacks
 * but every directive blocks something legitimate too.
 */

import {
  buildContentSecurityPolicy,
  whiteboardSyncOrigins,
} from "@/lib/security/csp";

function getDirective(csp: string, name: string): string | null {
  for (const part of csp.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${name} `) || trimmed === name) {
      return trimmed.slice(name.length).trim();
    }
  }
  return null;
}

describe("buildContentSecurityPolicy — directive guards", () => {
  const csp = buildContentSecurityPolicy({});

  test("media-src includes blob: (audio preview regression guard)", () => {
    expect(getDirective(csp, "media-src")).toMatch(/\bblob:/);
  });

  test("media-src includes 'self' (in-app audio playback)", () => {
    expect(getDirective(csp, "media-src")).toMatch(/'self'/);
  });

  test("media-src allows the Vercel Blob CDN host (saved recording playback)", () => {
    expect(getDirective(csp, "media-src")).toMatch(
      /https:\/\/\*\.public\.blob\.vercel-storage\.com/
    );
  });

  test("img-src still includes blob: and data:", () => {
    const directive = getDirective(csp, "img-src") ?? "";
    expect(directive).toMatch(/\bblob:/);
    expect(directive).toMatch(/\bdata:/);
  });

  test("font-src includes data: (Excalidraw 0.18 bundled-font regression guard)", () => {
    // Excalidraw 0.18 inlines its custom fonts as base64 data URIs.
    // Without `data:` here the canvas silently falls back to system
    // fonts; tutors see strokes in the wrong typeface and Chrome logs
    // "Loading the font '<URL>' violates the following CSP directive:
    // font-src 'self'".
    expect(getDirective(csp, "font-src")).toMatch(/\bdata:/);
  });

  test("font-src includes blob: (Excalidraw / canvas @font-face via object URL)", () => {
    // Some code paths use blob: URLs for font faces, not just data:.
    expect(getDirective(csp, "font-src")).toMatch(/\bblob:/);
  });

  test("font-src still includes 'self' (our own /_next/static fonts)", () => {
    expect(getDirective(csp, "font-src")).toMatch(/'self'/);
  });

  test("frame-ancestors 'none' is preserved (clickjacking protection)", () => {
    expect(getDirective(csp, "frame-ancestors")).toBe("'none'");
  });

  test("connect-src allows the Vercel Blob upload endpoint (B1 regression)", () => {
    expect(getDirective(csp, "connect-src")).toMatch(/\bhttps:\/\/vercel\.com\b/);
  });

  test("connect-src allows the Vercel Blob CDN host (saved recording fetch)", () => {
    expect(getDirective(csp, "connect-src")).toMatch(
      /https:\/\/\*\.public\.blob\.vercel-storage\.com/
    );
  });

  test("connect-src allows 'self' (our own /api routes)", () => {
    expect(getDirective(csp, "connect-src")).toMatch(/'self'/);
  });
});

describe("buildContentSecurityPolicy — whiteboard sync URL handling", () => {
  test("appends wss:// AND https:// origin for a wss whiteboard URL", () => {
    const csp = buildContentSecurityPolicy({
      whiteboardSyncUrl: "wss://wb.mortensenapps.com",
    });
    const connect = getDirective(csp, "connect-src") ?? "";
    expect(connect).toContain("wss://wb.mortensenapps.com");
    expect(connect).toContain("https://wb.mortensenapps.com");
  });

  test("appends ws:// AND http:// origin for a ws localhost URL", () => {
    const csp = buildContentSecurityPolicy({
      whiteboardSyncUrl: "ws://localhost:3002",
    });
    const connect = getDirective(csp, "connect-src") ?? "";
    expect(connect).toContain("ws://localhost:3002");
    expect(connect).toContain("http://localhost:3002");
  });

  test("does NOT add anything when whiteboard URL is missing", () => {
    const csp = buildContentSecurityPolicy({});
    expect(getDirective(csp, "connect-src")).not.toMatch(/wss?:|wb\./);
  });
});

describe("whiteboardSyncOrigins — input shapes", () => {
  test("returns wss + https for a wss URL", () => {
    expect(whiteboardSyncOrigins("wss://wb.mortensenapps.com")).toEqual([
      "wss://wb.mortensenapps.com",
      "https://wb.mortensenapps.com",
    ]);
  });

  test("returns ws + http for a ws URL with port", () => {
    expect(whiteboardSyncOrigins("ws://localhost:3002")).toEqual([
      "ws://localhost:3002",
      "http://localhost:3002",
    ]);
  });

  test("preserves non-default port in the host (avoids cross-port CSP miss)", () => {
    expect(whiteboardSyncOrigins("wss://relay.example.com:8443")).toEqual([
      "wss://relay.example.com:8443",
      "https://relay.example.com:8443",
    ]);
  });

  test("returns empty array for undefined / empty / non-string input", () => {
    expect(whiteboardSyncOrigins(undefined)).toEqual([]);
    expect(whiteboardSyncOrigins("")).toEqual([]);
    // @ts-expect-error — guarding against non-string at runtime
    expect(whiteboardSyncOrigins(42)).toEqual([]);
  });

  test("returns empty array for malformed URL", () => {
    expect(whiteboardSyncOrigins("not a url")).toEqual([]);
  });

  test("returns empty array for non-websocket scheme (https / http)", () => {
    // We deliberately reject https/http because the env validator only
    // accepts wss:// or ws://; if the env flips to https://, that's a
    // misconfiguration, not something CSP should silently paper over.
    expect(whiteboardSyncOrigins("https://wb.mortensenapps.com")).toEqual([]);
    expect(whiteboardSyncOrigins("http://localhost:3002")).toEqual([]);
  });
});
