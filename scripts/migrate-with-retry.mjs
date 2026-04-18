/**
 * prisma migrate deploy with retries — helps Neon cold start / transient P1002 on Vercel builds,
 * and overlapping deploys that contend on Prisma's advisory lock (fixed 10s wait; not tunable).
 * @see https://www.prisma.io/docs/orm/reference/error-reference#p1002
 * @see https://www.prisma.io/docs/orm/prisma-migrate/workflows/development-and-production#advisory-locking
 *
 * Also handles P3009 (failed migration found in target DB):
 *   When a previous deploy partially ran a migration and the DB rolled it back, Prisma records the
 *   migration as "failed" and blocks all subsequent deploys with P3009. This script detects that
 *   state, calls `prisma migrate resolve --rolled-back <name>` to clear the flag, then retries.
 */
import { execSync, spawnSync } from "node:child_process";
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
    // Neon's pooled driver uses a `-pooler` hostname segment; direct does not.
    // Using the pooled string as DIRECT_URL breaks session-scoped advisory locks.
    if (host.includes("-pooler")) {
      const msg =
        "DIRECT_URL must be Neon's non-pooled (direct) host (not `…-pooler…`). " +
        "Pooled URLs break Prisma Migrate advisory locks. " +
        "Neon → Connect: use "Direct connection" for DIRECT_URL; "Pooled" for DATABASE_URL only. See docs/DEPLOY.md.";
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

/**
 * Run `prisma migrate deploy`, forwarding all output to stdout/stderr while also
 * capturing it so we can detect specific error codes (P3009, P3018).
 *
 * @returns {{ success: boolean, output: string }}
 */
function runMigrateDeploy() {
  const result = spawnSync(
    "npx",
    ["prisma", "migrate", "deploy"],
    {
      // pipe so we can capture; we forward manually below
      stdio: ["inherit", "pipe", "pipe"],
      env: process.env,
      encoding: "utf-8",
    }
  );

  // Forward captured streams so Vercel build logs show the output.
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  const output = (result.stdout ?? "") + (result.stderr ?? "");
  return { success: result.status === 0, output };
}

/**
 * When a migration partially failed and was rolled back, Prisma records it as "failed"
 * in _prisma_migrations and blocks new deploys with P3009.
 * This function parses the error output and calls `migrate resolve --rolled-back` to clear it.
 *
 * @param {string} output - combined stdout+stderr from the failed migrate deploy
 * @returns {boolean} true if we resolved at least one migration, false otherwise
 */
function tryResolveStalledMigration(output) {
  // P3009 output contains: The `<migration_name>` migration started at ... failed
  const match = output.match(/The `([^`]+)` migration started at .+? failed/);
  if (!match) return false;

  const name = match[1];
  console.warn(
    `[migrate-with-retry] Detected stalled migration: ${name}. ` +
      "Marking as rolled-back so the fixed migration can be applied."
  );
  try {
    execSync(`npx prisma migrate resolve --rolled-back "${name}"`, {
      stdio: "inherit",
      env: process.env,
    });
    console.log(`[migrate-with-retry] Resolved ${name} as rolled-back.`);
    return true;
  } catch {
    console.error(
      `[migrate-with-retry] Could not auto-resolve ${name}. ` +
        "You may need to run: npx prisma migrate resolve --rolled-back " +
        `"${name}" against the production database manually.`
    );
    return false;
  }
}

exitIfDirectUrlLooksPooled();

for (let i = 1; i <= attempts; i++) {
  const { success, output } = runMigrateDeploy();

  if (success) {
    process.exit(0);
  }

  if (i >= attempts) {
    console.error("prisma migrate deploy failed after", attempts, "attempt(s).");
    console.error(
      "If errors mention advisory lock: avoid overlapping Vercel deploys, confirm DIRECT_URL is Neon direct (not pooled), and see docs/DEPLOY.md."
    );
    process.exit(1);
  }

  // P3009: a previously-failed migration is blocking deploys.
  // Attempt to mark it as rolled-back and retry immediately (no delay needed — not a lock issue).
  if (output.includes("P3009") || output.includes("migrate found failed migrations")) {
    console.warn(
      `[migrate-with-retry] P3009 on attempt ${i}/${attempts} — attempting auto-resolve...`
    );
    const resolved = tryResolveStalledMigration(output);
    if (resolved) {
      // Retry immediately — the DB is now clear of the failed migration.
      continue;
    }
    // Could not resolve; fall through to normal retry with delay.
  }

  console.warn(
    `[migrate-with-retry] attempt ${i}/${attempts} failed (e.g. P1002 / advisory lock); retrying in ${waitMs / 1000}s…`
  );
  await delay(waitMs);
}
