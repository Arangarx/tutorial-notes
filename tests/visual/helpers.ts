import { type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

/**
 * Test admin credentials and seed helpers for Playwright tests.
 *
 * The test database (pw.db / DATABASE_URL from playwright webServer command)
 * is a separate SQLite file, so seeding here never touches production data.
 *
 * Credentials are fixed so tests are reproducible and don't rely on env vars.
 * Change them here if the test DB is reset and you need a fresh admin.
 */
export const TEST_ADMIN = {
  email: "playwright@test.local",
  password: "PlaywrightTest123!",
  displayName: "Playwright Test Admin",
};

/**
 * Ensure the test admin user exists in the test database.
 * Idempotent — safe to call at the start of every test or in global setup.
 */
export async function seedTestAdmin(): Promise<string> {
  const prisma = new PrismaClient();
  try {
    const existing = await prisma.adminUser.findUnique({
      where: { email: TEST_ADMIN.email },
    });
    if (existing) return existing.id;

    const hash = await bcrypt.hash(TEST_ADMIN.password, 10);
    const user = await prisma.adminUser.create({
      data: {
        email: TEST_ADMIN.email,
        passwordHash: hash,
        displayName: TEST_ADMIN.displayName,
      },
    });
    return user.id;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Seed a student + one session note for the test admin.
 * Returns { studentId, noteId } for use in test URLs.
 * Idempotent by student name within the same admin user.
 */
export async function seedTestStudent(adminUserId: string): Promise<{
  studentId: string;
  noteId: string;
  shareToken: string;
}> {
  const prisma = new PrismaClient();
  try {
    const existing = await prisma.student.findFirst({
      where: { adminUserId, name: "Playwright Student" },
      include: { notes: true, shareLinks: true },
    });
    if (existing && existing.notes.length > 0 && existing.shareLinks.length > 0) {
      return {
        studentId: existing.id,
        noteId: existing.notes[0].id,
        shareToken: existing.shareLinks[0].token,
      };
    }

    const student = existing ?? await prisma.student.create({
      data: { name: "Playwright Student", adminUserId, parentEmail: "parent@test.local" },
    });

    const note = existing?.notes[0] ?? await prisma.sessionNote.create({
      data: {
        studentId: student.id,
        date: new Date("2026-01-15"),
        topics: "Quadratic equations and factoring",
        homework: "Complete worksheet pages 4-6",
        nextSteps: "Review negative coefficient problems",
        status: "READY",
      },
    });

    const shareLink = existing?.shareLinks[0] ?? await prisma.shareLink.create({
      data: {
        studentId: student.id,
        token: `playwright-test-token-${student.id.slice(0, 8)}`,
      },
    });

    return { studentId: student.id, noteId: note.id, shareToken: shareLink.token };
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Log in as the test admin via the login form.
 * Navigates to /login, fills credentials, submits, waits for redirect to /admin.
 */
export async function loginAsTestAdmin(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(TEST_ADMIN.email);
  await page.getByLabel(/password/i).fill(TEST_ADMIN.password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL(/\/admin/, { timeout: 15_000 });
}
