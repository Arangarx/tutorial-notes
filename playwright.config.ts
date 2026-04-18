import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config — visual regression, a11y, and smoke tests.
 *
 * Two viewport projects:
 *   desktop  — 1280x800  Chromium (tutor's computer)
 *   mobile   — 390x844   Chromium iPhone-13 emulation (Sarah's iPhone)
 *
 * Tests live in tests/visual/ (snapshot + a11y) and tests/smoke/ (flow tests).
 * Run with: npm run test:e2e
 * Update baselines with: npm run test:visual:update
 */
export default defineConfig({
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

  webServer: {
    command: "cmd /c \"set DATABASE_URL=file:./pw.db&& set NEXTAUTH_URL=http://localhost:3100&& npx prisma db push --skip-generate&& npm run dev -- --port 3100\"",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },

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
  ],
});
