/**
 * @jest-environment node
 *
 * Production-like env must NOT activate the Playwright blob harness.
 */

describe("blob harness active guard", () => {
  const envSnapshot = { ...process.env };

  afterEach(() => {
    process.env = { ...envSnapshot };
    jest.resetModules();
  });

  test("isBlobHarnessActive is false without both sentinels", async () => {
    delete process.env.PLAYWRIGHT_TEST;
    delete process.env.BLOB_HARNESS_LOCAL;
    const { isBlobHarnessActive } = await import("@/lib/blob-harness");
    expect(isBlobHarnessActive()).toBe(false);
  });

  test("isBlobHarnessActive is false with only PLAYWRIGHT_TEST", async () => {
    process.env.PLAYWRIGHT_TEST = "1";
    delete process.env.BLOB_HARNESS_LOCAL;
    const { isBlobHarnessActive } = await import("@/lib/blob-harness");
    expect(isBlobHarnessActive()).toBe(false);
  });

  test("isBlobHarnessActive is false with only BLOB_HARNESS_LOCAL", async () => {
    delete process.env.PLAYWRIGHT_TEST;
    process.env.BLOB_HARNESS_LOCAL = "1";
    const { isBlobHarnessActive } = await import("@/lib/blob-harness");
    expect(isBlobHarnessActive()).toBe(false);
  });

  test("isBlobHarnessActive is true only when both sentinels set", async () => {
    process.env.PLAYWRIGHT_TEST = "1";
    process.env.BLOB_HARNESS_LOCAL = "1";
    const { isBlobHarnessActive, isAllowedBlobUrl } = await import(
      "@/lib/blob-harness"
    );
    expect(isBlobHarnessActive()).toBe(true);
    expect(
      isAllowedBlobUrl(
        "http://localhost:3100/api/test/blob/object/sessions/stu1/a.webm"
      )
    ).toBe(true);
  });

  test("isBlobHarnessActive is false in production even with both sentinels", async () => {
    const env = process.env as NodeJS.ProcessEnv & { NODE_ENV?: string };
    const prev = env.NODE_ENV;
    env.NODE_ENV = "production";
    process.env.PLAYWRIGHT_TEST = "1";
    process.env.BLOB_HARNESS_LOCAL = "1";
    const { isBlobHarnessActive } = await import("@/lib/blob-harness");
    expect(isBlobHarnessActive()).toBe(false);
    env.NODE_ENV = prev;
  });

  test("isBlobHarnessActive is false when VERCEL_ENV=production even with both sentinels", async () => {
    const env = process.env as NodeJS.ProcessEnv & {
      NODE_ENV?: string;
      VERCEL_ENV?: string;
    };
    env.NODE_ENV = "development";
    env.VERCEL_ENV = "production";
    process.env.PLAYWRIGHT_TEST = "1";
    process.env.BLOB_HARNESS_LOCAL = "1";
    const { isBlobHarnessActive } = await import("@/lib/blob-harness");
    expect(isBlobHarnessActive()).toBe(false);
  });

  test("isAllowedBlobUrl rejects harness URLs on foreign origin when harness active", async () => {
    process.env.PLAYWRIGHT_TEST = "1";
    process.env.BLOB_HARNESS_LOCAL = "1";
    const { isAllowedBlobUrl } = await import("@/lib/blob-harness");
    expect(
      isAllowedBlobUrl(
        "https://evil.example/api/test/blob/object/sessions/stu1/a.webm"
      )
    ).toBe(false);
  });

  test("isAllowedBlobUrl rejects harness URLs when harness inactive", async () => {
    delete process.env.PLAYWRIGHT_TEST;
    delete process.env.BLOB_HARNESS_LOCAL;
    const { isAllowedBlobUrl } = await import("@/lib/blob-harness");
    expect(
      isAllowedBlobUrl(
        "http://localhost:3100/api/test/blob/object/sessions/stu1/a.webm"
      )
    ).toBe(false);
    expect(
      isAllowedBlobUrl(
        "https://abc.public.blob.vercel-storage.com/sessions/stu1/a.webm"
      )
    ).toBe(true);
  });
});
