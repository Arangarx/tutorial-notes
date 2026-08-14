import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { normalizeEmail } from "@/lib/normalize-email";

const SALT_ROUNDS = 10;

export async function hasAdminUsers(): Promise<boolean> {
  const count = await db.adminUser.count();
  return count > 0;
}

export async function getAdminByEmail(email: string) {
  return db.adminUser.findUnique({ where: { email: normalizeEmail(email) } });
}

/** Fetch minimal role + approval fields by id — used by the JWT refresh path in auth-options. */
export async function getAdminById(id: string) {
  return db.adminUser.findUnique({
    where: { id },
    select: { id: true, role: true, isTestAccount: true, approvalStatus: true },
  });
}

export async function verifyPassword(plain: string, hash: string | null): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}

export async function createTestAccount(email: string, displayName?: string | null) {
  return db.adminUser.create({
    data: {
      email: normalizeEmail(email),
      passwordHash: null,
      isTestAccount: true,
      displayName: displayName?.trim() || null,
    },
  });
}

export async function createAdmin(
  email: string,
  plainPassword: string,
  displayName?: string | null
) {
  const hash = await bcrypt.hash(plainPassword, SALT_ROUNDS);
  const dn = displayName?.trim() || null;
  // B1: new signups always land WAITLISTED. The schema @default(WAITLISTED) also
  // covers it, but being explicit here makes intent clear and testable.
  return db.adminUser.create({
    data: {
      email: normalizeEmail(email),
      passwordHash: hash,
      displayName: dn,
      role: "TUTOR",
      isTestAccount: false,
      approvalStatus: "WAITLISTED",
    },
  });
}

/** Google OAuth signup from /signup — no password; same WAITLISTED gate as credentials. */
export async function createAdminFromGoogle(
  email: string,
  displayName?: string | null
) {
  const dn = displayName?.trim() || null;
  return db.adminUser.create({
    data: {
      email: normalizeEmail(email),
      passwordHash: null,
      displayName: dn,
      role: "TUTOR",
      isTestAccount: false,
      approvalStatus: "WAITLISTED",
    },
  });
}

export async function updateAdminDisplayName(email: string, displayName: string | null) {
  await db.adminUser.update({
    where: { email: normalizeEmail(email) },
    data: { displayName: displayName?.trim() || null },
  });
}

export async function updateAdminPassword(email: string, plainPassword: string) {
  const hash = await bcrypt.hash(plainPassword, SALT_ROUNDS);
  await db.adminUser.update({
    where: { email: normalizeEmail(email) },
    data: { passwordHash: hash },
  });
}
