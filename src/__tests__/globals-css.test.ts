/**
 * Lightweight regression tests for src/app/globals.css.
 *
 * These guard against two failure modes that have repeatedly caused
 * dark-mode UI bugs (Sarah's recording-share card was invisible / mis-sized
 * across multiple sessions):
 *
 *   1. Inline styles all over the admin UI reference CSS variables named
 *      var(--color-muted), var(--color-border), var(--color-primary),
 *      var(--color-success-*), var(--color-error). Those variables MUST be
 *      defined in :root, otherwise every fallback hex is a LIGHT-mode
 *      colour that's invisible against this dark theme.
 *
 *   2. The global `input { width: 100%; padding: 10px 12px; ... }` rule
 *      also matches <input type="checkbox">. Without an override, checkboxes
 *      stretch to fill their flex container and push adjacent label text past
 *      the edge of the card. Keep the override that restores native sizing.
 */

import { readFileSync } from "fs";
import { join } from "path";

const CSS = readFileSync(
  join(__dirname, "..", "app", "globals.css"),
  "utf8"
);

describe("globals.css — dark-mode variable definitions", () => {
  const REQUIRED_VARS = [
    "--color-muted",
    "--color-border",
    "--color-primary",
    "--color-success",
    "--color-success-bg",
    "--color-success-border",
    "--color-error",
    "--color-warning",
    "--color-warning-bg",
    "--color-warning-border",
  ];

  test.each(REQUIRED_VARS)("defines %s in :root", (varName) => {
    // Match `--name:` somewhere inside a :root block. Loose check, but enough
    // to catch accidental deletion. (Inline styles use these names with
    // light-mode hex fallbacks that look invisible on the dark theme.)
    const re = new RegExp(`${varName}\\s*:`, "m");
    expect(re.test(CSS)).toBe(true);
  });
});

describe("globals.css — checkbox/radio sizing override", () => {
  test("includes input[type=\"checkbox\"] override resetting width and padding", () => {
    // Without this override, the global `input` rule sets width:100%; padding:10px 12px
    // on checkboxes too — which broke the share-recording card layout.
    const checkboxBlockMatch = CSS.match(
      /input\[type="checkbox"\][^{]*\{[^}]*\}/
    );
    expect(checkboxBlockMatch).not.toBeNull();
    const block = checkboxBlockMatch![0];
    expect(block).toMatch(/width\s*:\s*auto/);
    expect(block).toMatch(/padding\s*:\s*0/);
  });

  test("checkbox override applies to radio too", () => {
    // Same fix should cover radio inputs to prevent the same class of bug.
    expect(CSS).toMatch(/input\[type="radio"\]/);
  });
});
