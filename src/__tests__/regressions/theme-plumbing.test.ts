/**
 * @jest-environment jsdom
 */

/**
 * Regression guards for site-wide theme plumbing (Phase A′).
 */

import { readFileSync } from "fs";
import { join } from "path";

import {
  DEV_THEME_STORAGE_KEY,
  THEME_STORAGE_KEY,
  applyThemeToDocument,
  getThemeBootstrapScript,
  isThemeMode,
  resolveTheme,
} from "@/lib/theme";

const GLOBALS = readFileSync(
  join(__dirname, "..", "..", "app", "globals.css"),
  "utf8"
);

const LIGHT_SURFACE_BASE = "#f5f4ec";
const DARK_SURFACE_BASE = "#051a24";

function mockMatchMedia(prefersDark: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: query.includes("dark") ? prefersDark : !prefersDark,
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      dispatchEvent: jest.fn(),
      onchange: null,
    }),
  });
}

describe("theme plumbing — storage keys", () => {
  test("production key is distinct from dev legacy key", () => {
    expect(THEME_STORAGE_KEY).toBe("mynk-theme");
    expect(DEV_THEME_STORAGE_KEY).toBe("tutoring-notes-dev-theme");
    expect(THEME_STORAGE_KEY).not.toBe(DEV_THEME_STORAGE_KEY);
  });
});

describe("theme plumbing — bootstrap script", () => {
  const script = getThemeBootstrapScript();

  test("reads production localStorage key before paint", () => {
    expect(script).toContain(THEME_STORAGE_KEY);
  });

  test("supports dev ?theme= override", () => {
    expect(script).toContain('p.get("theme")');
    expect(script).toContain(DEV_THEME_STORAGE_KEY);
  });

  test("resolves system / unset via matchMedia instead of removing data-theme", () => {
    expect(script).not.toContain('removeAttribute("data-theme")');
    expect(script).toContain('matchMedia("(prefers-color-scheme: dark)")');
    expect(script).toContain('setAttribute("data-theme"');
  });
});

describe("theme plumbing — applyThemeToDocument", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
  });

  test("explicit light sets data-theme=light", () => {
    expect(applyThemeToDocument("light")).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  test("explicit dark sets data-theme=dark", () => {
    expect(applyThemeToDocument("dark")).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  test("system resolves OS preference to data-theme (never removes attribute)", () => {
    mockMatchMedia(true);
    expect(applyThemeToDocument("system")).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

    mockMatchMedia(false);
    expect(applyThemeToDocument("system")).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });
});

describe("theme plumbing — mode resolution", () => {
  test("isThemeMode accepts light, dark, system only", () => {
    expect(isThemeMode("light")).toBe(true);
    expect(isThemeMode("dark")).toBe(true);
    expect(isThemeMode("system")).toBe(true);
    expect(isThemeMode("sepia")).toBe(false);
    expect(isThemeMode(null)).toBe(false);
  });

  test("resolveTheme maps explicit modes", () => {
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
  });
});

describe("globals.css — Tailwind dark variant follows data-theme", () => {
  test("declares @custom-variant dark keyed to [data-theme=dark]", () => {
    expect(GLOBALS).toMatch(
      /@custom-variant\s+dark\s+\(&:where\(\[data-theme=dark\],\s*\[data-theme=dark\]\s*\*\)\)/
    );
  });
});

describe("theme plumbing — token oracle constants", () => {
  test("light and dark surface-base oracles are distinct Mynka Blue values", () => {
    expect(LIGHT_SURFACE_BASE).not.toBe(DARK_SURFACE_BASE);
    expect(LIGHT_SURFACE_BASE).toBe("#f5f4ec");
    expect(DARK_SURFACE_BASE).toBe("#051a24");
  });
});
