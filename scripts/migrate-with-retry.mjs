/**
 * prisma migrate deploy with retries — helps Neon cold start / transient P1002 on Vercel builds,
 * and overlapping deploys that contend on Prisma's advisory lock (fixed 10s wait; not tunable).
 * @see https://www.prisma.io/docs/orm/reference/error-reference#p1002
 * @see https://www.prisma.io/docs/orm/prisma-migrate/workflows/development-and-production#advisory-locking
 */
import { execSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { URL } from "node:url";

/** Default: enough attempts + spacing that another Vercel build can finish migrate first. */
const attempts = Number(process.env.PRISMA_MIGRATE_ATTEMPTS ?? "8");
const waitMs = Number(process.env.PRISMA_MIGRATE_RETRY_MS ?? "30000");

function exitIfDirectUrlLooksPooled() {
  const raw = process.env.DIRECT_URL;
  if (!raw || typeof raw !== "string") {
    return;
  }
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    // Neon’s pooled driver uses a `-pooler` hostname segment; direct does not.
    // Using the pooled string as DIRECT_URL breaks session-scoped advisory locks.
    if (host.includes("-pooler")) {
      const msg =
        "DIRECT_URL must be Neon’s non-pooled (direct) host (not `…-pooler…`). " +
        "Pooled URLs break Prisma Migrate advisory locks. " +
        "Neon → Connect: use “Direct connection” for DIRECT_URL; “Pooled” for DATABASE_URL only. See docs/DEPLOY.md.";
      // Fail fast on Vercel so we do not burn retries; locally only warn (dev .env may differ).
      if (process.env.VERCEL === "1") {
        console.error("[migrate-with-retry]", msg);
        process.exit(1);
      }
      console.warn("[migrate-with-retry] Warning:", msg);
    }
  } catch {
    // Invalid URL — let prisma report it.
  }
}

exitIfDirectUrlLooksPooled();

for (let i = 1; i <= attempts; i++) {
  try {
    execSync("npx prisma migrate deploy", { stdio: "inherit", env: process.env });
    process.exit(0);
  } catch {
    if (i >= attempts) {
      console.error("prisma migrate deploy failed after", attempts, "attempt(s).");
      console.error(
        "If errors mention advisory lock: avoid overlapping Vercel deploys, confirm DIRECT_URL is Neon direct (not pooled), and see docs/DEPLOY.md."
      );
      process.exit(1);
    }
    console.warn(
      `[migrate-with-retry] attempt ${i}/${attempts} failed (e.g. P1002 / advisory lock); retrying in ${waitMs / 1000}s…`
    );
    await delay(waitMs);
  }
}
