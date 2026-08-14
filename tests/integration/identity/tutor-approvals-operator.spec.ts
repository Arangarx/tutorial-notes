import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

import { loginTutorWithPassword } from "./tutor-2fa-login.helpers";

const OPERATOR_STATE = "tests/integration/.auth/tutor.json";

const { assertLocalDatabaseUrlForHarness } = require("../../../scripts/wb-regression-local-db.cjs");

function uniqueEmail(prefix: string): string {
  return `pw-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
}

async function seedTutorFixture(input: {
  email: string;
  password: string;
  approvalStatus: "WAITLISTED" | "APPROVED";
  displayName: string;
}): Promise<string> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  const passwordHash = await bcrypt.hash(input.password, 10);
  try {
    const user = await prisma.adminUser.upsert({
      where: { email: input.email },
      create: {
        email: input.email,
        passwordHash,
        displayName: input.displayName,
        role: "TUTOR",
        approvalStatus: input.approvalStatus,
        isTestAccount: false,
      },
      update: {
        passwordHash,
        approvalStatus: input.approvalStatus,
        isTestAccount: false,
        approvedAt: input.approvalStatus === "APPROVED" ? new Date() : null,
        approvedByAdminId: null,
      },
      select: { id: true },
    });
    return user.id;
  } finally {
    await prisma.$disconnect();
  }
}

async function openTutorApprovals(page: import("@playwright/test").Page): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.goto("/admin/tutor-approvals", { waitUntil: "domcontentloaded" });
    } catch {
      if (attempt === 2) throw new Error("Failed to open /admin/tutor-approvals after 3 attempts");
      await page.waitForTimeout(1_000);
      continue;
    }

    try {
      await expect(page.getByRole("heading", { name: "Tutor approvals" })).toBeVisible({
        timeout: 10_000,
      });
      return;
    } catch (error) {
      if (attempt === 2) throw error;
      await page.waitForTimeout(1_000);
    }
  }
}

test.describe("P1-ID-TAP — operator tutor approvals reject + revoke", () => {
  test.use({ storageState: OPERATOR_STATE });
  test.describe.configure({ mode: "serial" });

  test("operator rejects WAITLISTED tutor from /admin/tutor-approvals", async ({
    page,
  }) => {
    const email = uniqueEmail("reject-waitlisted");
    const password = "RejectWaitlist!99";
    const adminUserId = await seedTutorFixture({
      email,
      password,
      approvalStatus: "WAITLISTED",
      displayName: "PW Reject Candidate",
    });

    await openTutorApprovals(page);

    const pendingSection = page.getByTestId("tutor-approvals-pending");
    const row = pendingSection.getByTestId(`tutor-approval-row-${adminUserId}`);
    await expect(row).toBeVisible();
    await expect(row.getByText(email)).toBeVisible();

    await row.getByTestId("tutor-reject-button").click();
    const rejectDialog = page.getByRole("alertdialog");
    await expect(rejectDialog).toBeVisible({ timeout: 15_000 });
    await rejectDialog.getByTestId("tutor-reject-confirm").click();

    await expect(row).not.toBeVisible({ timeout: 15_000 });

    const prisma = new PrismaClient();
    try {
      const rowDb = await prisma.adminUser.findUnique({
        where: { id: adminUserId },
        select: { approvalStatus: true },
      });
      expect(rowDb?.approvalStatus).toBe("REJECTED");
    } finally {
      await prisma.$disconnect();
    }
  });

  test("operator revokes APPROVED tutor and tutor fails approval gate", async ({
    page,
  }) => {
    await page.keyboard.press("Escape");
    const email = uniqueEmail("revoke-approved");
    const password = "RevokeApproved!99";
    const adminUserId = await seedTutorFixture({
      email,
      password,
      approvalStatus: "APPROVED",
      displayName: "PW Revoke Candidate",
    });

    await openTutorApprovals(page);

    const approvedSection = page.getByTestId("tutor-approvals-approved");
    const pendingSection = page.getByTestId("tutor-approvals-pending");
    const approvedRow = approvedSection.getByTestId(`tutor-approval-row-${adminUserId}`);

    await expect(approvedRow).toBeVisible();
    const revokeButton = approvedRow.getByTestId("tutor-revoke-button");
    await revokeButton.scrollIntoViewIfNeeded();
    await revokeButton.click();
    const revokeDialog = page.getByRole("alertdialog");
    await expect(revokeDialog).toBeVisible({ timeout: 15_000 });
    await revokeDialog.getByTestId("tutor-revoke-confirm").click();

    await expect(approvedRow).not.toBeVisible({ timeout: 15_000 });
    await expect(
      pendingSection.getByTestId(`tutor-approval-row-${adminUserId}`).getByTestId(
        "tutor-approve-button"
      )
    ).toBeVisible({ timeout: 15_000 });

    const prisma = new PrismaClient();
    try {
      const rowDb = await prisma.adminUser.findUnique({
        where: { id: adminUserId },
        select: { approvalStatus: true },
      });
      expect(rowDb?.approvalStatus).toBe("WAITLISTED");
    } finally {
      await prisma.$disconnect();
    }

    await page.context().clearCookies();
    await loginTutorWithPassword(page, { email, password });
    await page.waitForURL(/\/admin\/pending-approval/, { timeout: 30_000 });
    await expect(page.getByText("Account pending approval")).toBeVisible();
  });
});
