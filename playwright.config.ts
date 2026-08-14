import { defineConfig, devices } from "@playwright/test";

const { WB_REGRESSION_LOCAL_DATABASE_URL } = require("./scripts/wb-regression-local-db.cjs");

/**
 * Playwright config — visual regression, a11y, smoke, e2e, and integration tests.
 *
 * - Visual: tests/visual/ (`npm run test:e2e` desktop/mobile projects; no snapshots in integration).
 * - Smoke: tests/smoke/
 * - E2E opt-in: tests/e2e/
 * - Integration (Phase 0c+): tests/integration/ — `npm run test:integration`
 *   Behavior + API contract tests; uses `auth.setup.ts` + `storageState` (no per-test login).
 *   Full recording flow needs `BLOB_READ_WRITE_TOKEN` in `.env` (test self-skips if unset).
 *
 * Run default Playwright (all non-integration projects): npm run test:e2e
 * Update baselines: npm run test:visual:update
 *
 * Database: Playwright webServer + globalSetup force local Docker Postgres
 * (`127.0.0.1:5432/tutoring_notes`) and abort if DATABASE_URL host is not local.
 * Your `.env` may still point at Neon for normal dev; the harness never uses it.
 */
export default defineConfig({
  globalSetup: require.resolve("./tests/integration/wb-regression-global-setup.ts"),
  testDir: "./tests",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,

  expect: {
    toHaveScreenshot: {
      // Allow up to 1% pixel difference to tolerate sub-pixel anti-aliasing
      // across OS/GPU rendering. Raise only if you see consistent false
      // failures on identical-looking screenshots.
      maxDiffPixelRatio: 0.01,
      // Disable CSS animations so screenshots are stable.
      animations: "disabled",
    },
  },

  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  webServer: [
    {
      command:
        `cmd /c "set DATABASE_URL=${WB_REGRESSION_LOCAL_DATABASE_URL}&& set DIRECT_URL=${WB_REGRESSION_LOCAL_DATABASE_URL}&& set WHITEBOARD_SYNC_URL=ws://localhost:3002&& set NEXT_PUBLIC_WB_RECORD_SOLO_UNTIL_STUDENT=1&& set NEXT_PUBLIC_WB_E2E_SCENE_HOOK=1&& set WB_E2E_HARNESS=1&& set PLAYWRIGHT_TEST=1&& set PLAYWRIGHT_TEST_SECRET=playwright-test-secret&& set BLOB_HARNESS_LOCAL=1&& set BLOB_READ_WRITE_TOKEN=playwright-harness&& set NEXT_PUBLIC_PLAYWRIGHT_TEST=1&& set NEXT_PUBLIC_BLOB_HARNESS_LOCAL=1&& set NEXT_PUBLIC_CLAIM_INVITES_ENABLED=true&& set NEXTAUTH_URL=http://localhost:3100&& set GOOGLE_CLIENT_ID=playwright-harness-google-client-id&& set GOOGLE_CLIENT_SECRET=playwright-harness-google-client-secret&& set LEARNER_SESSION_HMAC_SECRET=pw-wb-test-hmac-secret-regression-2026&& set AH_SESSION_HMAC_SECRET=pw-wb-test-ah-hmac-secret-regression-2026&& node scripts/wb-regression-assert-local-db.cjs&& npx prisma db push --skip-generate --accept-data-loss&& npm run dev -- --port 3100"`,
      url: "http://localhost:3100",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "node scripts/playwright-relay-or-stub.cjs",
      url: "http://localhost:3002/",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ].concat(
    process.env.WB_SKIP_3101_WEBSERVER
      ? []
      : [
          {
            command:
              `cmd /c "set DATABASE_URL=${WB_REGRESSION_LOCAL_DATABASE_URL}&& set DIRECT_URL=${WB_REGRESSION_LOCAL_DATABASE_URL}&& set WHITEBOARD_SYNC_URL=ws://localhost:3002&& set NEXT_PUBLIC_WB_E2E_SCENE_HOOK=1&& set WB_E2E_HARNESS=1&& set PLAYWRIGHT_TEST=1&& set PLAYWRIGHT_TEST_SECRET=playwright-test-secret&& set BLOB_HARNESS_LOCAL=1&& set BLOB_READ_WRITE_TOKEN=playwright-harness&& set NEXT_PUBLIC_PLAYWRIGHT_TEST=1&& set NEXT_PUBLIC_BLOB_HARNESS_LOCAL=1&& set NEXTAUTH_URL=http://localhost:3101&& set LEARNER_SESSION_HMAC_SECRET=pw-wb-test-hmac-secret-regression-2026&& set AH_SESSION_HMAC_SECRET=pw-wb-test-ah-hmac-secret-regression-2026&& node scripts/wb-regression-assert-local-db.cjs&& npx prisma db push --skip-generate --accept-data-loss&& npm run dev -- --port 3101"`,
            url: "http://localhost:3101",
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
          },
        ],
  ),

  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
      testMatch: ["**/visual/**/*.spec.ts", "**/smoke/**/*.spec.ts"],
    },
    {
      name: "mobile",
      use: {
        ...devices["iPhone 13"],
      },
      // Smoke tests only on mobile for now; visual baselines are desktop-first.
      // Add **/visual/**/*.spec.ts here once mobile baselines are captured.
      testMatch: ["**/smoke/**/*.spec.ts"],
    },
    {
      // Opt-in browser end-to-end smokes (recorder rollover, etc.). These
      // self-skip unless their gating env var is set, so it's safe to leave
      // in the default project list — but they're isolated here to keep
      // baseline screenshot config and viewport choices independent.
      name: "e2e",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
      testMatch: ["**/e2e/**/*.spec.ts"],
    },
    {
      name: "integration-setup",
      testMatch: ["**/integration/auth.setup.ts"],
    },
    {
      name: "integration",
      dependencies: ["integration-setup"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        storageState: "tests/integration/.auth/tutor.json",
        permissions: ["microphone"],
        launchOptions: {
          args: [
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
          ],
        },
      },
      testMatch: ["**/integration/**/*.spec.ts"],
      testIgnore: [
        "**/integration/auth.setup.ts",
        "**/integration/identity/**/*.spec.ts",
        "**/integration/whiteboard-live-sync-regression.spec.ts",
        "**/integration/wb-phantom-stroke-regression.spec.ts",
      ],
    },
    {
      name: "identity-e2e",
      dependencies: ["integration-setup"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        storageState: "tests/integration/.auth/parent.json",
      },
      testMatch: ["**/integration/identity/**/*.spec.ts"],
    },
    {
      name: "wb-regression",
      dependencies: ["integration-setup"],
      workers: 1,
      retries: 1,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 900 },
        storageState: "tests/integration/.auth/tutor.json",
        permissions: ["microphone"],
        launchOptions: {
          args: [
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
          ],
        },
      },
      testMatch: [
        "**/integration/whiteboard-live-sync-regression.spec.ts",
        "**/integration/wb-student-exit-rejoin.spec.ts",
        "**/integration/wb-student-mic-persistence.spec.ts",
        "**/integration/wb-wave5-polish.spec.ts",
        "**/integration/wb-av-mesh.spec.ts",
        "**/integration/wb-session-lifecycle.spec.ts",
        "**/integration/wb-cancel-pending-session.spec.ts",
        "**/integration/wb-chrome-interactions.spec.ts",
        "**/integration/wb-phantom-stroke-regression.spec.ts",
        "**/integration/wb-live-persist-tab-kill.spec.ts",
        "**/integration/wb-resume-from-backend.spec.ts",
        "**/integration/wb-end-from-roster.spec.ts",
        "**/integration/wb-end-from-gate.spec.ts",
        "**/integration/wb-review-overlay-3paths.spec.ts",
        "**/integration/wb-vad-per-speaker-durability.spec.ts",
        "**/integration/wb-tab-kill-audio-durability.spec.ts",
        "**/integration/wb-tutor-recording-mute.spec.ts",
        "**/integration/wb-e2-pdf-stroke-leak.spec.ts",
        "**/integration/wb-e2-apply-remote-pdf-stroke-leak.spec.ts",
        "**/integration/wb-e3-blank-board-stroke-leak.spec.ts",
        "**/integration/wb-e4-pdf-board-stroke-leak.spec.ts",
        "**/integration/wb-e5-pdf-board-stroke-bleed-initial-board.spec.ts",
        "**/integration/wb-notes-shimmer.spec.ts",
        "**/integration/wb-finish-review-cta.spec.ts",
        "**/integration/wb-roughness-style.spec.ts",
        "**/integration/wb-replay-active-board-tab.spec.ts",
        "**/integration/wb-replay-scrub-seek.spec.ts",
        "**/integration/view-whiteboard-new-replay.spec.ts",
        "**/integration/wb-share-replay-viewport-phone.spec.ts",
        "**/integration/wb-board-tab-overflow.spec.ts",
        "**/integration/ux-sarah-wave1-bundle.spec.ts",
        "**/integration/recording-resilience.spec.ts",
        "**/integration/recording-end-to-end.spec.ts",
        "**/integration/wb-end-winddown.spec.ts",
        "**/audio-upload.spec.ts",
        "**/smoke/whiteboard-workspace.spec.ts",
      ],
    },
    {
      name: "wb-in-person-unmasked",
      dependencies: ["integration-setup"],
      retries: 1,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 900 },
        baseURL: "http://localhost:3101",
        storageState: "tests/integration/.auth/tutor.json",
        permissions: ["microphone"],
        launchOptions: {
          args: [
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
          ],
        },
      },
      testMatch: ["**/integration/wb-in-person-audio-start.spec.ts"],
    },
  ],
});
