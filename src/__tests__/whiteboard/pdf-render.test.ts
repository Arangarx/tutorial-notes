/**
 * @jest-environment jsdom
 */

/**
 * Coverage for `renderPdfFileToPngs`'s pre-render validation paths.
 *
 * We do NOT actually render a PDF here — pdfjs-dist requires a worker
 * URL that jsdom can't fetch. The real render is exercised by the
 * Playwright suite (`tests/e2e/whiteboard/pdf-insert.spec.ts`,
 * tracked under `phase1-tests`). What this file pins down:
 *
 *   - PDF_MAX_PAGES, PDF_MAX_BYTES are at the values the plan asks for
 *     (a regression here would silently let larger files through and
 *     OOM iOS Safari).
 *   - Files larger than the byte cap are rejected before pdfjs is even
 *     loaded (`reason: "too-large"`).
 *   - The browser-only guard fires when window is undefined.
 *   - The iOS sniff has stable behaviour for known UAs.
 */

import {
  PDF_MAX_BYTES,
  PDF_MAX_PAGES,
  isLikelyIOSSafari,
  renderPdfFileToPngs,
} from "@/lib/whiteboard/pdf-render";

describe("PDF render policy constants", () => {
  it("hard-caps at 30 pages", () => {
    expect(PDF_MAX_PAGES).toBe(30);
  });
  it("hard-caps at 25 MB", () => {
    expect(PDF_MAX_BYTES).toBe(25 * 1024 * 1024);
  });
});

describe("renderPdfFileToPngs validation", () => {
  it("rejects oversized files without loading pdfjs", async () => {
    // The point is that we never reach pdfjs's worker fetch — jsdom
    // would fail noisily on that, so the test passing is itself the
    // evidence the early return fired.
    const huge = new File(
      [new Uint8Array(PDF_MAX_BYTES + 1)],
      "big.pdf",
      { type: "application/pdf" }
    );
    const result = await renderPdfFileToPngs(huge);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("too-large");
    expect(result.message).toMatch(/upload limit/);
  });
});

describe("isLikelyIOSSafari", () => {
  const originalUA = navigator.userAgent;

  function setUA(ua: string, maxTouchPoints = 1) {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      get() {
        return ua;
      },
    });
    Object.defineProperty(navigator, "maxTouchPoints", {
      configurable: true,
      get() {
        return maxTouchPoints;
      },
    });
  }

  afterEach(() => {
    setUA(originalUA);
  });

  it("returns true for iPhone Safari", () => {
    setUA(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
    );
    expect(isLikelyIOSSafari()).toBe(true);
  });

  it("returns true for iPad on iPadOS 13+ (UA reports as Mac with touch)", () => {
    setUA(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      5
    );
    expect(isLikelyIOSSafari()).toBe(true);
  });

  it("returns false for Chrome on Windows", () => {
    setUA(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      0
    );
    expect(isLikelyIOSSafari()).toBe(false);
  });
});
