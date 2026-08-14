import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

import { loginTutorWithPassword } from "./tutor-2fa-login.helpers";

const EMPTY_STATE = { cookies: [] as [], origins: [] as [] };

const { assertLocalDatabaseUrlForHarness } = require("../../../scripts/wb-regression-local-db.cjs");

function uniqueSignupEmail(): string {
  return `pw-signup-waitlisted-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
}

async function seedWaitlistedTutor(email: string, password: string): Promise<void> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  const passwordHash = await bcrypt.hash(password, 10);
  try {
    await prisma.adminUser.upsert({
      where: { email },
      create: {
        email,
        passwordHash,
        displayName: "PW Waitlisted Tutor",
        role: "TUTOR",
        approvalStatus: "WAITLISTED",
        isTestAccount: false,
      },
      update: {
        passwordHash,
        approvalStatus: "WAITLISTED",
        isTestAccount: false,
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function seedRejectedTutor(email: string, password: string): Promise<void> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  const passwordHash = await bcrypt.hash(password, 10);
  try {
    await prisma.adminUser.upsert({
      where: { email },
      create: {
        email,
        passwordHash,
        displayName: "PW Rejected Tutor",
        role: "TUTOR",
        approvalStatus: "REJECTED",
        isTestAccount: false,
      },
      update: {
        passwordHash,
        approvalStatus: "REJECTED",
        isTestAccount: false,
        approvedAt: null,
        approvedByAdminId: null,
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

test.describe("P1-ID-SIGNUP — tutor signup WAITLISTED gate", () => {
  test.use({ storageState: EMPTY_STATE });

  test("/signup shows Google + Mortensen sign-up notice when OAuth configured", async ({
    page,
  }) => {
    await page.goto("/signup");
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByText(/Sign-up is securely handled by Mortensen Apps/i)
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Sign up with Google" })
    ).toBeVisible();
  });

  test("credentials signup → login → lands on pending-approval", async ({
    page,
  }) => {
    const email = uniqueSignupEmail();
    const password = "SignupWaitlist!99";

    await page.goto("/signup");
    await page.locator("#signup-email").waitFor({ state: "visible", timeout: 30_000 });
    await page.locator("#signup-email").fill(email);
    await page.locator("#signup-password").fill(password);
    await page.locator("#signup-password-confirm").fill(password);
    await page.getByRole("button", { name: /create account/i }).click();

    await page.waitForURL(/\/login\?registered=1/, { timeout: 30_000 });
    await expect(
      page.getByText(/account created/i)
    ).toBeVisible();

    await loginTutorWithPassword(page, { email, password });

    await page.waitForURL(/\/admin\/pending-approval/, { timeout: 30_000 });
    await expect(page.getByText("Account pending approval")).toBeVisible();
    await expect(
      page.getByText(/pending operator approval/i)
    ).toBeVisible();
  });

  test("WAITLISTED tutor cannot open /admin/students (redirect pending-approval)", async ({
    page,
  }) => {
    const email = uniqueSignupEmail();
    const password = "WaitlistGate!99";
    await seedWaitlistedTutor(email, password);

    await loginTutorWithPassword(page, { email, password });
    await page.waitForURL(/\/admin\/pending-approval/, { timeout: 30_000 });

    await page.goto("/admin/students");
    await page.waitForURL(/\/admin\/pending-approval/, { timeout: 30_000 });
    await expect(page.getByText("Account pending approval")).toBeVisible();
  });

  test("REJECTED tutor login shows Account not approved copy", async ({
    page,
  }) => {
    const email = uniqueSignupEmail();
    const password = "RejectedGate!99";
    await seedRejectedTutor(email, password);

    await loginTutorWithPassword(page, { email, password });
    await page.waitForURL(/\/admin\/pending-approval/, { timeout: 30_000 });
    await expect(page.getByText("Account not approved")).toBeVisible();
  });

  // PLAYWRIGHT-GAP: Full Google OAuth round-trip cannot run hermetically — no mock
  // Google IdP in the harness. Signup-intent + signIn callback provisioning is
  // covered by src/__tests__/google-signup-waitlisted.test.ts (unit). UI link
  // target is asserted above; OAuth redirect is covered by tutor-google-login.spec.ts.
});
