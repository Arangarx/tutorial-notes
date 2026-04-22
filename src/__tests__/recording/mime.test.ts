/**
 * Regression coverage for `chooseMimeType` priority + `fileExtension` mapping.
 *
 * The webm-before-mp4 invariant has flipped twice in this codebase. Putting
 * `audio/mp4` first makes desktop Chrome record MP4, which Whisper can
 * transcribe but `<audio>` cannot reliably play back ("Preview unavailable"
 * fallback). WebM must come first; iOS Safari naturally falls through to MP4
 * because it's the only browser without WebM MediaRecorder support.
 *
 * Subsumes the older src-grep regression test
 * (src/__tests__/regressions/audio-mime-priority.test.ts).
 */

import {
  chooseMimeType,
  fileExtension,
  MIME_CANDIDATES,
} from "@/lib/recording/mime";

describe("MIME_CANDIDATES priority order", () => {
  test("audio/webm appears in the list", () => {
    expect(MIME_CANDIDATES.some((m) => m.startsWith("audio/webm"))).toBe(true);
  });

  test("audio/mp4 appears in the list (so iOS Safari can record)", () => {
    expect(MIME_CANDIDATES).toContain("audio/mp4");
  });

  test("first audio/webm entry comes before audio/mp4 (Chrome preview regression guard)", () => {
    const webmIndex = MIME_CANDIDATES.findIndex((m) => m.startsWith("audio/webm"));
    const mp4Index = MIME_CANDIDATES.indexOf("audio/mp4");
    expect(webmIndex).toBeGreaterThan(-1);
    expect(mp4Index).toBeGreaterThan(-1);
    expect(webmIndex).toBeLessThan(mp4Index);
  });
});

describe("chooseMimeType", () => {
  const originalMR = (globalThis as { MediaRecorder?: unknown }).MediaRecorder;

  afterEach(() => {
    if (originalMR === undefined) {
      delete (globalThis as { MediaRecorder?: unknown }).MediaRecorder;
    } else {
      (globalThis as { MediaRecorder?: unknown }).MediaRecorder = originalMR;
    }
  });

  test("falls back to audio/webm when MediaRecorder is undefined (SSR / node)", () => {
    delete (globalThis as { MediaRecorder?: unknown }).MediaRecorder;
    expect(chooseMimeType()).toBe("audio/webm");
  });

  test("returns the first supported candidate (webm-opus on modern Chrome)", () => {
    (globalThis as { MediaRecorder?: unknown }).MediaRecorder = {
      isTypeSupported: (m: string) => m === "audio/webm;codecs=opus" || m === "audio/webm",
    };
    expect(chooseMimeType()).toBe("audio/webm;codecs=opus");
  });

  test("falls through to audio/mp4 when no webm is supported (iOS Safari)", () => {
    (globalThis as { MediaRecorder?: unknown }).MediaRecorder = {
      isTypeSupported: (m: string) => m === "audio/mp4",
    };
    expect(chooseMimeType()).toBe("audio/mp4");
  });

  test("returns empty string when nothing is supported (defensive — caller decides)", () => {
    (globalThis as { MediaRecorder?: unknown }).MediaRecorder = {
      isTypeSupported: () => false,
    };
    expect(chooseMimeType()).toBe("");
  });
});

describe("fileExtension", () => {
  test("audio/mp4 -> mp4", () => {
    expect(fileExtension("audio/mp4")).toBe("mp4");
    expect(fileExtension("audio/mp4;codecs=mp4a.40.2")).toBe("mp4");
  });

  test("audio/ogg -> ogg", () => {
    expect(fileExtension("audio/ogg")).toBe("ogg");
    expect(fileExtension("audio/ogg;codecs=opus")).toBe("ogg");
  });

  test("audio/webm and unknown types -> webm (sensible default for our recorder)", () => {
    expect(fileExtension("audio/webm")).toBe("webm");
    expect(fileExtension("audio/webm;codecs=opus")).toBe("webm");
    expect(fileExtension("")).toBe("webm");
    expect(fileExtension("audio/wav")).toBe("webm");
  });
});
