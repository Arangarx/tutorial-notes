/**
 * Wave A dedupe — one canonical StatTile + QuickLinkCard (admin dashboard).
 *
 * Guards against reintroducing page-local tile markup or duplicate modules.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC_ROOT = join(__dirname, "..", "..");
const STAT_TILE_PATH = join(SRC_ROOT, "components", "admin", "StatTile.tsx");
const QUICK_LINK_PATH = join(SRC_ROOT, "components", "admin", "QuickLinkCard.tsx");
const ADMIN_HOME_PAGE = join(SRC_ROOT, "app", "admin", "page.tsx");
const ADMIN_COST_PAGE = join(SRC_ROOT, "app", "admin", "cost", "page.tsx");

function walkTsFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      walkTsFiles(full, acc);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

describe("StatTile + QuickLinkCard dedupe (Wave A)", () => {
  it("keeps exactly one canonical StatTile module", () => {
    expect(existsSync(STAT_TILE_PATH)).toBe(true);
    const hits = walkTsFiles(SRC_ROOT).filter((file) => /[/\\]StatTile\.tsx$/.test(file));
    expect(hits).toEqual([STAT_TILE_PATH]);
  });

  it("keeps exactly one canonical QuickLinkCard module", () => {
    expect(existsSync(QUICK_LINK_PATH)).toBe(true);
    const hits = walkTsFiles(SRC_ROOT).filter((file) => /[/\\]QuickLinkCard\.tsx$/.test(file));
    expect(hits).toEqual([QUICK_LINK_PATH]);
  });

  it("admin home imports QuickLinkCard and has no local quick-link class forks", () => {
    const content = readFileSync(ADMIN_HOME_PAGE, "utf8");
    expect(content).toContain('from "@/components/admin/QuickLinkCard"');
    expect(content).not.toMatch(/\bquickLinkCardClass\b/);
    expect(content).not.toMatch(/\bquickLinkEyebrowClass\b/);
    expect(content).not.toMatch(/\bquickLinkTitleClass\b/);
  });

  it("admin cost imports StatTile and has no page-local StatTile function", () => {
    const content = stripComments(readFileSync(ADMIN_COST_PAGE, "utf8"));
    expect(content).toContain('from "@/components/admin/StatTile"');
    expect(content).not.toMatch(/\bfunction\s+StatTile\b/);
  });

  it("has no page-local StatTile or QuickLinkCard definitions under src/app", () => {
    const offenders: string[] = [];
    const appRoot = join(SRC_ROOT, "app");
    for (const file of walkTsFiles(appRoot)) {
      const content = stripComments(readFileSync(file, "utf8"));
      if (/\bfunction\s+StatTile\b/.test(content) || /\bfunction\s+QuickLinkCard\b/.test(content)) {
        offenders.push(relative(SRC_ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});
