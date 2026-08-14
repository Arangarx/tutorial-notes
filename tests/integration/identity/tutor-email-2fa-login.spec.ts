import { expect, test } from "@playwright/test";

import {
  TEST_EMAIL_2FA_ENROLL,
  TEST_EMAIL_2FA_TUTOR,
  seedEmailOtpEnrollChallenge,
  seedEmailOtpEnrolledTutor,
  submitEmailOtpOnSetupPage,
  submitEmailOtpOnVerifyPage,
} from "./tutor-email-2fa-login.helpers";
import {
  expectTutorAuthedLanding,
  loginTutorWithPassword,
  seedUnenrolled2faTutor,
  waitFor2faVerifyChallenge,
} from "./tutor-2fa-login.helpers";

const EMPTY_STATE = { cookies: [] as [], origins: [] as [] };
const WRONG_CODE = "000000";

test.describe("Email OTP 2FA — enroll + login (chunk 1)", () => {
  test.use({ storageState: EMPTY_STATE });

  test("happy path: email-enrolled tutor login verify lands authed", async ({ page }) => {
    const { loginCode } = await seedEmailOtpEnrolledTutor();

    await loginTutorWithPassword(page, TEST_EMAIL_2FA_TUTOR);
    await waitFor2faVerifyChallenge(page);

    // Seeded challenge — no mail catcher; skip send to avoid invalidating hash.
    await submitEmailOtpOnVerifyPage(page, loginCode);
    await expectTutorAuthedLanding(page);
  });

  test("security teeth: wrong email OTP stays on challenge", async ({ page }) => {
    await seedEmailOtpEnrolledTutor();

    await loginTutorWithPassword(page, TEST_EMAIL_2FA_TUTOR);
    await waitFor2faVerifyChallenge(page);

    await submitEmailOtpOnVerifyPage(page, WRONG_CODE);

    await expect(page).toHaveURL(/\/admin\/settings\/2fa\/verify/);
    await expect(page.getByText(/invalid or expired code/i)).toBeVisible({ timeout: 15_000 });
  });

  test("enroll default: unenrolled tutor sees email setup first", async ({ page }) => {
    await seedUnenrolled2faTutor();

    await loginTutorWithPassword(page, {
      email: "playwright-tfa-enroll@test.local",
      password: "TwofaEnrollPw!789",
    });

    await page.waitForURL(/\/admin\/settings\/2fa\/setup/, { timeout: 30_000 });
    await expect(page.getByText(/by default we email/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Use authenticator app instead" })).toBeVisible();
  });

  test("enroll confirm: seeded email OTP completes setup and reaches students", async ({
    page,
  }) => {
    const { enrollCode } = await seedEmailOtpEnrollChallenge();

    await loginTutorWithPassword(page, TEST_EMAIL_2FA_ENROLL);
    await page.waitForURL(/\/admin\/settings\/2fa\/setup/, { timeout: 30_000 });

    await submitEmailOtpOnSetupPage(page, enrollCode);

    await expectTutorAuthedLanding(page);
    await page.goto("/admin/students");
    await expect(page).toHaveURL(/\/admin\/students/);
  });

  test("TOTP opt-in still works from setup page", async ({ page }) => {
    await seedUnenrolled2faTutor();

    await loginTutorWithPassword(page, {
      email: "playwright-tfa-enroll@test.local",
      password: "TwofaEnrollPw!789",
    });
    await page.waitForURL(/\/admin\/settings\/2fa\/setup/, { timeout: 30_000 });

    await page.getByRole("button", { name: "Use authenticator app instead" }).click();
    const qrImg = page.getByRole("img", { name: "TOTP QR code" });
    await expect(qrImg).toBeVisible({ timeout: 30_000 });
    await expect(qrImg).toHaveAttribute("src", /^data:image\/png;base64,/);
  });
});
