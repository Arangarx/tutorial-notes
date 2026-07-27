/**
 * Wave A dedupe — one canonical FormSubmitButton composition.
 *
 * Guards against reintroducing SubmitButton or local useFormStatus submit
 * wrappers outside src/components/ui/form-submit-button.tsx.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC_ROOT = join(__dirname, "..", "..");
const LEGACY_SUBMIT_BUTTON_PATH = join(SRC_ROOT, "components", "SubmitButton.tsx");
const CANONICAL_PATH = join(SRC_ROOT, "components", "ui", "form-submit-button.tsx");

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

describe("FormSubmitButton dedupe (Wave A)", () => {
  it("deletes legacy src/components/SubmitButton.tsx", () => {
    expect(existsSync(LEGACY_SUBMIT_BUTTON_PATH)).toBe(false);
  });

  it("keeps exactly one canonical form-submit-button module", () => {
    expect(existsSync(CANONICAL_PATH)).toBe(true);
    const hits = walkTsFiles(SRC_ROOT).filter((file) => /form-submit-button\.tsx$/.test(file));
    expect(hits).toEqual([CANONICAL_PATH]);
  });

  it("has no SubmitButton imports under src/ (excluding tests)", () => {
    const offenders: string[] = [];
    for (const file of walkTsFiles(SRC_ROOT)) {
      if (file.includes(`${join("src", "__tests__")}`)) continue;
      const content = readFileSync(file, "utf8");
      if (
        content.includes('from "@/components/SubmitButton"') ||
        content.includes("from '@/components/SubmitButton'") ||
        /\bSubmitButton\b/.test(stripComments(content))
      ) {
        offenders.push(relative(SRC_ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("has no useFormStatus outside the canonical FormSubmitButton module", () => {
    const offenders: string[] = [];
    for (const file of walkTsFiles(SRC_ROOT)) {
      if (file.includes(`${join("src", "__tests__")}`)) continue;
      if (file === CANONICAL_PATH) continue;
      const content = stripComments(readFileSync(file, "utf8"));
      if (/\buseFormStatus\b/.test(content)) {
        offenders.push(relative(SRC_ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});
