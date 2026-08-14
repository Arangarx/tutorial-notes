/**
 * @jest-environment node
 *
 * Canonical gate for /api/test/whiteboard/* — production must hard-404 even when
 * Playwright sentinels leak into prod env vars.
 */

import { NextRequest } from "next/server";

describe("guardPlaywrightTestRoute", () => {
  const envSnapshot = { ...process.env };

  afterEach(() => {
    process.env = { ...envSnapshot };
    jest.resetModules();
  });

  function makeReq(secret?: string): NextRequest {
    const headers: Record<string, string> = {};
    if (secret !== undefined) {
      headers.authorization = `Bearer ${secret}`;
    }
    return new NextRequest("http://localhost/api/test/whiteboard/wbsid/db-state", {
      headers,
    });
  }

  test("production NODE_ENV + PLAYWRIGHT_TEST=1 + valid secret → 404", async () => {
    const env = process.env as NodeJS.ProcessEnv & {
      NODE_ENV?: string;
      VERCEL_ENV?: string;
    };
    env.NODE_ENV = "production";
    delete env.VERCEL_ENV;
    process.env.PLAYWRIGHT_TEST = "1";
    process.env.PLAYWRIGHT_TEST_SECRET = "playwright-test-secret";

    const { guardPlaywrightTestRoute } = await import("@/lib/playwright-test-route");
    const res = guardPlaywrightTestRoute(makeReq("playwright-test-secret"));

    expect(res).not.toBeNull();
    expect(res!.status).toBe(404);
    await expect(res!.json()).resolves.toEqual({ error: "Not found" });
  });

  test("VERCEL_ENV=production + PLAYWRIGHT_TEST=1 + valid secret → 404", async () => {
    const env = process.env as NodeJS.ProcessEnv & {
      NODE_ENV?: string;
      VERCEL_ENV?: string;
    };
    env.NODE_ENV = "development";
    env.VERCEL_ENV = "production";
    process.env.PLAYWRIGHT_TEST = "1";
    process.env.PLAYWRIGHT_TEST_SECRET = "playwright-test-secret";

    const { guardPlaywrightTestRoute } = await import("@/lib/playwright-test-route");
    const res = guardPlaywrightTestRoute(makeReq("playwright-test-secret"));

    expect(res).not.toBeNull();
    expect(res!.status).toBe(404);
  });

  test("test env + valid secret → allowed (null)", async () => {
    const env = process.env as NodeJS.ProcessEnv & { NODE_ENV?: string };
    env.NODE_ENV = "test";
    delete process.env.PLAYWRIGHT_TEST;
    process.env.PLAYWRIGHT_TEST_SECRET = "playwright-test-secret";

    const { guardPlaywrightTestRoute } = await import("@/lib/playwright-test-route");
    expect(guardPlaywrightTestRoute(makeReq("playwright-test-secret"))).toBeNull();
  });

  test("PLAYWRIGHT_TEST=1 + valid secret (non-prod) → allowed (null)", async () => {
    const env = process.env as NodeJS.ProcessEnv & {
      NODE_ENV?: string;
      VERCEL_ENV?: string;
    };
    env.NODE_ENV = "development";
    delete env.VERCEL_ENV;
    process.env.PLAYWRIGHT_TEST = "1";
    process.env.PLAYWRIGHT_TEST_SECRET = "playwright-test-secret";

    const { guardPlaywrightTestRoute } = await import("@/lib/playwright-test-route");
    expect(guardPlaywrightTestRoute(makeReq("playwright-test-secret"))).toBeNull();
  });

  test("test env + missing secret header → 401", async () => {
    const env = process.env as NodeJS.ProcessEnv & { NODE_ENV?: string };
    env.NODE_ENV = "test";
    process.env.PLAYWRIGHT_TEST_SECRET = "playwright-test-secret";

    const { guardPlaywrightTestRoute } = await import("@/lib/playwright-test-route");
    const res = guardPlaywrightTestRoute(makeReq());

    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
    await expect(res!.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  test("test env + wrong secret → 401", async () => {
    const env = process.env as NodeJS.ProcessEnv & { NODE_ENV?: string };
    env.NODE_ENV = "test";
    process.env.PLAYWRIGHT_TEST_SECRET = "playwright-test-secret";

    const { guardPlaywrightTestRoute } = await import("@/lib/playwright-test-route");
    const res = guardPlaywrightTestRoute(makeReq("wrong-secret"));

    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });

  test("local development without Playwright sentinels → 404", async () => {
    const env = process.env as NodeJS.ProcessEnv & {
      NODE_ENV?: string;
      VERCEL_ENV?: string;
    };
    env.NODE_ENV = "development";
    delete env.VERCEL_ENV;
    delete process.env.PLAYWRIGHT_TEST;
    process.env.PLAYWRIGHT_TEST_SECRET = "playwright-test-secret";

    const { guardPlaywrightTestRoute } = await import("@/lib/playwright-test-route");
    const res = guardPlaywrightTestRoute(makeReq("playwright-test-secret"));

    expect(res).not.toBeNull();
    expect(res!.status).toBe(404);
  });
});

describe("isPlaywrightTestProductionLocked — red-before oracle", () => {
  const envSnapshot = { ...process.env };

  afterEach(() => {
    process.env = { ...envSnapshot };
    jest.resetModules();
  });

  test("legacy isTestEnvRoute would pass production+PLAYWRIGHT_TEST; production lock does not", async () => {
    const env = process.env as NodeJS.ProcessEnv & { NODE_ENV?: string };
    env.NODE_ENV = "production";
    process.env.PLAYWRIGHT_TEST = "1";

    const legacyWouldAllow =
      process.env.NODE_ENV === "test" || process.env.PLAYWRIGHT_TEST === "1";
    expect(legacyWouldAllow).toBe(true);

    const { isPlaywrightTestProductionLocked } = await import(
      "@/lib/playwright-test-route"
    );
    expect(isPlaywrightTestProductionLocked()).toBe(true);
  });
});
