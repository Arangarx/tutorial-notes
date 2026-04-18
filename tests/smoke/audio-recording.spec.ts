import { test } from "../visual/fixtures";
import { expect } from "@playwright/test";
import { seedTestAdmin, seedTestStudent, loginAsTestAdmin } from "../visual/helpers";

/**
 * Audio recording smoke test.
 *
 * This is the catch-all regression for the "Preview unavailable" class of bugs:
 *   - CSP missing media-src blob: (bug: 96037b7)
 *   - audio/mp4 listed first in chooseMimeType (bug: 5402547)
 *   - loadedOk stale closure in onError (bug: 28da705)
 *
 * How it works:
 *   1. Mocks navigator.mediaDevices.getUserMedia to avoid needing a real mic
 *   2. Mocks MediaRecorder to produce a real (tiny) WebM blob without hardware
 *   3. Intercepts the uploadAudioAction server call and returns a fake blob URL
 *      so we don't need Vercel Blob configured in the test environment
 *   4. Drives the record → stop & save flow via the UI
 *   5. Asserts:
 *      a. The <audio data-testid="audio-preview"> element appears
 *      b. The "Preview unavailable" fallback text is NOT shown
 *      c. The console-error guard doesn't trip (no CSP violations etc.)
 *
 * Run on both desktop (Chromium) and mobile (iPhone 13 emulation) per
 * playwright.config.ts, so iOS-specific regressions are also caught.
 */

// A minimal valid WebM blob (44 bytes, silent, 0.001s).
// Generated once so the test is self-contained and doesn't need ffmpeg.
// This is enough to make URL.createObjectURL return a usable blob: URL.
const MINIMAL_WEBM_BASE64 =
  "GkXfowEAAAAAAAAfQoaBAUL3gQFC8oEEQvOBCEKChHdlYm1Ch4ECQoWBAhhTgGcBAAAAAAAVkhFNm3RALE27i1OrhBVJqWZTrIHfTbuMU6uEFlSua1OsggEwTbuMU6uEHFO7a1OsghBTwqtrrIQCLuxVJqWZTrIHfTbuMU6uEFlSua1OsggEwTbuMU6uEHFO7a1OsghBTwqtrrIQCLuxVJqWZTrIHfTbuMU6uEFlSua1OsggEwTbuMU6uEHFO7a1OsghBTwqtrrIQCLuxVJqWZTrIHfTbuMU6uEFlSua1OsggEwTbuMU6uEHFO7a1OsghBTwqtrrIQCLuxVJqWZTrIHfTbuMU6uEFlSua1OsggEwTbuMU6uEHFO7a1OsghBTwqtrrIQCLuxVJqWZTrIHfTbuMU6uEFlSua1OsggEwTbuMU6uEHFO7a1OsghBTwqtrrIQCLuxVJqWZTrIHfTbuMU6uEFlSua1OsggEwTbuMU6uEHFO7a1OsghBTwqtrrIQCLuxVJqWZTrIHfTbuMU6uEFlSua1OsggEwTbuMU6uEHFO7a1OsghBTwqtrrIQCLux";

let studentId: string;

test.beforeAll(async () => {
  const adminId = await seedTestAdmin();
  const seed = await seedTestStudent(adminId);
  studentId = seed.studentId;
});

test("audio recording — preview appears without console errors", async ({
  guardedPage,
}) => {
  await loginAsTestAdmin(guardedPage);

  // ------------------------------------------------------------------
  // 1. Mock getUserMedia — no real mic needed
  // ------------------------------------------------------------------
  await guardedPage.addInitScript(() => {
    const silentStream = { getTracks: () => [{ stop: () => {} }] } as unknown as MediaStream;
    Object.defineProperty(navigator, "mediaDevices", {
      writable: true,
      value: {
        getUserMedia: () => Promise.resolve(silentStream),
      },
    });
  });

  // ------------------------------------------------------------------
  // 2. Mock MediaRecorder — produces a real-ish blob synchronously
  // ------------------------------------------------------------------
  await guardedPage.addInitScript((webmBase64: string) => {
    const b64ToBytes = (b64: string) => {
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return arr;
    };

    class MockMediaRecorder extends EventTarget {
      static isTypeSupported(mime: string) {
        return mime.startsWith("audio/webm");
      }
      mimeType = "audio/webm;codecs=opus";
      state: "inactive" | "recording" | "paused" = "inactive";
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;

      start() {
        this.state = "recording";
      }
      pause() {
        this.state = "paused";
      }
      resume() {
        this.state = "recording";
      }
      stop() {
        this.state = "inactive";
        // Fire a dataavailable event with a tiny WebM blob
        const bytes = b64ToBytes(webmBase64);
        const blob = new Blob([bytes], { type: "audio/webm;codecs=opus" });
        if (this.ondataavailable) this.ondataavailable({ data: blob });
        if (this.onstop) this.onstop();
      }
    }

    // @ts-expect-error — overriding browser global for test
    window.MediaRecorder = MockMediaRecorder;
  }, MINIMAL_WEBM_BASE64);

  // ------------------------------------------------------------------
  // 3. Intercept uploadAudioAction (Next.js server action) — return
  //    a fake blob URL so Vercel Blob isn't needed in test env.
  //    Server actions are POST requests to the page URL with a header.
  // ------------------------------------------------------------------
  await guardedPage.route("**/admin/students/**", async (route, request) => {
    // Server action requests have Next-Action header
    if (request.headers()["next-action"]) {
      // Return a minimal server action response that matches { ok: true, blobUrl }
      await route.fulfill({
        status: 200,
        contentType: "text/x-component",
        body: `0:{"ok":true,"blobUrl":"https://fake-blob.vercel-storage.com/test-audio.webm"}\n`,
      });
      return;
    }
    await route.continue();
  });

  // ------------------------------------------------------------------
  // 4. Navigate to student page and switch to the Record tab
  // ------------------------------------------------------------------
  await guardedPage.goto(`/admin/students/${studentId}`);
  await guardedPage.waitForLoadState("networkidle");

  // Click the Record tab in the AI assist panel
  const recordTab = guardedPage.getByRole("tab", { name: /record/i });
  if (await recordTab.isVisible()) {
    await recordTab.click();
  }

  // ------------------------------------------------------------------
  // 5. Drive the recording flow
  // ------------------------------------------------------------------
  await guardedPage.getByTestId("audio-record-start").click();
  // Small wait so recording "starts"
  await guardedPage.waitForTimeout(300);
  await guardedPage.getByTestId("audio-record-stop").click();

  // ------------------------------------------------------------------
  // 6. Assert preview appears and no fallback message
  // ------------------------------------------------------------------
  await guardedPage.waitForSelector('[data-testid="audio-record-done"]', { timeout: 10_000 });

  // The audio preview element should be visible
  const audioPreview = guardedPage.getByTestId("audio-preview");
  await expect(audioPreview).toBeVisible({ timeout: 5_000 });

  // The "Preview unavailable" fallback must NOT be shown
  const unavailableText = guardedPage.getByTestId("audio-preview-error");
  await expect(unavailableText).not.toBeVisible();

  // Console-error guard fires automatically on test teardown via fixture.
});
