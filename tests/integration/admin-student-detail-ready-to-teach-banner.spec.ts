/**
 * Admin student detail — Ready to teach banner layout at mid vs wide viewports.
 *
 * Mid-width (sidebar + in-banner CTA, below lg): banner stacks so copy is not
 * crushed and the consent callout stays within banner bounds.
 * Wide (lg+): copy and CTA sit side-by-side.
 *
 * Run:
 *   npx playwright test tests/integration/admin-student-detail-ready-to-teach-banner.spec.ts --project=integration
 */

import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TAG } from "../test-tags";
import { seedTestAdmin } from "../visual/helpers";

const MID_VIEWPORT = { width: 900, height: 800 };
const WIDE_VIEWPORT = { width: 1280, height: 800 };
const GEOMETRY_TOLERANCE_PX = 4;

async function seedUnclaimedStudent(adminUserId: string): Promise<string> {
  const prisma = new PrismaClient();
  try {
    const student = await prisma.student.create({
      data: {
        name: "Unclaimed Banner Student",
        adminUserId,
        parentEmail: "unclaimed-banner@test.local",
      },
      select: { id: true },
    });
    return student.id;
  } finally {
    await prisma.$disconnect();
  }
}

test.describe("Admin student detail — Ready to teach banner", () => {
  test(
    "mid viewport stacks banner with callout contained inside banner bounds",
    { tag: [TAG.WB_CHROME] },
    async ({ page }) => {
      await page.setViewportSize(MID_VIEWPORT);

      const adminUserId = await seedTestAdmin();
      const studentId = await seedUnclaimedStudent(adminUserId);

      await page.goto(`/admin/students/${studentId}`, {
        waitUntil: "networkidle",
      });

      await expect(page.getByRole("heading", { name: "Unclaimed Banner Student" })).toBeVisible({
        timeout: 15_000,
      });

      const banner = page.getByTestId("student-ready-to-teach-banner");
      const copy = page.getByTestId("student-ready-to-teach-copy");
      const callout = banner.getByTestId("start-wb-consent-callout");

      await expect(banner).toBeVisible();
      await expect(callout).toBeVisible();

      const bannerBox = await banner.boundingBox();
      const copyBox = await copy.boundingBox();
      const calloutBox = await callout.boundingBox();

      expect(bannerBox).not.toBeNull();
      expect(copyBox).not.toBeNull();
      expect(calloutBox).not.toBeNull();

      const b = bannerBox!;
      const c = copyBox!;
      const k = calloutBox!;

      // Stacked layout: callout sits below copy (not crushed side-by-side).
      expect(k.y).toBeGreaterThanOrEqual(c.y + c.height - GEOMETRY_TOLERANCE_PX);

      // Copy uses most of the banner width when stacked (not a narrow crushed column).
      expect(c.width).toBeGreaterThanOrEqual(b.width * 0.55);

      // Callout fully within banner — no horizontal overflow past banner edges.
      expect(k.x).toBeGreaterThanOrEqual(b.x - GEOMETRY_TOLERANCE_PX);
      expect(k.x + k.width).toBeLessThanOrEqual(b.x + b.width + GEOMETRY_TOLERANCE_PX);
      expect(k.y).toBeGreaterThanOrEqual(b.y - GEOMETRY_TOLERANCE_PX);
      expect(k.y + k.height).toBeLessThanOrEqual(b.y + b.height + GEOMETRY_TOLERANCE_PX);
    }
  );

  test(
    "wide viewport places consent callout beside copy",
    { tag: [TAG.WB_CHROME] },
    async ({ page }) => {
      await page.setViewportSize(WIDE_VIEWPORT);

      const adminUserId = await seedTestAdmin();
      const studentId = await seedUnclaimedStudent(adminUserId);

      await page.goto(`/admin/students/${studentId}`, {
        waitUntil: "networkidle",
      });

      await expect(page.getByRole("heading", { name: "Unclaimed Banner Student" })).toBeVisible({
        timeout: 15_000,
      });

      const banner = page.getByTestId("student-ready-to-teach-banner");
      const copy = page.getByTestId("student-ready-to-teach-copy");
      const callout = banner.getByTestId("start-wb-consent-callout");

      await expect(callout).toBeVisible();

      const copyBox = await copy.boundingBox();
      const calloutBox = await callout.boundingBox();

      expect(copyBox).not.toBeNull();
      expect(calloutBox).not.toBeNull();

      const c = copyBox!;
      const k = calloutBox!;

      // Side-by-side: callout starts to the right of copy.
      expect(k.x).toBeGreaterThanOrEqual(c.x + c.width - GEOMETRY_TOLERANCE_PX);

      // Vertically centered in row: midlines approximately aligned.
      const copyMidY = c.y + c.height / 2;
      const calloutMidY = k.y + k.height / 2;
      expect(Math.abs(copyMidY - calloutMidY)).toBeLessThanOrEqual(24);
    }
  );
});
