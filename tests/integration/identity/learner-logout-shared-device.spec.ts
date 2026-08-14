/**
 * SMOKE-PRIV-1 — learner sign-out must not leave parent AH session on shared device.
 *
 * Flow: parent AH login → child PIN login → child sign-out → /account/dashboard
 * must redirect to /account/login (not parent dashboard).
 */

import { expect, test } from "@playwright/test";

import { TEST_PARENT } from "./identity.helpers";
import { seedParentOwnedPinLockoutLearner } from "./learner-pin-lockout.helpers";
import {
  loginAccountHolderInContext,
  loginLearnerInContext,
} from "../whiteboard-live-sync.helpers";

const EMPTY_STATE = { cookies: [] as [], origins: [] as [] };

test.describe("SMOKE-PRIV-1 — learner logout clears parent session on shared device", () => {
  test.use({ storageState: EMPTY_STATE });

  test("parent AH + child PIN → child sign-out → /account/dashboard → /account/login", async ({
    browser,
  }) => {
    test.setTimeout(60_000);

    const child = await seedParentOwnedPinLockoutLearner();

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });

    try {
      await loginAccountHolderInContext(
        context,
        TEST_PARENT.email,
        TEST_PARENT.password
      );
      await loginLearnerInContext(context, child.handle, child.pin);

      const logoutResp = await context.request.post("/api/auth/learner/logout");
      expect(logoutResp.ok()).toBe(true);

      const page = await context.newPage();
      await page.goto("/account/dashboard", { waitUntil: "domcontentloaded" });

      await page.waitForURL(
        (url) => url.pathname === "/account/login",
        { timeout: 30_000 }
      );
      expect(new URL(page.url()).pathname).toBe("/account/login");
      expect(new URL(page.url()).pathname).not.toBe("/account/dashboard");
    } finally {
      await context.close();
    }
  });
});
