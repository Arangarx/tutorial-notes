/**
 * One-off: create or update an admin user in the database (same bcrypt as the app).
 *
 * Usage (set DATABASE_URL to your Neon/Vercel string first):
 *   node scripts/create-admin.mjs pilot@example.com "TempPassword123!"
 *
 * Then either:
 *   - Tell them to use /forgot-password with that email (if outbound email works), or
 *   - DM them the login URL + email + temp password once and ask them to change it in Settings.
 */
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const SALT_ROUNDS = 10;

const emailArg = process.argv[2];
const passwordArg = process.argv[3];

if (!emailArg || !passwordArg) {
  console.error('Usage: node scripts/create-admin.mjs <email> <password>');
  console.error('Example: node scripts/create-admin.mjs pilot@example.com "YourTempPass123!"');
  console.error('Requires DATABASE_URL in the environment (copy from Vercel → Neon pooled URL is fine).');
  process.exit(1);
}

const email = emailArg.trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("Invalid email.");
  process.exit(1);
}

if (passwordArg.length < 8) {
  console.error("Password must be at least 8 characters (app rule for resets).");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Export it or run:");
  console.error('  $env:DATABASE_URL="postgresql://..."   # PowerShell');
  process.exit(1);
}

const prisma = new PrismaClient();

try {
  const passwordHash = await bcrypt.hash(passwordArg, SALT_ROUNDS);
  await prisma.adminUser.upsert({
    where: { email },
    update: { passwordHash },
    create: { email, passwordHash },
  });
  console.log(`OK: admin ready for ${email}`);
  console.log("");
  console.log("Next steps:");
  console.log("  1. They open /login on your live site.");
  console.log("  If email (Gmail/SMTP) is configured on production:");
  console.log("     2a. Do NOT share the temp password — tell them to use /forgot-password with this email.");
  console.log("  Else:");
  console.log("     2b. DM them the site URL, this email, and the password once; ask them to change it under Settings → Profile.");
} finally {
  await prisma.$disconnect();
}
