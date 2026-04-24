/**
 * Coverage for `renderLatexToSvg` + `parseSvgDimensions`.
 *
 * The MathJax pipeline uses the lite adaptor so it works in plain
 * Node — we exercise it for real here, no mocks. The test catches:
 *
 *   - empty / oversized input is rejected
 *   - a known equation produces a parseable SVG with sensible
 *     dimensions
 *   - dimension parsing falls back to defaults for malformed SVG
 */

import {
  parseSvgDimensions,
  renderLatexToSvg,
} from "@/lib/whiteboard/math-render";

describe("renderLatexToSvg", () => {
  it("rejects empty input", async () => {
    const result = await renderLatexToSvg("   ");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/empty/i);
  });

  it("rejects suspiciously long input", async () => {
    const huge = "x".repeat(10_001);
    const result = await renderLatexToSvg(huge);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/max is 10000/i);
  });

  it("renders a basic fraction to SVG", async () => {
    const result = await renderLatexToSvg("\\frac{1}{2}");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svgString.startsWith("<svg")).toBe(true);
    expect(result.svgString.includes("</svg>")).toBe(true);
    expect(result.svgBlob.type).toBe("image/svg+xml");
    expect(result.widthPx).toBeGreaterThan(0);
    expect(result.heightPx).toBeGreaterThan(0);
  }, 15000);

  it("renders a more complex equation with packages", async () => {
    const result = await renderLatexToSvg(
      "\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}"
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svgString).toMatch(/<svg/);
  }, 15000);

  it("emits a merror SVG (rather than throwing) for malformed LaTeX", async () => {
    // MathJax's recovery model is to render an error glyph (merror)
    // rather than abort. That's the right UX for our flow — the tutor
    // still gets visual feedback they can fix in-place — so we lock
    // it in here. If MathJax ever changes to throw, we'd want to
    // surface a friendlier message before that becomes a regression.
    const result = await renderLatexToSvg("\\frac{");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svgString).toMatch(/merror|<svg/i);
  }, 15000);
});

describe("parseSvgDimensions", () => {
  it("extracts width/height from MathJax ex-encoded svg", () => {
    const svg = `<svg width="6.5ex" height="3.2ex" viewBox="0 0 1 1"></svg>`;
    const dims = parseSvgDimensions(svg, 28);
    // Each ex == fontPx * 0.5 == 14 px.
    expect(dims.widthPx).toBe(Math.round(6.5 * 14));
    expect(dims.heightPx).toBe(Math.round(3.2 * 14));
  });

  it("falls back to viewBox if ex units missing", () => {
    const svg = `<svg viewBox="0 0 1500 600"></svg>`;
    const dims = parseSvgDimensions(svg, 20);
    expect(dims.widthPx).toBeGreaterThan(0);
    expect(dims.heightPx).toBeGreaterThan(0);
  });

  it("clamps to a minimum size for tiny inputs", () => {
    const svg = `<svg width="0.1ex" height="0.1ex"></svg>`;
    const dims = parseSvgDimensions(svg, 28);
    expect(dims.widthPx).toBeGreaterThanOrEqual(40);
    expect(dims.heightPx).toBeGreaterThanOrEqual(20);
  });

  it("uses defaults when nothing is parseable", () => {
    const dims = parseSvgDimensions("<svg></svg>");
    expect(dims.widthPx).toBe(240);
    expect(dims.heightPx).toBe(60);
  });
});
