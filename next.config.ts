import type { NextConfig } from "next";

/**
 * Content-Security-Policy applied to every response. Kept narrow on
 * purpose so a future "let's embed X" request has to come through
 * this file (and review) rather than being silently allowed.
 *
 * Why each directive:
 *
 *   default-src 'self'
 *     Catch-all — everything must be explicitly listed below.
 *
 *   script-src 'self' 'unsafe-inline' 'unsafe-eval'
 *     Next.js + React hydrate by injecting inline runtime bootstrap;
 *     `unsafe-inline` is required for that. `unsafe-eval` is needed
 *     by the MathJax pipeline (compiled TeX expressions are eval'd
 *     in the lite adaptor) and by some Excalidraw font loaders. We
 *     accept this risk; the higher-value boundary for cross-origin
 *     safety is `frame-src` and the CORS/blob upload route allowlist.
 *
 *   style-src 'self' 'unsafe-inline'
 *     Excalidraw + MathJax both inject inline styles. Same trade-off.
 *
 *   img-src 'self' data: blob: https:
 *     `data:` for embedded SVGs (math equations, image previews);
 *     `blob:` for uploaded image previews; `https:` so PDF/image
 *     assets uploaded to Vercel Blob render. Tightening this further
 *     would require enumerating each blob host, which churns.
 *
 *   font-src 'self' data:
 *     `data:` is required by MathJax's local font cache.
 *
 *   connect-src 'self' https: wss:
 *     Whisper API, Vercel Blob client uploads, the WHITEBOARD_SYNC_URL
 *     WebSocket, plus the OpenAI completions endpoint. Listing each
 *     host would be more secure but creates an env-coupling problem
 *     across dev/prod/preview deployments.
 *
 *   frame-src 'self' https://www.desmos.com https://desmos.com
 *     The whiteboard's "Insert Desmos" toolbar embeds Desmos
 *     calculator iframes. NO other iframe sources are accepted —
 *     the Excalidraw `validateEmbeddable` allowlist mirrors this.
 *
 *   worker-src 'self' blob:
 *     pdfjs-dist runs its parser in a worker; the bootstrap is
 *     loaded from `/pdfjs/pdf.worker.min.mjs` (same origin) but it
 *     can spawn off-main-thread workers from blob URLs at runtime.
 *
 *   object-src 'none'
 *     Blocks <object>/<embed> entirely; we don't use them and
 *     blocking them shuts off a class of legacy XSS vectors.
 *
 *   base-uri 'self'
 *     Stops a markup-injection attack from rewriting <base href> to
 *     poison every relative URL on the page.
 *
 *   form-action 'self'
 *     Forms can only post back to our origin. We do not POST to any
 *     third party from a server-rendered form.
 *
 *   frame-ancestors 'none'
 *     We don't expect to be embedded by any other site. Tighter
 *     than X-Frame-Options because it survives ancestor-of-ancestor
 *     framing.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: wss:",
  "frame-src 'self' https://www.desmos.com https://desmos.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: false },
  /**
   * Keep ffmpeg-static out of the webpack bundle so it resolves at runtime
   * from node_modules (required for native binary execution).
   *
   * outputFileTracingIncludes forces Vercel's file tracer to copy the ffmpeg
   * binary into every serverless function. Without this, Vercel only traces
   * JS imports and the native binary is silently omitted from the deployment,
   * causing splitAudioIntoWhisperParts to throw "ffmpeg is not available"
   * for any upload over 25 MB.
   */
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: {
    "**": ["./node_modules/ffmpeg-static/**"],
  },
  experimental: {
    serverActions: {
      // Match Whisper's 25 MB transcription limit — anything larger won't
      // transcribe anyway, so 25 MB is the natural ceiling for audio uploads.
      bodySizeLimit: "100mb",
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Permissions-Policy",
            value: "microphone=(self)",
          },
          {
            key: "Content-Security-Policy",
            value: CONTENT_SECURITY_POLICY,
          },
          // Belt-and-suspenders: even though `frame-ancestors 'none'`
          // is the modern equivalent, X-Frame-Options is still
          // honored by older user agents.
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
