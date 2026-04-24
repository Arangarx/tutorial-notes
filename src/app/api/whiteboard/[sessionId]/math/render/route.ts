import { NextResponse } from "next/server";
import { assertOwnsWhiteboardSession } from "@/lib/whiteboard-scope";
import { createActionCorrelationId } from "@/lib/action-correlation";
import { renderLatexToSvg } from "@/lib/whiteboard/math-render";

/**
 * Server-side LaTeX -> SVG rendering for the whiteboard "Insert math"
 * dialog. Replaces the previous client-side dynamic import of
 * `mathjax-full`, which exploded with "require is not defined" once
 * webpack's CJS-interop wrappers hit the browser bundle (regression
 * surfaced in the Apr 2026 Sarah demo — see math-render.ts header).
 *
 * Auth: session-scoped. Matches the existing whiteboard route family
 * (`checkpoint`, `events`, `snapshot`) — only the tutor who owns the
 * student that owns the session can call it. There's no rendering of
 * user-supplied data anywhere a stranger could trigger; the LaTeX
 * itself is treated as untrusted text and goes through MathJax with
 * the lite adaptor (no DOM access, no shell-out).
 *
 * Runtime: Node. MathJax is CommonJS-heavy and won't run on the Edge
 * runtime; we explicitly opt in to Node so future config changes
 * don't accidentally flip this to edge.
 *
 * Why not edge-cache the response: the LaTeX -> SVG mapping is pure
 * (no per-tutor or per-session data in the SVG itself), but each call
 * is preceded by a session-ownership DB read so caching at the route
 * level wouldn't help much. If we ever see math-render latency in
 * production we can promote `renderLatexToSvg` to a separate route
 * fronted by a CDN.
 */

export const runtime = "nodejs";

type RenderBody = {
  /** LaTeX source string. */
  latex: string;
  /** true = block ($$..$$), false = inline ($..$). Defaults to true. */
  displayMode?: boolean;
};

function parseBody(raw: unknown): RenderBody | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Partial<RenderBody>;
  if (typeof r.latex !== "string") return null;
  if (r.displayMode !== undefined && typeof r.displayMode !== "boolean") return null;
  return { latex: r.latex, displayMode: r.displayMode };
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ sessionId: string }> }
): Promise<Response> {
  const rid = createActionCorrelationId();
  const { sessionId } = await ctx.params;

  // Ownership check FIRST — bail before doing any expensive parsing
  // for callers who shouldn't see this endpoint at all.
  await assertOwnsWhiteboardSession(sessionId);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    console.warn(`[wbMathRender.route] rid=${rid} wbsid=${sessionId} invalid JSON body`);
    return NextResponse.json(
      { ok: false, reason: "Invalid request." },
      { status: 400 }
    );
  }

  const parsed = parseBody(body);
  if (!parsed) {
    console.warn(`[wbMathRender.route] rid=${rid} wbsid=${sessionId} body shape invalid`);
    return NextResponse.json(
      { ok: false, reason: "Invalid render payload." },
      { status: 400 }
    );
  }

  const result = await renderLatexToSvg(parsed.latex, {
    displayMode: parsed.displayMode !== false,
  });

  if (!result.ok) {
    // Length / empty / load-error rejections from the renderer come
    // back as 200 with `ok: false` so the client dialog can show the
    // reason inline rather than treating it as a network failure.
    // (Truly malformed LaTeX renders as a `merror` SVG and returns
    // ok=true — see math-render.test.ts for the contract.)
    return NextResponse.json(
      { ok: false, reason: result.reason },
      { status: 200 }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      svg: result.svgString,
      widthPx: result.widthPx,
      heightPx: result.heightPx,
    },
    { status: 200 }
  );
}
