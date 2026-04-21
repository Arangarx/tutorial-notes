/**
 * Regression test for src/app/admin/students/[id]/AudioRecordInput.tsx
 * `recorder.start()` MUST stay un-chunked.
 *
 * MIME priority is now covered by the unit test:
 *   src/__tests__/recording/mime.test.ts
 *
 * What stays here is the call-site assertion: passing a timeslice
 * (e.g. `recorder.start(1000)`) makes iOS Safari emit fragmented MP4
 * pieces that don't concatenate into a playable / Whisper-decodable
 * file. This is a property of the recorder hook's call site, not of
 * the MIME selection module, so we grep the source to lock it.
 */

import { readFileSync } from "fs";
import { join } from "path";

const SRC = readFileSync(
  join(__dirname, "..", "..", "app", "admin", "students", "[id]", "AudioRecordInput.tsx"),
  "utf8"
);

describe("AudioRecordInput recorder.start()", () => {
  test("recorder.start() is called WITHOUT a timeslice (iOS MP4 fragmentation guard)", () => {
    expect(SRC).toMatch(/recorder\.start\(\s*\)/);
    expect(SRC).not.toMatch(/recorder\.start\(\s*\d/);
  });
});
