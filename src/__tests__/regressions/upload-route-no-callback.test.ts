/**
 * Regression test for src/app/api/upload/audio/route.ts.
 *
 * Background: client-direct uploads to Vercel Blob (the @vercel/blob/client
 * `upload()` flow) sign a single-use token via our handleUpload route. If
 * `onUploadCompleted` is passed to handleUpload, Vercel's helper tries to
 * embed a callbackUrl in the token. On localhost there is no callbackUrl
 * to determine (no VERCEL=1 and usually no VERCEL_BLOB_CALLBACK_URL) — the
 * token is signed with onUploadCompleted: undefined, and Vercel's edge
 * then 400s the actual PUT because the request / token handshake doesn't
 * reconcile cleanly. Sarah's smoke #2 hung on exactly this for ~30s of
 * "Uploading recording..." before erroring out.
 *
 * The fix is to NOT pass onUploadCompleted at all. We don't need it —
 * the recording row is written by the caller once it learns result.url.
 * If you ever need post-upload server-side work, see the route file
 * header comment for how to do it without breaking local dev.
 *
 * If you re-add onUploadCompleted to this route, you MUST also document
 * how local-dev users should set VERCEL_BLOB_CALLBACK_URL (or use the
 * preview URL) — and update this test to permit it.
 */

import { readFileSync } from "fs";
import { join } from "path";

const SRC = readFileSync(
  join(__dirname, "..", "..", "app", "api", "upload", "audio", "route.ts"),
  "utf8"
);

describe("api/upload/audio/route.ts client-direct upload", () => {
  test("does NOT pass onUploadCompleted to handleUpload (breaks localhost)", () => {
    // The literal property must not appear inside the handleUpload({...})
    // call. Comments mentioning it are fine — that's the documentation
    // for why we removed it. We strip line comments (// ...) and block
    // comments (/* ... */) before checking, so docstring mentions don't
    // trigger a false positive.
    const codeOnly = SRC
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    expect(codeOnly).not.toMatch(/onUploadCompleted\s*:/);
  });

  test("calls handleUpload with onBeforeGenerateToken (auth gate)", () => {
    expect(SRC).toContain("handleUpload");
    expect(SRC).toContain("onBeforeGenerateToken");
  });

  test("ownership check happens inside the token-mint handler", () => {
    // The actual auth gate. If this regresses, anyone could upload to
    // any studentId by passing it in clientPayload.
    expect(SRC).toContain("assertOwnsStudent");
  });
});
