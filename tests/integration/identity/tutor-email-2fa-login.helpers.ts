import { type Page, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import * as OTPAuth from "otpauth";

import { hashEmailOtpCode } from "@/lib/email-otp-challenge";
import { readLocalEnv } from "../../utils/read-dotenv";
import {
  attachNetworkCapture,
  expectTutorAuthedLanding,
  generateTotpCode,
  loginTutorWithPassword,
  seedUnenrolled2faTutor,
  submitTotpOnVerifyPage,
  waitFor2faVerifyChallenge,
} from "./tutor-2fa-login.helpers";

const { assertLocalDatabaseUrlForHarness } = require("../../../scripts/wb-regression-local-db.cjs");

export const TEST_EMAIL_2FA_TUTOR = {
  email: "playwright-email-2fa@test.local",
  password: "Email2faTutorPw!789",
  displayName: "Playwright Email 2FA Tutor",
} as const;

export const TEST_EMAIL_2FA_ENROLL = {
  email: "playwright-email-2fa-enroll@test.local",
  password: "Email2faEnrollPw!789",
  displayName: "Playwright Email 2FA Enroll",
} as const;

const KNOWN_OTP = "847291";

export async function seedEmailOtpEnrolledTutor(): Promise<{
  adminUserId: string;
  loginCode: string;
}> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  const passwordHash = await bcrypt.hash(TEST_EMAIL_2FA_TUTOR.password, 10);

  try {
    const user = await prisma.adminUser.upsert({
      where: { email: TEST_EMAIL_2FA_TUTOR.email },
      create: {
        email: TEST_EMAIL_2FA_TUTOR.email,
        passwordHash,
        displayName: TEST_EMAIL_2FA_TUTOR.displayName,
        role: "TUTOR",
        approvalStatus: "APPROVED",
        isTestAccount: false,
      },
      update: {
        passwordHash,
        role: "TUTOR",
        approvalStatus: "APPROVED",
        isTestAccount: false,
      },
      select: { id: true },
    });

    await prisma.adminUser2FAEmailChallenge.deleteMany({ where: { adminUserId: user.id } });
    await prisma.adminUser2FA.deleteMany({ where: { adminUserId: user.id } });

    const twoFa = await prisma.adminUser2FA.create({
      data: {
        adminUserId: user.id,
        method: "EMAIL_OTP",
        totpSecretEnc: null,
        enrolledAt: new Date(),
      },
      select: { id: true },
    });

    await prisma.adminUser2FAEmailChallenge.create({
      data: {
        adminUserId: user.id,
        twoFaId: twoFa.id,
        codeHash: hashEmailOtpCode(KNOWN_OTP),
        purpose: "LOGIN",
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    return { adminUserId: user.id, loginCode: KNOWN_OTP };
  } finally {
    await prisma.$disconnect();
  }
}

export async function seedEmailOtpEnrollChallenge(): Promise<{
  adminUserId: string;
  enrollCode: string;
}> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  const passwordHash = await bcrypt.hash(TEST_EMAIL_2FA_ENROLL.password, 10);
  const enrollCode = "592014";

  try {
    const user = await prisma.adminUser.upsert({
      where: { email: TEST_EMAIL_2FA_ENROLL.email },
      create: {
        email: TEST_EMAIL_2FA_ENROLL.email,
        passwordHash,
        displayName: TEST_EMAIL_2FA_ENROLL.displayName,
        role: "TUTOR",
        approvalStatus: "APPROVED",
        isTestAccount: false,
      },
      update: {
        passwordHash,
        role: "TUTOR",
        approvalStatus: "APPROVED",
        isTestAccount: false,
      },
      select: { id: true },
    });

    await prisma.adminUser2FAEmailChallenge.deleteMany({ where: { adminUserId: user.id } });
    await prisma.adminUser2FA.deleteMany({ where: { adminUserId: user.id } });

    const twoFa = await prisma.adminUser2FA.create({
      data: {
        adminUserId: user.id,
        method: "EMAIL_OTP",
        totpSecretEnc: null,
        enrolledAt: null,
      },
      select: { id: true },
    });

    await prisma.adminUser2FAEmailChallenge.create({
      data: {
        adminUserId: user.id,
        twoFaId: twoFa.id,
        codeHash: hashEmailOtpCode(enrollCode),
        purpose: "ENROLL",
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    return { adminUserId: user.id, enrollCode };
  } finally {
    await prisma.$disconnect();
  }
}

export async function submitEmailOtpOnVerifyPage(page: Page, code: string): Promise<void> {
  const input = page.getByPlaceholder("000000");
  await input.fill(code);
  await page.getByRole("button", { name: "Verify" }).click();
}

export async function submitEmailOtpOnSetupPage(page: Page, code: string): Promise<void> {
  const input = page.getByPlaceholder("000000");
  await input.fill(code);
  await page.getByRole("button", { name: "Confirm" }).click();
}

export { attachNetworkCapture, generateTotpCode, submitTotpOnVerifyPage };
