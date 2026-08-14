import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const EMPTY_STATE = { cookies: [] as [], origins: [] as [] };

const { assertLocalDatabaseUrlForHarness } = require("../../../scripts/wb-regression-local-db.cjs");

function uniqueEmail(): string {
  return `pw-cross-realm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
}

async function seedTutorEmail(email: string): Promise<void> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  const passwordHash = await bcrypt.hash("CrossRealm!99", 10);
  try {
    await prisma.adminUser.create({
      data: {
        email,
        passwordHash,
        displayName: "PW Cross-realm Tutor",
        role: "TUTOR",
        approvalStatus: "WAITLISTED",
        isTestAccount: false,
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function countAccountHolders(email: string): Promise<number> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  try {
    return prisma.accountHolder.count({ where: { email } });
  } finally {
    await prisma.$disconnect();
  }
}

test.describe("VERIFY-ACCT-1 — cross-realm email squatting", () => {
  test.use({ storageState: EMPTY_STATE });

  test("parent signup with tutor-owned email shows honest success copy and creates no AccountHolder", async ({
    page,
  }) => {
    const email = uniqueEmail();
    await seedTutorEmail(email);

    await page.goto("/account/signup");
    await page.locator("#ah-signup-email").waitFor({ state: "visible", timeout: 30_000 });
    await page.locator("#ah-signup-email").fill(email);
    await page.locator("#ah-signup-password").fill("CrossRealm!99");
    await page.locator("#ah-signup-confirm").fill("CrossRealm!99");
    await page.getByRole("button", { name: /create account/i }).click();

    await expect(page.getByText("Check your email")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(email)).toBeVisible();

    expect(await countAccountHolders(email)).toBe(0);
  });

  // PLAYWRIGHT-GAP: Google OAuth tutor signup with AccountHolder-owned email cannot run
  // hermetically — no mock Google IdP. Covered by src/__tests__/identity/cross-realm-email.test.ts
  // (signIn callback unit). Parent Google signup provision path does not exist yet.
});
