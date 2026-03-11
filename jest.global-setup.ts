import { execSync } from "node:child_process";

export default async function globalSetup() {
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? "file:./test.db";
  process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET ?? "test-secret";
  process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@example.com";
  process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "replace-me";

  execSync("npx prisma db push --skip-generate", {
    stdio: "inherit",
    env: process.env,
  });
}

