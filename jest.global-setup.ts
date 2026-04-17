import { execSync } from "node:child_process";

/** Default test DB (matches docker-compose + docker/postgres/init). */
const DEFAULT_TEST_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:5432/tutoring_notes_test";

export default async function globalSetup() {
  // Always use a dedicated test database — never the dev DB from .env.
  const testUrl = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
  process.env.DATABASE_URL = testUrl;
  process.env.DIRECT_URL = testUrl;
  process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET ?? "test-secret";
  process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@example.com";
  process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "replace-me";

  try {
    execSync("npx prisma db push --skip-generate", {
      stdio: "inherit",
      env: process.env,
    });
  } catch {
    // DB not reachable — unit tests (mocked, no DB) will still pass.
    // Integration tests that need the DB will fail on their own connection errors.
    console.warn(
      "[globalSetup] Could not reach test database — skipping db push. Unit-only tests will still run."
    );
  }
}
