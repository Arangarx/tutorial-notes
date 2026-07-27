import { expect } from "@playwright/test";
import { test } from "./fixtures";

const THEME_KEY = "mynk-theme";
const LIGHT_SURFACE_BASE = "#f5f4ec";
const DARK_SURFACE_BASE = "#051a24";

async function readSurfaceBase(page: import("@playwright/test").Page) {
  return page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue("--surface-base")
      .trim()
  );
}

test.describe("theme tokens — resolved data-theme drives CSS variables", () => {
  test("login — explicit light", async ({ guardedPage }) => {
    await guardedPage.addInitScript((key) => {
      localStorage.setItem(key, "light");
    }, THEME_KEY);

    await guardedPage.goto("/login");
    await guardedPage.waitForLoadState("networkidle");

    await expect(guardedPage.locator("html")).toHaveAttribute("data-theme", "light");
    await expect.poll(() => readSurfaceBase(guardedPage)).toBe(LIGHT_SURFACE_BASE);
  });

  test("login — explicit dark", async ({ guardedPage }) => {
    await guardedPage.addInitScript((key) => {
      localStorage.setItem(key, "dark");
    }, THEME_KEY);

    await guardedPage.goto("/login");
    await guardedPage.waitForLoadState("networkidle");

    await expect(guardedPage.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect.poll(() => readSurfaceBase(guardedPage)).toBe(DARK_SURFACE_BASE);
  });

  test("login — system with emulated prefers-dark resolves data-theme and dark tokens", async ({
    guardedPage,
  }) => {
    await guardedPage.emulateMedia({ colorScheme: "dark" });
    await guardedPage.addInitScript((key) => {
      localStorage.setItem(key, "system");
    }, THEME_KEY);

    await guardedPage.goto("/login");
    await guardedPage.waitForLoadState("networkidle");

    await expect(guardedPage.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect.poll(() => readSurfaceBase(guardedPage)).toBe(DARK_SURFACE_BASE);
  });

  test("privacy — explicit dark token oracle", async ({ guardedPage }) => {
    await guardedPage.addInitScript((key) => {
      localStorage.setItem(key, "dark");
    }, THEME_KEY);

    await guardedPage.goto("/privacy");
    await guardedPage.waitForLoadState("networkidle");

    await expect(guardedPage.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect.poll(() => readSurfaceBase(guardedPage)).toBe(DARK_SURFACE_BASE);
  });

  test("feedback — system with emulated prefers-light resolves light tokens", async ({
    guardedPage,
  }) => {
    await guardedPage.emulateMedia({ colorScheme: "light" });
    await guardedPage.addInitScript((key) => {
      localStorage.setItem(key, "system");
    }, THEME_KEY);

    await guardedPage.goto("/feedback");
    await guardedPage.waitForLoadState("networkidle");

    await expect(guardedPage.locator("html")).toHaveAttribute("data-theme", "light");
    await expect.poll(() => readSurfaceBase(guardedPage)).toBe(LIGHT_SURFACE_BASE);
  });
});
