/**
 * Wave A dedupe — SubmitButton wrapper retired.
 *
 * The shared SubmitButton component was a thin wrapper around Button +
 * useFormStatus. Call sites now use the same pattern inline (see
 * SendUpdateForm / feedback page) so we do not reintroduce a parallel
 * submit-button primitive.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC_ROOT = join(__dirname, "..", "..");
const SUBMIT_BUTTON_PATH = join(SRC_ROOT, "components", "SubmitButton.tsx");

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

describe("SubmitButton dedupe (Wave A)", () => {
  it("deletes src/components/SubmitButton.tsx", () => {
    expect(existsSync(SUBMIT_BUTTON_PATH)).toBe(false);
  });

  it("has no SubmitButton imports under src/ (excluding tests)", () => {
    const offenders: string[] = [];
    for (const file of walkTsFiles(SRC_ROOT)) {
      if (file.includes(`${join("src", "__tests__")}`)) continue;
      const content = readFileSync(file, "utf8");
      if (
        content.includes('from "@/components/SubmitButton"') ||
        content.includes("from '@/components/SubmitButton'") ||
        /\bSubmitButton\b/.test(content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, ""))
      ) {
        offenders.push(relative(SRC_ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("migrated call sites wire Button + useFormStatus for pending state", () => {
    const samples = [
      "app/admin/settings/profile/ChangePasswordForm.tsx",
      "app/admin/students/[id]/StudentActions.tsx",
      "components/admin/StudentsRoster.tsx",
      "app/admin/students/[id]/ShareLinkControls.tsx",
      "app/admin/ImpersonateSubmitForm.tsx",
    ];

    for (const rel of samples) {
      const content = readFileSync(join(SRC_ROOT, rel), "utf8");
      expect(content).toContain("useFormStatus");
      expect(content).toMatch(/type="submit"/);
      expect(content).toContain('from "@/components/ui/button"');
      expect(content).toMatch(/disabled=\{pending\}/);
      expect(content).toMatch(/aria-busy=\{pending\}/);
    }
  });
});
