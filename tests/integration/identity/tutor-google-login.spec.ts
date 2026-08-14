import { expect, test } from "@playwright/test";

const EMPTY_STATE = { cookies: [] as [], origins: [] as [] };

test.describe("P1-ID-GOOGLE — tutor login Google sign-in UI", () => {
  test.use({ storageState: EMPTY_STATE });

  test("shows Mortensen notice + Sign in with Google when provider configured", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByText(/Sign-in is securely handled by Mortensen Apps/i)
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Sign in with Google" })
    ).toBeVisible();
  });

  test("Sign in with Google navigates to NextAuth Google provider", async ({
    page,
  }) => {
    await page.route("**/accounts.google.com/**", (route) => route.abort());

    await page.goto("/login?callbackUrl=%2Fadmin%2Fstudents");
    await page.waitForLoadState("networkidle");

    const googleLink = page.getByRole("link", { name: "Sign in with Google" });
    await expect(googleLink).toBeVisible();

    const href = await googleLink.getAttribute("href");
    expect(href).toContain("/api/auth/signin/google");
    expect(decodeURIComponent(href ?? "")).toContain("/admin/students");

    const signInRequest = page.waitForRequest((req) =>
      req.url().includes("/api/auth/signin/google")
    );
    await googleLink.click();
    const request = await signInRequest;
    expect(request.url()).toContain("/api/auth/signin/google");
  });

  test("existing ?error= banners still render", async ({ page }) => {
    await page.goto("/login?error=not_authorized");
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByText(/doesn't have access to Mynk/i)
    ).toBeVisible();
  });
});
