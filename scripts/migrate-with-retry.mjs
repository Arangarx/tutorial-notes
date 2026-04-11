/**
 * prisma migrate deploy with retries — helps Neon cold start / transient P1002 on Vercel builds.
 * @see https://www.prisma.io/docs/orm/reference/error-reference#p1002
 */
import { execSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const attempts = Number(process.env.PRISMA_MIGRATE_ATTEMPTS ?? "3");
const waitMs = Number(process.env.PRISMA_MIGRATE_RETRY_MS ?? "25000");

for (let i = 1; i <= attempts; i++) {
  try {
    execSync("npx prisma migrate deploy", { stdio: "inherit", env: process.env });
    process.exit(0);
  } catch {
    if (i >= attempts) {
      console.error("prisma migrate deploy failed after", attempts, "attempt(s).");
      process.exit(1);
    }
    console.warn(
      `[migrate-with-retry] attempt ${i}/${attempts} failed (e.g. P1002); retrying in ${waitMs / 1000}s…`
    );
    await delay(waitMs);
  }
}
