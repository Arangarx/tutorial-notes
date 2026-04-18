/**
 * Regression test for src/app/admin/students/[id]/AudioRecordInput.tsx
 * `chooseMimeType()` priority order.
 *
 * Background: this list has flipped twice. Putting `audio/mp4` first
 * makes desktop Chrome record MP4, which Whisper can transcribe but
 * <audio> cannot reliably play back (malformed container metadata,
 * "Preview unavailable" fallback shown). WebM must come first; iOS
 * Safari falls through to MP4 naturally because it's the only browser
 * that doesn't support WebM in MediaRecorder.
 *
 * If you have a legitimate reason to put MP4 before WebM, you also need
 * to fix Chrome's preview some other way and update / delete this test.
 */

import { readFileSync } from "fs";
import { join } from "path";

const SRC = readFileSync(
  join(__dirname, "..", "..", "app", "admin", "students", "[id]", "AudioRecordInput.tsx"),
  "utf8"
);

describe("AudioRecordInput chooseMimeType priority order", () => {
  test("audio/webm appears in the candidates list", () => {
    expect(SRC).toMatch(/"audio\/webm/);
  });

  test("audio/mp4 appears in the candidates list (so iOS Safari can record)", () => {
    expect(SRC).toMatch(/"audio\/mp4"/);
  });

  test("audio/webm is preferred over audio/mp4 (Chrome preview regression guard)", () => {
    const webmIndex = SRC.indexOf('"audio/webm');
    const mp4Index = SRC.indexOf('"audio/mp4"');
    expect(webmIndex).toBeGreaterThan(-1);
    expect(mp4Index).toBeGreaterThan(-1);
    expect(webmIndex).toBeLessThan(mp4Index);
  });

  test("recorder.start() is called WITHOUT a timeslice (iOS MP4 fragmentation guard)", () => {
    // start(1000) etc. produces fragmented MP4 on iOS Safari that won't
    // play back or transcribe. Must be a bare recorder.start().
    expect(SRC).toMatch(/recorder\.start\(\s*\)/);
    expect(SRC).not.toMatch(/recorder\.start\(\s*\d/);
  });
});
