import { test as base, expect, type Page } from "@playwright/test";
import { injectAxe, checkA11y } from "axe-playwright";

/**
 * Console-error guard.
 *
 * Subscribes to every console.error and uncaught page exception during the
 * test. Fails the test on teardown if any are observed. This is the net for:
 *   - React #418 hydration mismatches
 *   - CSP violations (the "Media Load rejected by URL safety check" class)
 *   - Unhandled promise rejections
 *   - Any other runtime error that would silently degrade the user experience
 *
 * Known-noise patterns can be added to the ALLOWED_PATTERNS allowlist below.
 * Only add to the allowlist when you are CERTAIN the message is from a
 * third-party dep and not something we can fix ourselves.
 */

const ALLOWED_PATTERNS: RegExp[] = [
  // Next.js fast-refresh noise in dev mode — not user-facing
  /Fast refresh/i,
  // next-auth internal session poll warning on first render
  /\[next-auth\].*CLIENT_FETCH_ERROR/i,
];

function isAllowed(message: string): boolean {
  return ALLOWED_PATTERNS.some((p) => p.test(message));
}

type ConsoleGuardFixtures = {
  /** The standard Playwright page, wrapped with the console-error guard. */
  guardedPage: Page;
  /** Runs axe accessibility check on current page. Fail on any violations. */
  checkPageA11y: () => Promise<void>;
};

export const test = base.extend<ConsoleGuardFixtures>({
  guardedPage: async ({ page }, use) => {
    const errors: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text();
        if (!isAllowed(text)) {
          errors.push(`console.error: ${text}`);
        }
      }
    });

    page.on("pageerror", (err) => {
      if (!isAllowed(err.message)) {
        errors.push(`pageerror: ${err.message}`);
      }
    });

    await use(page);

    // Fail the test after the page has been used, so the test body can run
    // fully and we see the real assertion failure + any console output.
    if (errors.length > 0) {
      throw new Error(
        `Console errors detected during test — fix these before shipping:\n` +
          errors.map((e) => `  • ${e}`).join("\n")
      );
    }
  },

  checkPageA11y: async ({ guardedPage }, use) => {
    await use(async () => {
      await injectAxe(guardedPage);
      await checkA11y(guardedPage, undefined, {
        detailedReport: true,
        detailedReportOptions: { html: true },
        // Ignore colour-contrast violations for now — dark theme values need
        // a proper design audit. All other rules are hard failures.
        axeOptions: {
          rules: {
            "color-contrast": { enabled: false },
          },
        },
      });
    });
  },
});

export { expect };
