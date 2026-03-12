import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

const SALT_ROUNDS = 10;

export async function hasAdminUsers(): Promise<boolean> {
  const count = await db.adminUser.count();
  return count > 0;
}

export async function getAdminByEmail(email: string) {
  return db.adminUser.findUnique({ where: { email: email.trim().toLowerCase() } });
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function createAdmin(email: string, plainPassword: string) {
  const hash = await bcrypt.hash(plainPassword, SALT_ROUNDS);
  return db.adminUser.create({
    data: {
      email: email.trim().toLowerCase(),
      passwordHash: hash,
    },
  });
}
