import { expect } from "@playwright/test";
import { test } from "./fixtures";
import { seedTestAdmin, seedTestStudent, loginAsTestAdmin } from "./helpers";

/**
 * Visual regression + accessibility baselines.
 *
 * First run: `npm run test:visual:update` to capture baselines.
 * Subsequent runs: `npm run test:e2e` — fails if pixels drift beyond 1%.
 *
 * Each test:
 *   1. Navigates to the page
 *   2. Waits for network idle (no in-flight requests)
 *   3. Runs axe accessibility scan (fails on violations except color-contrast)
 *   4. Takes a screenshot and compares to baseline
 *
 * Desktop viewport only for baselines. Mobile smoke tests are in tests/smoke/.
 */

// Seed is shared across all tests in this file via beforeAll.
let studentId: string;
let shareToken: string;

test.beforeAll(async () => {
  const adminId = await seedTestAdmin();
  const seed = await seedTestStudent(adminId);
  studentId = seed.studentId;
  shareToken = seed.shareToken;
});

// ---------------------------------------------------------------------------
// Public / unauthenticated pages
// ---------------------------------------------------------------------------

test("login page — visual + a11y", async ({ guardedPage, checkPageA11y }) => {
  await guardedPage.goto("/login");
  await guardedPage.waitForLoadState("networkidle");
  await checkPageA11y();
  await expect(guardedPage).toHaveScreenshot("login.png");
});

test("signup page — visual + a11y", async ({ guardedPage, checkPageA11y }) => {
  await guardedPage.goto("/signup");
  await guardedPage.waitForLoadState("networkidle");
  await checkPageA11y();
  await expect(guardedPage).toHaveScreenshot("signup.png");
});

test("share page — visual + a11y", async ({ guardedPage, checkPageA11y }) => {
  await guardedPage.goto(`/s/${shareToken}`);
  await guardedPage.waitForLoadState("networkidle");
  await checkPageA11y();
  await expect(guardedPage).toHaveScreenshot("share-page.png");
});

test("feedback page — visual + a11y", async ({ guardedPage, checkPageA11y }) => {
  await guardedPage.goto("/feedback");
  await guardedPage.waitForLoadState("networkidle");
  await checkPageA11y();
  await expect(guardedPage).toHaveScreenshot("feedback.png");
});

// ---------------------------------------------------------------------------
// Authenticated admin pages
// ---------------------------------------------------------------------------

test("admin students list — visual + a11y", async ({ guardedPage, checkPageA11y }) => {
  await seedTestAdmin(); // idempotent
  await loginAsTestAdmin(guardedPage);
  await guardedPage.goto("/admin/students");
  await guardedPage.waitForLoadState("networkidle");
  await checkPageA11y();
  await expect(guardedPage).toHaveScreenshot("admin-students.png");
});

test("admin student detail — visual + a11y", async ({ guardedPage, checkPageA11y }) => {
  await loginAsTestAdmin(guardedPage);
  await guardedPage.goto(`/admin/students/${studentId}`);
  await guardedPage.waitForLoadState("networkidle");
  await checkPageA11y();
  await expect(guardedPage).toHaveScreenshot("admin-student-detail.png");
});
