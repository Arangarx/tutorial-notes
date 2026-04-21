/**
 * `queryMicPermission` should never throw — every failure path collapses to
 * "unknown" so the caller can still drive the prompt-on-Start fallback.
 */

import { queryMicPermission } from "@/lib/recording/permissions";

const originalNavigator = (globalThis as { navigator?: unknown }).navigator;

afterEach(() => {
  if (originalNavigator === undefined) {
    delete (globalThis as { navigator?: unknown }).navigator;
  } else {
    (globalThis as { navigator?: unknown }).navigator = originalNavigator;
  }
});

describe("queryMicPermission", () => {
  test("returns 'unknown' when navigator is missing (SSR)", async () => {
    delete (globalThis as { navigator?: unknown }).navigator;
    expect(await queryMicPermission()).toBe("unknown");
  });

  test("returns 'unknown' when navigator.permissions API is missing", async () => {
    (globalThis as { navigator?: unknown }).navigator = {};
    expect(await queryMicPermission()).toBe("unknown");
  });

  test("returns the permissions API state on success", async () => {
    (globalThis as { navigator?: unknown }).navigator = {
      permissions: {
        query: jest.fn(async ({ name }: { name: string }) => {
          expect(name).toBe("microphone");
          return { state: "granted" };
        }),
      },
    };
    expect(await queryMicPermission()).toBe("granted");
  });

  test("forwards 'prompt' state", async () => {
    (globalThis as { navigator?: unknown }).navigator = {
      permissions: { query: jest.fn(async () => ({ state: "prompt" })) },
    };
    expect(await queryMicPermission()).toBe("prompt");
  });

  test("forwards 'denied' state", async () => {
    (globalThis as { navigator?: unknown }).navigator = {
      permissions: { query: jest.fn(async () => ({ state: "denied" })) },
    };
    expect(await queryMicPermission()).toBe("denied");
  });

  test("returns 'unknown' if the query throws (older Safari rejects 'microphone')", async () => {
    (globalThis as { navigator?: unknown }).navigator = {
      permissions: {
        query: jest.fn(async () => {
          throw new TypeError("not supported");
        }),
      },
    };
    expect(await queryMicPermission()).toBe("unknown");
  });
});
