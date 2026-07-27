/**
 * Wave A dedupe tail — page-local formatDuration(seconds) folded into
 * formatClockDuration (unpadded M:SS / H:MM:SS, null → "").
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC_ROOT = join(__dirname, "..", "..");
const REVIEW_PAGE = join(
  SRC_ROOT,
  "app",
  "admin",
  "students",
  "[id]",
  "whiteboard",
  "[whiteboardSessionId]",
  "page.tsx"
);
const PREVIEW_COMPONENT = join(
  SRC_ROOT,
  "app",
  "admin",
  "students",
  "[id]",
  "whiteboard",
  "[whiteboardSessionId]",
  "workspace",
  "WorkspacePreviousSessionPreview.tsx"
);

function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

describe("formatDuration page-local dedupe (Wave A tail)", () => {
  it.each([
    ["admin WB review page", REVIEW_PAGE],
    ["WorkspacePreviousSessionPreview", PREVIEW_COMPONENT],
  ])("%s imports formatClockDuration and has no local formatDuration", (_label, path) => {
    const content = stripComments(readFileSync(path, "utf8"));
    expect(content).toMatch(
      /from\s+["']@\/lib\/time\/format-duration-ms["']/
    );
    expect(content).toMatch(/\bformatClockDuration\b/);
    expect(content).not.toMatch(/\bfunction\s+formatDuration\b/);
  });
});
