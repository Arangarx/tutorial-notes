/**
 * Lightweight regression tests for src/app/globals.css + src/styles/tokens.css.
 *
 * These guard against three failure modes that have repeatedly caused
 * dark-mode UI bugs (Sarah's recording-share card was invisible / mis-sized
 * across multiple sessions):
 *
 *   1. Inline styles all over the admin UI reference CSS variables named
 *      var(--color-muted), var(--color-border), var(--color-primary),
 *      var(--color-success-*), var(--color-error). Those variables MUST be
 *      defined via tokens.css legacy aliases.
 *
 *   2. The global `input { width: 100%; padding: 10px 12px; ... }` rule
 *      also matches <input type="checkbox">. Without an override, checkboxes
 *      stretch to fill their flex container and push adjacent label text past
 *      the edge of the card.
 *
 *   3. `color-scheme` follows [data-theme] on <html> (resolved by JS)
 *      so native form controls match the active theme.
 */

import { readFileSync } from "fs";
import { join } from "path";

const GLOBALS = readFileSync(
  join(__dirname, "..", "..", "app", "globals.css"),
  "utf8"
);
const TOKENS = readFileSync(
  join(__dirname, "..", "..", "styles", "tokens.css"),
  "utf8"
);
const TYPOGRAPHY = readFileSync(
  join(__dirname, "..", "..", "styles", "typography.css"),
  "utf8"
);
const CSS = `${GLOBALS}\n${TOKENS}\n${TYPOGRAPHY}`;

describe("tokens.css — legacy variable definitions", () => {
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
    "--surface-base",
    "--surface-1",
    "--meter-loud",
  ];

  test.each(REQUIRED_VARS)("defines %s", (varName) => {
    const re = new RegExp(`${varName}\\s*:`, "m");
    expect(re.test(CSS)).toBe(true);
  });
});

describe("globals.css — checkbox/radio sizing override", () => {
  test("includes input[type=\"checkbox\"] override resetting width and padding", () => {
    const checkboxBlockMatch = GLOBALS.match(
      /input\[type="checkbox"\][^{]*\{[^}]*\}/
    );
    expect(checkboxBlockMatch).not.toBeNull();
    const block = checkboxBlockMatch![0];
    expect(block).toMatch(/width\s*:\s*auto/);
    expect(block).toMatch(/padding\s*:\s*0/);
  });

  test("checkbox override applies to radio too", () => {
    expect(GLOBALS).toMatch(/input\[type="radio"\]/);
  });
});

describe("tokens.css — theme + color-scheme", () => {
  test("declares color-scheme: light on :root default", () => {
    expect(TOKENS).toMatch(/:root[\s\S]*color-scheme\s*:\s*light\b/);
  });

  test("declares color-scheme: dark on [data-theme=dark]", () => {
    expect(TOKENS).toMatch(
      /\[data-theme="dark"\][\s\S]*color-scheme\s*:\s*dark\b/
    );
  });

  test("does not use prefers-color-scheme media for dark palette (JS resolves system)", () => {
    expect(TOKENS).not.toMatch(/@media\s*\(prefers-color-scheme:\s*dark\)/);
  });

  test("supports explicit data-theme light and dark overrides", () => {
    expect(TOKENS).toMatch(/\[data-theme="light"\]/);
    expect(TOKENS).toMatch(/\[data-theme="dark"\]/);
  });

  test("declares accent-color so checkmark / radio dot is visible", () => {
    expect(TOKENS).toMatch(/accent-color\s*:/);
  });
});

describe("globals.css — imports token layer", () => {
  test("imports tokens.css", () => {
    expect(GLOBALS).toMatch(/@import\s+["'].*tokens\.css["']/);
  });

  test("imports typography.css", () => {
    expect(GLOBALS).toMatch(/@import\s+["'].*typography\.css["']/);
  });
});

describe("tokens.css — Mynka Blue dark (no legacy purple)", () => {
  test("dark blocks use Mynka Blue brand, not legacy #7c5cff", () => {
    expect(TOKENS).toMatch(/\[data-theme="dark"\][\s\S]*--brand:\s*#7ea4b1/i);
    expect(TOKENS).not.toMatch(/#7c5cff/i);
  });

  test("light accent-on is Option A dark text on coral", () => {
    expect(TOKENS).toMatch(
      /:root[\s\S]*--accent-on:\s*#15203a/i
    );
  });

  test("dark accent-on is near-navy on coral CTA", () => {
    expect(TOKENS).toMatch(
      /\[data-theme="dark"\][\s\S]*--accent-on:\s*#051a24/i
    );
  });
});

describe("globals.css — coral CTA link safety", () => {
  test("button-styled links are excluded from a{color:inherit}", () => {
    expect(GLOBALS).toMatch(/a:not\(\[data-slot="button"\]\)/);
  });

  test("btn.btn-primary alias matches coral CTA foreground token", () => {
    expect(GLOBALS).toMatch(/\.btn\.btn-primary[\s\S]*color:\s*var\(--accent-on\)/);
  });
});

describe("typography.css — brand utility classes", () => {
  test("defines wordmark, heading, ai-prose, label-mono", () => {
    expect(TYPOGRAPHY).toMatch(/\.wordmark\b/);
    expect(TYPOGRAPHY).toMatch(/\.heading\b/);
    expect(TYPOGRAPHY).toMatch(/\.ai-prose\b/);
    expect(TYPOGRAPHY).toMatch(/\.label-mono\b/);
  });
});
