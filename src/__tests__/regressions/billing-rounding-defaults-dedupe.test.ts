/**
 * Wave A dedupe — one canonical billing rounding defaults export surface.
 *
 * DEFAULT_ROUNDING_* constants live in defaults.ts only; rounding.ts is pure
 * billable-minute math (roundBillableMinutes + RoundingMode type).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC_ROOT = join(__dirname, "..", "..");
const DEFAULTS_PATH = join(SRC_ROOT, "lib", "billing", "defaults.ts");
const ROUNDING_PATH = join(SRC_ROOT, "lib", "billing", "rounding.ts");

function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

describe("billing rounding defaults dedupe (Wave A)", () => {
  it("defines DEFAULT_ROUNDING_* only in defaults.ts", () => {
    const defaults = stripComments(readFileSync(DEFAULTS_PATH, "utf8"));
    expect(defaults).toMatch(/\bexport const DEFAULT_ROUNDING_INCREMENT_MIN\b/);
    expect(defaults).toMatch(/\bexport const DEFAULT_ROUNDING_MODE\b/);
    expect(defaults).not.toMatch(/\bexport\s*\{[^}]*DEFAULT_ROUNDING_/);
  });

  it("does not export DEFAULT_ROUNDING_* from rounding.ts", () => {
    const rounding = stripComments(readFileSync(ROUNDING_PATH, "utf8"));
    expect(rounding).not.toMatch(/\bDEFAULT_ROUNDING_INCREMENT_MIN\b/);
    expect(rounding).not.toMatch(/\bDEFAULT_ROUNDING_MODE\b/);
  });
});
