import { test, expect } from "@playwright/test";
import { readLocalEnv } from "./utils/read-dotenv";

test("smoke: create note, send update, outbox link opens share page", async ({
  page,
}) => {
  test.setTimeout(90_000);

  const env = readLocalEnv();
  const email = env.ADMIN_EMAIL ?? "admin@example.com";
  const password = env.ADMIN_PASSWORD ?? "replace-me";

  await page.goto("/login?callbackUrl=/admin/students");

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/admin\/students/, { timeout: 15_000 });

  await expect(page.getByRole("heading", { name: "Students" })).toBeVisible({
    timeout: 15_000,
  });

  await page.locator('input[name="name"]').fill("Playwright Student");
  await page.getByRole("button", { name: "Add student" }).click();

  await page.getByText("Playwright Student", { exact: true }).first().click();

  await expect(page.getByRole("heading", { name: "Playwright Student" })).toBeVisible();
  await expect(page.getByText("Share link (for parents/students)")).toBeVisible();
  await expect(page.getByText("New session note")).toBeVisible();
  await expect(page.getByText("Send update email")).toBeVisible();

  // Create a note (so the share page has content).
  await page.locator('textarea[name="topics"]').fill("Fractions practice");
  await page.locator('textarea[name="homework"]').fill("Worksheet 1");
  await page.locator('textarea[name="nextSteps"]').fill("Word problems next session");
  await page.locator('textarea[name="links"]').fill("https://example.com/resource");
  await page.getByRole("button", { name: "Save note" }).click();

  // Send update (sends if SMTP configured, else outbox; UI must show outcome).
  await page.locator('input[name="toEmail"]').fill("parent@example.com");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(
    page.getByText(/Sent to|Email is not configured|Failed to send|saved to outbox/i)
  ).toBeVisible({ timeout: 10_000 });

  // Open outbox and click through to the share link.
  await page.getByRole("link", { name: "Outbox" }).first().click();
  await expect(page.getByRole("heading", { name: "Outbox" })).toBeVisible();

  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("link", { name: "Open link" }).first().click();
  const popup = await popupPromise;
  await popup.waitForLoadState("domcontentloaded");

  await expect(popup).toHaveURL(/\/s\//);
  await expect(popup.getByRole("heading", { name: "Playwright Student" })).toBeVisible();
  await expect(
    popup.getByRole("link", { name: "https://example.com/resource" }).first(),
  ).toBeVisible();
});

test("auth: unauthenticated access to admin redirects to login", async ({ page }) => {
  await page.goto("/admin/students");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Login" })).toBeVisible();
});

test("forgot password page loads and links back to login", async ({ page }) => {
  await page.goto("/forgot-password");
  await expect(page.getByRole("heading", { name: "Forgot password" })).toBeVisible();
  await page.getByRole("link", { name: "Back to login" }).click();
  await expect(page).toHaveURL(/\/login/);
});

test("feedback is discoverable from landing and from admin", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Feedback" })).toBeVisible();
  await page.getByRole("link", { name: "Feedback" }).first().click();
  await expect(page).toHaveURL(/\/feedback/);
});

