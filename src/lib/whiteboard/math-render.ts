import "server-only";

/**
 * LaTeX -> SVG renderer used by the whiteboard "Insert math" flow.
 *
 * SERVER-ONLY. Imported by the `/api/whiteboard/[sessionId]/math/render`
 * route; clients call that route over fetch and never bundle this file.
 *
 * Why server-only (regression context — Sarah demo, Apr 2026):
 *
 *   - `mathjax-full` is published as CommonJS. When this file was
 *     `"use client"` and dynamic-imported from `MathInsertButton`,
 *     webpack's CJS-interop wrappers emitted bare `require()` calls
 *     into the browser bundle and the dialog blew up at runtime with
 *     "Could not load the math renderer: require is not defined".
 *   - Moving the renderer behind a server route deletes the entire
 *     client-bundle vector. The `import "server-only"` guard turns
 *     any future accidental client import into a build-time error
 *     (Next.js' poison-pill module) so this can't silently regress.
 *   - As a bonus, the workspace shell drops ~250 KB gzipped — the
 *     mathjax dependency now lives in the serverless function.
 *
 * The flow:
 *
 *   1. The tutor types in a MathLive `<math-field>` (WYSIWYG editor)
 *      which spits out a LaTeX string.
 *   2. The client POSTs the LaTeX to
 *      `/api/whiteboard/[sessionId]/math/render`, which calls
 *      `renderLatexToSvg` here and returns the SVG string + intrinsic
 *      dimensions.
 *   3. The client wraps the SVG in a Blob, uploads it as an asset,
 *      and drops an Excalidraw `image` element on the canvas with
 *      `customData.latex` preserving the source so AI note generation
 *      and replay can read it back.
 *
 * Why MathJax + lite adaptor (and not e.g. KaTeX or a CDN render):
 *
 *   - MathJax is the gold standard for LaTeX coverage; KaTeX trips on
 *     things like `\substack`, environments, and macro packages Sarah's
 *     materials use.
 *   - `liteAdaptor` works without a real DOM, so MathJax runs cleanly
 *     in a Node serverless function with no jsdom shim.
 *   - Self-contained SVG (with `fontCache: "local"`) means the asset
 *     uploaded to Vercel Blob renders correctly when fetched in
 *     isolation by replay or sharing — no external font deps.
 */

let mathjaxModulesPromise: Promise<{
  convertTexToSvg: (latex: string, displayMode: boolean) => string;
}> | null = null;

/**
 * Lazy-load the MathJax pipeline + return a cached `convertTexToSvg`
 * closure. We build the pipeline once (it's expensive to construct)
 * and reuse it across calls.
 */
async function loadConverter(): Promise<{
  convertTexToSvg: (latex: string, displayMode: boolean) => string;
}> {
  if (!mathjaxModulesPromise) {
    mathjaxModulesPromise = (async () => {
      const [
        { mathjax },
        { TeX },
        { SVG },
        { liteAdaptor },
        { RegisterHTMLHandler },
        { AllPackages },
      ] = await Promise.all([
        import("mathjax-full/js/mathjax.js"),
        import("mathjax-full/js/input/tex.js"),
        import("mathjax-full/js/output/svg.js"),
        import("mathjax-full/js/adaptors/liteAdaptor.js"),
        import("mathjax-full/js/handlers/html.js"),
        import("mathjax-full/js/input/tex/AllPackages.js"),
      ]);
      const adaptor = liteAdaptor();
      RegisterHTMLHandler(adaptor);
      const tex = new TeX({ packages: AllPackages });
      // `local` fontCache embeds glyph paths once per SVG and
      // references them via <use> within the same document — keeps
      // the inserted asset self-contained for replay.
      const svg = new SVG({ fontCache: "local" });
      const html = mathjax.document("", {
        InputJax: tex,
        OutputJax: svg,
      });
      function convertTexToSvg(latex: string, displayMode: boolean): string {
        const node = html.convert(latex, {
          display: displayMode,
          em: 16,
          ex: 8,
          containerWidth: 800,
        });
        const out = adaptor.outerHTML(node);
        // MathJax wraps the SVG in <mjx-container> tags; for
        // Excalidraw we want the bare <svg ...>...</svg>. Pull it
        // out with a tolerant regex (we control the input, no XSS
        // risk from the wrapper).
        const svgMatch = out.match(/<svg[\s\S]*<\/svg>/);
        if (!svgMatch) {
          throw new Error("MathJax did not produce an SVG fragment.");
        }
        return svgMatch[0];
      }
      return { convertTexToSvg };
    })();
  }
  return mathjaxModulesPromise;
}

