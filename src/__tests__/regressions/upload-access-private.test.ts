/**
 * Regression test for src/lib/recording/upload.ts client-direct upload.
 *
 * Background: the Vercel Blob store backing this project is configured
 * for private access (URL host is `<storeId>.private.blob.vercel-storage.com`).
 * Calling upload() with access:"public" against a private store returns
 * a 400 from Vercel's edge with NO CORS headers attached, which surfaces
 * in the browser as the very misleading combination of:
 *
 *   "Access to fetch at '...' from origin 'http://localhost:3000' has
 *    been blocked by CORS policy: No 'Access-Control-Allow-Origin'
 *    header is present on the requested resource."
 *   PUT https://vercel.com/api/blob/?... net::ERR_FAILED 400 (Bad Request)
 *
 * It is NOT a CORS bug; the CORS message is collateral damage from a
 * 400 issued before the CORS middleware runs. The fix is access:"private".
 *
 * Audio playback does NOT need this to be public — every consumer goes
 * through the /api/audio/[recordingId] proxy (server-side fetch with
 * Bearer token, then stream to the browser), so private storage works
 * end to end.
 *
 * If you switch this back to "public", local dev WILL break and so will
 * production unless you also reconfigure the Vercel Blob store. Don't.
 */

import { readFileSync } from "fs";
import { join } from "path";

const SRC = readFileSync(
  join(__dirname, "..", "..", "lib", "recording", "upload.ts"),
  "utf8"
);

describe("recording/upload.ts client-direct access type", () => {
  test("uploadAudioDirect uses access:'private' (matches the Vercel Blob store)", () => {
    expect(SRC).toMatch(/access:\s*"private"/);
  });

  test("uploadAudioDirect does NOT pass access:'public' (would 400 + CORS)", () => {
    // Strip line + block comments before checking; the comment EXPLAINS
    // why we can't use "public" and is allowed to mention it.
    const codeOnly = SRC
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    expect(codeOnly).not.toMatch(/access:\s*"public"/);
  });
});
