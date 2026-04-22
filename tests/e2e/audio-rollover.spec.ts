import { test, expect } from "@playwright/test";

/**
 * Opt-in end-to-end smoke for the audio segment auto-rollover.
 *
 * Phase 5 of the recorder refactor. The dom integration test
 * (src/__tests__/dom/useAudioRecorder.dom.test.tsx) already covers the
 * rollover FSM under jsdom with a mocked MediaRecorder. This Playwright
 * spec adds real-browser coverage in Chromium so the wiring that's
 * impossible to unit-test (CSS module, button click->action, page
 * lifecycle, devicechange events) is exercised end-to-end.
 *
 * GATE: this spec is skipped unless `RUN_AUDIO_ROLLOVER_E2E=1`. The
 * playwright `webServer` block already takes ~2 minutes to boot a fresh
 * Next.js + Prisma instance; we don't want every CI run paying that price
 * for a smoke that's only useful when poking at recorder code.
 *
 * REQUIRED env when running:
 *   RUN_AUDIO_ROLLOVER_E2E=1
 *   E2E_ADMIN_EMAIL=...    # tutor account on the test DB
 *   E2E_ADMIN_PASSWORD=...
 *   E2E_STUDENT_ID=...     # an existing student row owned by that admin
 *
 * Local invocation:
 *   $env:RUN_AUDIO_ROLLOVER_E2E="1"
 *   $env:E2E_ADMIN_EMAIL="you@example.com"
 *   $env:E2E_ADMIN_PASSWORD="..."
 *   $env:E2E_STUDENT_ID="cuid..."
 *   npx playwright test tests/e2e/audio-rollover.spec.ts
 *
 * The page-side stubs:
 *   - SEGMENT_MAX_SECONDS / WARN_SEGMENT_SECONDS overrides via
 *     `window.__SEGMENT_MAX_SECONDS_OVERRIDE` (segment-policy.ts honors
 *     this in non-production builds).
 *   - MediaRecorder + getUserMedia / enumerateDevices stubs so the test
 *     doesn't depend on a real microphone or audio device on the runner.
 */

const ENABLED = process.env.RUN_AUDIO_ROLLOVER_E2E === "1";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "";
const STUDENT_ID = process.env.E2E_STUDENT_ID ?? "";

test.describe("audio segment auto-rollover (Phase 5 e2e)", () => {
  test.skip(
    !ENABLED,
    "RUN_AUDIO_ROLLOVER_E2E=1 not set — skipping opt-in e2e smoke"
  );

  test.beforeEach(async ({ page }) => {
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !STUDENT_ID) {
      test.skip(true, "Missing E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD / E2E_STUDENT_ID env vars");
    }

    // Inject stubs BEFORE any page script runs. Order matters: segment-policy
    // reads the override on every shouldRolloverSegment() call, so it picks
    // up the new value as soon as the recorder mounts.
    await page.addInitScript(() => {
      const w = window as unknown as {
        __SEGMENT_MAX_SECONDS_OVERRIDE?: number;
        __WARN_SEGMENT_SECONDS_OVERRIDE?: number;
      };
      w.__SEGMENT_MAX_SECONDS_OVERRIDE = 6; // rollover at 6s
      w.__WARN_SEGMENT_SECONDS_OVERRIDE = 3; // warn at 3s

      // Fake getUserMedia returning a tracked but silent stream.
      const fakeTrack = {
        kind: "audio",
        enabled: true,
        readyState: "live",
        stop() {
          (this as { readyState: string }).readyState = "ended";
        },
        addEventListener() {},
        removeEventListener() {},
        getSettings() {
          return { deviceId: "stub-mic" };
        },
      };
      const fakeStream = {
        active: true,
        id: "stub-stream",
        getTracks: () => [fakeTrack],
        getAudioTracks: () => [fakeTrack],
        getVideoTracks: () => [],
        addEventListener() {},
        removeEventListener() {},
      };
      const md = navigator.mediaDevices as unknown as {
        getUserMedia: (...args: unknown[]) => Promise<unknown>;
        enumerateDevices: () => Promise<unknown[]>;
      };
      md.getUserMedia = async () => fakeStream;
      md.enumerateDevices = async () => [
        { kind: "audioinput", deviceId: "stub-mic", label: "Stub Mic", groupId: "g" },
      ];

      // Stubbed MediaRecorder. Emits a single small Blob on stop so the
      // upload chain has something to ship to /admin/.../upload.
      class StubMediaRecorder {
        public state: "inactive" | "recording" | "paused" = "inactive";
        public mimeType: string;
        public ondataavailable: ((e: { data: Blob }) => void) | null = null;
        public onstop: (() => void) | null = null;
        public onstart: (() => void) | null = null;
        public onerror: ((e: unknown) => void) | null = null;
        constructor(_stream: unknown, opts?: { mimeType?: string }) {
          this.mimeType = opts?.mimeType ?? "audio/webm";
        }
        static isTypeSupported(_t: string): boolean {
          return true;
        }
        start(): void {
          this.state = "recording";
          this.onstart?.();
        }
        stop(): void {
          this.state = "inactive";
          const blob = new Blob([new Uint8Array([0, 1, 2, 3])], {
            type: this.mimeType,
          });
          this.ondataavailable?.({ data: blob });
          this.onstop?.();
        }
        pause(): void {
          this.state = "paused";
        }
        resume(): void {
          this.state = "recording";
        }
        requestData(): void {
          /* no-op */
        }
      }
      (window as unknown as { MediaRecorder: typeof StubMediaRecorder }).MediaRecorder =
        StubMediaRecorder;
    });

    // Log in via the email/password flow.
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(ADMIN_EMAIL);
    await page.getByLabel(/password/i).fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: /^(sign in|log in)$/i }).click();
    await page.waitForURL(/\/admin/);
  });

  test("auto-rolls a segment within 10 seconds with the override applied", async ({ page }) => {
    await page.goto(`/admin/students/${STUDENT_ID}`);

    // Switch to the Record tab in AudioInputTabs.
    await page.getByTestId("tab-record").click();

    // Start the recording.
    await page.getByTestId("audio-record-start").click();

    // After the warn threshold (3s) the warning copy should appear.
    await expect(
      page.getByText(/in this segment — will save & continue/i)
    ).toBeVisible({ timeout: 10_000 });

    // After the cap (6s), the recorder should auto-roll: the segment
    // number advances to 2 in the live header (Part 2 ·). The mic stays
    // hot, so the controls shouldn't disappear.
    await expect(page.getByText(/Part 2/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("audio-record-controls")).toBeVisible();
  });
});
