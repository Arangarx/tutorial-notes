import { expect, test } from "@playwright/test";

import {
  attachNetworkCapture,
  generateTotpCode,
  loginTutorWithPassword,
  seedEnrolled2faTutor,
  seedUnenrolled2faTutor,
  submitTotpOnVerifyPage,
  TEST_2FA_ENROLL,
  TEST_2FA_TUTOR,
  waitFor2faVerifyChallenge,
  expectTutorAuthedLanding,
} from "./tutor-2fa-login.helpers";

const EMPTY_STATE = { cookies: [] as [], origins: [] as [] };
const INVALID_TOTP = "000000";

test.describe("P1-ID-2 — tutor 2FA login→land + QR local-gen", () => {
  test.use({ storageState: EMPTY_STATE });

  test("happy path: password login → TOTP challenge → valid code lands authed", async ({
    page,
  }) => {
    const { totpSecret } = await seedEnrolled2faTutor();

    await loginTutorWithPassword(page, TEST_2FA_TUTOR);
    await waitFor2faVerifyChallenge(page);

    const code = generateTotpCode(totpSecret);
    await submitTotpOnVerifyPage(page, code);
    await expectTutorAuthedLanding(page);
  });

  test("security teeth: invalid TOTP is denied (stays on challenge)", async ({
    page,
  }) => {
    await seedEnrolled2faTutor();

    await loginTutorWithPassword(page, TEST_2FA_TUTOR);
    await waitFor2faVerifyChallenge(page);

    await submitTotpOnVerifyPage(page, INVALID_TOTP);

    await expect(page).toHaveURL(/\/admin\/settings\/2fa\/verify/);
    await expect(
      page.getByText(/invalid code/i)
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("heading", { name: "Two-Factor Verification" })
    ).toBeVisible();
  });

  test("security teeth: enrollment QR is local data-URI — no secret egress to third parties", async ({
    page,
  }) => {
    await seedUnenrolled2faTutor();
    const pageOrigin = "http://localhost:3100";
    const capture = attachNetworkCapture(page);
    capture.start();

    await loginTutorWithPassword(page, TEST_2FA_ENROLL);
    await page.waitForURL(
      (url) => url.pathname.startsWith("/admin/settings/2fa/setup"),
      { timeout: 30_000 }
    );

    await page.getByRole("button", { name: "Use authenticator app instead" }).click();

    const qrImg = page.getByRole("img", { name: "TOTP QR code" });
    await expect(qrImg).toBeVisible({ timeout: 30_000 });

    const qrSrc = await qrImg.getAttribute("src");
    expect(qrSrc, "QR must be a local data-URI, not an external URL").toMatch(
      /^data:image\/png;base64,/
    );

    await page.getByText("Can't scan? Enter the key manually").click();
    const secretEl = page.locator("code").filter({ hasText: /^[A-Z2-7]+$/ });
    await expect(secretEl).toBeVisible();
    const secret = (await secretEl.textContent())?.trim() ?? "";
    expect(secret.length).toBeGreaterThanOrEqual(16);

    capture.assertNoSecretEgress(secret, pageOrigin);

    for (const req of capture.requests) {
      if (req.url.startsWith("data:") || req.url.startsWith("blob:")) continue;
      let host = "";
      try {
        host = new URL(req.url).hostname;
      } catch {
        continue;
      }
      if (host && !req.url.startsWith(pageOrigin)) {
        expect(
          req.url.includes(secret),
          `non-self request must not carry secret: ${req.url}`
        ).toBe(false);
      }
    }
  });
});
