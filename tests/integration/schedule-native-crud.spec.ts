/**
 * Native schedule CRUD — Priority #5 chunk 1.
 *
 * Run:
 *   npx playwright test tests/integration/schedule-native-crud.spec.ts --project=integration
 */

import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { localDateToInputValue } from "../../src/lib/schedule/mock-data";
import { TEST_ADMIN, seedTestAdmin, seedTestStudent } from "../visual/helpers";

function todayLocalDateInput(): string {
  return localDateToInputValue(new Date());
}

async function clearScheduledSessions(adminUserId: string) {
  const prisma = new PrismaClient();
  try {
    await prisma.scheduledSession.deleteMany({ where: { adminUserId } });
  } finally {
    await prisma.$disconnect();
  }
}

test.describe("Native schedule CRUD", () => {
  test.beforeEach(async () => {
    const adminUserId = await seedTestAdmin();
    await clearScheduledSessions(adminUserId);
  });

  test("create → agenda + month dot → edit → cancel; no visual preview banner", async ({
    page,
  }) => {
    const adminUserId = await seedTestAdmin();
    const { studentId } = await seedTestStudent(adminUserId);
    const subject = `PW Schedule ${Date.now()}`;
    const editedSubject = `${subject} Updated`;

    await page.goto("/admin/schedule");
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("schedule-page")).toBeVisible();
    await expect(page.getByText(/Visual preview only/i)).toHaveCount(0);

    await page.getByTestId("schedule-new-session").first().click();
    await expect(page.getByTestId("schedule-create-form")).toBeVisible();

    const sessionDate = todayLocalDateInput();
    await expect(page.locator("#schedule-date")).toHaveValue(sessionDate);

    await page.locator("#schedule-student").click();
    await page.getByRole("option", { name: "Playwright Student" }).click();
    await page.locator("#schedule-subject").fill(subject);
    await page.locator("#schedule-start").fill("15:00");
    await page.locator("#schedule-end").fill("16:00");
    await page.locator("#schedule-notes").fill("Bring worksheet");
    await page.getByTestId("schedule-save-session").click();

    await expect(page.getByTestId("schedule-create-form")).toHaveCount(0);
    await expect(
      page.getByTestId("schedule-session-subject").filter({ hasText: subject })
    ).toBeVisible({ timeout: 15_000 });

    await expect(
      page.getByTestId("schedule-start-session").first()
    ).toHaveAttribute("href", `/admin/students/${studentId}`);

    await expect(page.getByTestId("schedule-day-dot").first()).toBeVisible();

    await page.getByTestId("schedule-agenda-tab").click();
    const agendaRow = page.getByTestId("schedule-agenda-row").filter({ hasText: subject });
    await expect(agendaRow).toBeVisible();

    await agendaRow.getByRole("button", { name: "Edit" }).click();
    await expect(page.getByTestId("schedule-edit-form")).toBeVisible();
    await page.locator("#schedule-subject").fill(editedSubject);
    await page.getByTestId("schedule-save-session").click();
    await expect(page.getByText(editedSubject)).toBeVisible();

    const editedRow = page.getByTestId("schedule-agenda-row").filter({ hasText: editedSubject });
    await editedRow.getByRole("button", { name: "Edit" }).click();
    await page.getByTestId("schedule-cancel-session").click();
    await expect(page.getByText(editedSubject)).toHaveCount(0);
    await expect(page.getByTestId("schedule-agenda-row")).toHaveCount(0);
  });

  test("works with no Google calendar connected", async ({ page }) => {
    const prisma = new PrismaClient();
    try {
      const admin = await prisma.adminUser.findUnique({
        where: { email: TEST_ADMIN.email },
      });
      if (admin) {
        await prisma.oAuthCalendarConnection.deleteMany({
          where: { adminUserId: admin.id, provider: "google" },
        });
      }
    } finally {
      await prisma.$disconnect();
    }

    await page.goto("/admin/schedule");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(/Visual preview only/i)).toHaveCount(0);
    await expect(page.getByText("Synced")).toHaveCount(0);
    await expect(page.getByTestId("schedule-new-session").first()).toBeEnabled();
  });
});