export type RenderMathSvgResult =
  | {
      ok: true;
      svgString: string;
      svgBlob: Blob;
      widthPx: number;
      heightPx: number;
    }
  | { ok: false; reason: string };

/**
 * Maximum LaTeX source length. Ten thousand chars is well over what
 * a single tutoring-session equation needs and stops a runaway paste
 * from blowing the MathJax parser's stack.
 */
const MAX_LATEX_CHARS = 10_000;

/**
 * Default font size for inserted equations on the canvas. The SVG's
 * intrinsic ex/em metrics are scaled to this px size during dimension
 * extraction so the equation reads at a tutoring-friendly size.
 */
const DEFAULT_EQUATION_FONT_PX = 28;

/**
 * Convert a LaTeX source string into a PNG-ready SVG Blob plus its
 * intrinsic on-canvas dimensions.
 *
 * `displayMode` true = block-style ($$...$$); false = inline ($...$).
 * Block mode is the default for Insert-Math because tutoring use is
 * 95% block equations.
 */
export async function renderLatexToSvg(
  latex: string,
  opts: { displayMode?: boolean } = {}
): Promise<RenderMathSvgResult> {
  const trimmed = latex.trim();
  if (!trimmed) {
    return { ok: false, reason: "Equation is empty." };
  }
  if (trimmed.length > MAX_LATEX_CHARS) {
    return {
      ok: false,
      reason: `Equation source is ${trimmed.length} chars; max is ${MAX_LATEX_CHARS}.`,
    };
  }

  let convertTexToSvg: (l: string, d: boolean) => string;
  try {
    ({ convertTexToSvg } = await loadConverter());
  } catch (err) {
    return {
      ok: false,
      reason: `Could not load the math renderer: ${(err as Error).message}`,
    };
  }

  let svg: string;
  try {
    svg = convertTexToSvg(trimmed, opts.displayMode !== false);
  } catch (err) {
    return {
      ok: false,
      reason: `LaTeX error: ${(err as Error).message}`,
    };
  }

  const dims = parseSvgDimensions(svg, DEFAULT_EQUATION_FONT_PX);
  const blob = new Blob([svg], { type: "image/svg+xml" });
  return {
    ok: true,
    svgString: svg,
    svgBlob: blob,
    widthPx: dims.widthPx,
    heightPx: dims.heightPx,
  };
}

/**
 * Pull an `image/svg+xml`-friendly width/height (in CSS pixels) out of
 * a MathJax-emitted SVG. MathJax encodes width/height in `ex` units
 * — multiply by `fontPx * (ex per em)` to get rendered pixels.
 *
 * Falls back to a sensible default if the regex misses (the SVG is
 * still valid; the caller just gets default dimensions).
 */
export function parseSvgDimensions(
  svg: string,
  fontPx: number = DEFAULT_EQUATION_FONT_PX
): { widthPx: number; heightPx: number } {
  // 0.5ex per em is the default MathJax ratio.
  const exToPx = (ex: number) => ex * fontPx * 0.5;
  const widthMatch = svg.match(/width="([0-9.]+)ex"/);
  const heightMatch = svg.match(/height="([0-9.]+)ex"/);
  if (widthMatch && heightMatch) {
    const w = exToPx(parseFloat(widthMatch[1]));
    const h = exToPx(parseFloat(heightMatch[1]));
    return {
      widthPx: Math.max(40, Math.round(w)),
      heightPx: Math.max(20, Math.round(h)),
    };
  }
  // Fallback: try viewBox.
  const vbMatch = svg.match(/viewBox="0 0 ([0-9.]+) ([0-9.]+)"/);
  if (vbMatch) {
    // Rough heuristic — MathJax viewBox values are in 1/1000 em.
    const w = (parseFloat(vbMatch[1]) / 1000) * fontPx;
    const h = (parseFloat(vbMatch[2]) / 1000) * fontPx;
    return {
      widthPx: Math.max(40, Math.round(w)),
      heightPx: Math.max(20, Math.round(h)),
    };
  }
  return { widthPx: 240, heightPx: 60 };
}
