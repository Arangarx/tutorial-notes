/**
 * Regression tests for src/middleware.ts CSP header.
 *
 * Background: a missing `media-src 'self' blob:` directive caused Chrome to
 * silently block the audio preview in the AI assist panel with
 * "MEDIA_ELEMENT_ERROR: Media Load rejected by URL safety check". The
 * preview pulls in audio via URL.createObjectURL (a blob: URL), which falls
 * back to default-src 'self' if media-src isn't explicitly set.
 *
 * If you change the CSP and break one of these, FIRST verify there's an
 * alternative directive that still permits the same thing. Don't just
 * delete the assertion — the CSP exists to prevent supply-chain attacks
 * but every directive blocks something legitimate too.
 */

import { readFileSync } from "fs";
import { join } from "path";

const SRC = readFileSync(
  join(__dirname, "..", "..", "middleware.ts"),
  "utf8"
);

describe("middleware.ts Content-Security-Policy", () => {
  test("media-src includes blob: (audio preview regression guard)", () => {
    expect(SRC).toMatch(/"media-src[^"]*\bblob:/);
  });

  test("media-src includes 'self' (in-app audio playback)", () => {
    expect(SRC).toMatch(/"media-src[^"]*'self'/);
  });

  test("img-src still includes blob: and data:", () => {
    expect(SRC).toMatch(/"img-src[^"]*\bblob:/);
    expect(SRC).toMatch(/"img-src[^"]*\bdata:/);
  });

  test("frame-ancestors 'none' is preserved (clickjacking protection)", () => {
    expect(SRC).toMatch(/"frame-ancestors\s+'none'"/);
  });
});
