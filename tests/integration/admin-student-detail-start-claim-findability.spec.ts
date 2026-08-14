/**
 * Admin student detail — Start / consent / claim findability (Priority #2).
 *
 * Run:
 *   npx playwright test tests/integration/admin-student-detail-start-claim-findability.spec.ts --project=integration
 */

import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TAG } from "../test-tags";
import { seedTestAdmin } from "../visual/helpers";

const VIEWPORT = { width: 1280, height: 800 };

async function linkStudentToFreshLearnerProfile(
  studentId: string,
  studentName: string
): Promise<string> {
  const prisma = new PrismaClient();
  try {
    const suffix = studentId.replace(/-/g, "").slice(0, 12);
    const accountHolder = await prisma.accountHolder.create({
      data: {
        email: `pw-parent-${suffix}@test.local`,
        displayName: "Test Parent",
        familyId: `pwfam${suffix}`,
        emailVerifiedAt: new Date("2026-01-01"),
      },
      select: { id: true },
    });
    const profile = await prisma.learnerProfile.create({
      data: {
        accountHolderId: accountHolder.id,
        displayName: studentName,
        accessMode: "child_pin_required",
      },
      select: { id: true },
    });
    await prisma.student.update({
      where: { id: studentId },
      data: { learnerProfileId: profile.id },
    });
    return profile.id;
  } finally {
    await prisma.$disconnect();
  }
}

async function seedUnclaimedStudent(adminUserId: string): Promise<string> {
  const prisma = new PrismaClient();
  try {
    const student = await prisma.student.create({
      data: {
        name: "Unclaimed Findability Student",
        adminUserId,
        parentEmail: "unclaimed-findability@test.local",
      },
      select: { id: true },
    });
    return student.id;
  } finally {
    await prisma.$disconnect();
  }
}

async function seedClaimedWithoutConsent(adminUserId: string): Promise<string> {
  const prisma = new PrismaClient();
  try {
    const student = await prisma.student.create({
      data: {
        name: "Claimed No Consent Student",
        adminUserId,
        parentEmail: "claimed-no-consent@test.local",
      },
      select: { id: true, name: true },
    });
    await linkStudentToFreshLearnerProfile(student.id, student.name);
    return student.id;
  } finally {
    await prisma.$disconnect();
  }
}

async function seedEligibleStudent(adminUserId: string): Promise<string> {
  const prisma = new PrismaClient();
  try {
    const student = await prisma.student.create({
      data: {
        name: "Eligible Start Student",
        adminUserId,
        parentEmail: "eligible-start@test.local",
      },
      select: { id: true, name: true },
    });
    const learnerProfileId = await linkStudentToFreshLearnerProfile(
      student.id,
      student.name
    );

    const accountHolder = await prisma.learnerProfile.findUnique({
      where: { id: learnerProfileId },
      select: { accountHolderId: true },
    });
    if (!accountHolder) {
      throw new Error(`LearnerProfile not found: ${learnerProfileId}`);
    }

    await prisma.consentRecord.create({
      data: {
        learnerProfileId,
        adminUserId,
        version: 1,
        allowLiveSession: true,
        allowAudioRecording: true,
        allowWhiteboardRecording: true,
        allowNoteSending: true,
        setByAccountHolderId: accountHolder.accountHolderId,
        captureMethod: "electronic",
      },
    });

    return student.id;
  } finally {
    await prisma.$disconnect();
  }
}

test.describe("Admin student detail — Start / claim findability", () => {
  test.use({ viewport: VIEWPORT });

  test(
    "unclaimed student shows top claim banner and blocked Start callout without Start button",
    { tag: [TAG.WB_CHROME] },
    async ({ page }) => {
      const adminUserId = await seedTestAdmin();
      const studentId = await seedUnclaimedStudent(adminUserId);

      await page.goto(`/admin/students/${studentId}`, {
        waitUntil: "networkidle",
      });

      await expect(
        page.getByRole("heading", { name: "Unclaimed Findability Student" })
      ).toBeVisible({ timeout: 15_000 });

      const claimBanner = page.getByTestId("unclaimed-parent-claim-banner");
      await expect(claimBanner).toBeVisible();
      await expect(claimBanner.getByTestId("create-claim-link-btn")).toBeVisible();

      const banner = page.getByTestId("student-ready-to-teach-banner");
      const callout = banner.getByTestId("start-wb-consent-callout");
      await expect(callout).toBeVisible();
      await expect(callout).toHaveAttribute("role", "alert");
      await expect(callout).toContainText(/Start whiteboard session unavailable/i);
      await expect(callout).toContainText(/parent must claim/i);

      await expect(page.getByTestId("start-whiteboard-session-btn")).toHaveCount(0);
      await expect(page.getByTestId("student-ready-to-teach-copy")).toContainText(
        /Before you can start/i
      );
    }
  );

  test(
    "claimed without consent shows privacy-preferences blocked callout and no Start button",
    { tag: [TAG.WB_CHROME] },
    async ({ page }) => {
      const adminUserId = await seedTestAdmin();
      const studentId = await seedClaimedWithoutConsent(adminUserId);

      await page.goto(`/admin/students/${studentId}`, {
        waitUntil: "networkidle",
      });

      await expect(
        page.getByRole("heading", { name: "Claimed No Consent Student" })
      ).toBeVisible({ timeout: 15_000 });

      await expect(page.getByTestId("unclaimed-parent-claim-banner")).toHaveCount(0);

      const banner = page.getByTestId("student-ready-to-teach-banner");
      const callout = banner.getByTestId("start-wb-consent-callout");
      await expect(callout).toBeVisible();
      await expect(callout).toContainText(/privacy preferences are not complete/i);
      await expect(callout).toContainText(/privacy preferences for this learner/i);

      await expect(banner.getByTestId("start-whiteboard-session-btn")).toHaveCount(0);
    }
  );

  test(
    "eligible claimed student shows Start whiteboard session button",
    { tag: [TAG.WB_CHROME] },
    async ({ page }) => {
      const adminUserId = await seedTestAdmin();
      const studentId = await seedEligibleStudent(adminUserId);

      await page.goto(`/admin/students/${studentId}`, {
        waitUntil: "networkidle",
      });

      await expect(
        page.getByRole("heading", { name: "Eligible Start Student" })
      ).toBeVisible({ timeout: 15_000 });

      await expect(page.getByTestId("unclaimed-parent-claim-banner")).toHaveCount(0);
      await expect(
        page.getByTestId("student-ready-to-teach-banner").getByTestId("start-wb-consent-callout")
      ).toHaveCount(0);

      const banner = page.getByTestId("student-ready-to-teach-banner");
      const startBtn = banner.getByTestId("start-whiteboard-session-btn");
      await expect(startBtn).toBeVisible();
      await expect(startBtn).toHaveText(/Start whiteboard session/i);

      await expect(page.getByTestId("student-ready-to-teach-copy")).toContainText(
        /Ready to teach/i
      );
    }
  );
});
