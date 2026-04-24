/**
 * Regression: every code path that writes to Vercel Blob in this
 * project MUST use `access: "private"`.
 *
 * Background: the Vercel Blob store backing this project is configured
 * for private access (URL host is `<storeId>.private.blob.vercel-storage.com`).
 * Calling put()/upload() with access:"public" against a private store
 * fails with one of two equally confusing symptoms depending on which
 * SDK surface you hit:
 *
 *   Server `put()` (server actions, route handlers):
 *     -> throws "Vercel Blob: Cannot use public access on a private
 *        store. The store is configured with private access."
 *
 *   Client `upload()` (browser, @vercel/blob/client):
 *     -> 400 from Vercel's edge with NO CORS headers attached, which
 *        the browser surfaces as:
 *          "Access to fetch at '...' from origin '...' has been blocked
 *           by CORS policy: No 'Access-Control-Allow-Origin' header
 *           is present on the requested resource."
 *          PUT https://vercel.com/api/blob/?... net::ERR_FAILED 400
 *        It is NOT a CORS bug; the CORS message is collateral damage
 *        from a 400 issued before the CORS middleware runs.
 *
 * Why this never breaks consumers: every browser-facing read goes
 * through a server proxy route that fetches with
 * BLOB_READ_WRITE_TOKEN as a Bearer header:
 *   - audio:                    /api/audio/[recordingId]
 *   - whiteboard events:        /api/whiteboard/[id]/events
 *                               /api/whiteboard/[id]/public-events
 *   - whiteboard snapshots:     /api/whiteboard/[id]/snapshot
 *                               /api/whiteboard/[id]/public-snapshot
 *
 * If you flip any of these to "public", local dev AND production will
 * break the moment the upload runs. Don't.
 *
 * Each test guard does string-matching against source so we don't have
 * to spin up Vercel Blob to validate the contract — same posture as
 * the original audio guard.
 */

import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..", "..");

function readSrc(...rel: string[]): string {
  return readFileSync(join(ROOT, ...rel), "utf8");
}

/**
 * Strip block + line comments before asserting "no access: public".
 * The comments in these files DELIBERATELY mention the failure mode
 * so the next dev understands why public is forbidden — that
 * documentation is allowed.
 */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

const PATHS_BY_NAME: Record<string, string[]> = {
  // Audio (the original failure that introduced this guard).
  "lib/recording/upload.ts": ["lib", "recording", "upload.ts"],
  // Whiteboard client-direct upload helpers (events, snapshot, assets).
  "lib/whiteboard/upload.ts": ["lib", "whiteboard", "upload.ts"],
  // Whiteboard server actions — `createWhiteboardSession` seeds the
  // empty events.json via put().
  "app/admin/students/[id]/whiteboard/actions.ts": [
    "app",
    "admin",
    "students",
    "[id]",
    "whiteboard",
    "actions.ts",
  ],
  // Whiteboard partial-checkpoint upload route — server-side put().
  "app/api/whiteboard/[sessionId]/checkpoint/route.ts": [
    "app",
    "api",
    "whiteboard",
    "[sessionId]",
    "checkpoint",
    "route.ts",
  ],
};

describe("Vercel Blob writes use access:'private' across every upload path", () => {
  for (const [name, rel] of Object.entries(PATHS_BY_NAME)) {
    describe(name, () => {
      const src = readSrc(...rel);
      test("declares access:'private' at least once", () => {
        expect(src).toMatch(/access:\s*"private"/);
      });
      test("does NOT contain access:'public' in active code", () => {
        expect(codeOnly(src)).not.toMatch(/access:\s*"public"/);
      });
    });
  }
});
