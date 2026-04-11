import { db } from "@/lib/db";
import { createAdmin, verifyPassword } from "@/lib/auth-db";
import {
  completePasswordReset,
  generateRawResetToken,
  hashResetToken,
} from "@/lib/password-reset";

beforeEach(async () => {
  await db.passwordResetToken.deleteMany();
  await db.adminUser.deleteMany();
});

afterAll(async () => {
  await db.$disconnect();
});

test("completePasswordReset updates password when token is valid", async () => {
  await createAdmin("tutor-reset@test.com", "oldpassword123");
  const raw = generateRawResetToken();
  await db.passwordResetToken.create({
    data: {
      email: "tutor-reset@test.com",
      tokenHash: hashResetToken(raw),
      expiresAt: new Date(Date.now() + 3_600_000),
    },
  });

  const result = await completePasswordReset(raw, "newpassword99");
  expect(result).toEqual({ ok: true });

  const admin = await db.adminUser.findUnique({ where: { email: "tutor-reset@test.com" } });
  expect(admin).not.toBeNull();
  expect(await verifyPassword("newpassword99", admin!.passwordHash)).toBe(true);
  expect(await verifyPassword("oldpassword123", admin!.passwordHash)).toBe(false);
});

test("completePasswordReset rejects expired token", async () => {
  await createAdmin("tutor-expired@test.com", "pw12345678");
  const raw = generateRawResetToken();
  await db.passwordResetToken.create({
    data: {
      email: "tutor-expired@test.com",
      tokenHash: hashResetToken(raw),
      expiresAt: new Date(Date.now() - 1000),
    },
  });

  const result = await completePasswordReset(raw, "anotherpw99");
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error).toMatch(/expired/i);
});

test("hashResetToken is stable for same input", () => {
  const t = "abc";
  expect(hashResetToken(t)).toBe(hashResetToken(t));
});
