import type { NextConfig } from "next";

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
        ],
      },
    ];
  },
};

export default nextConfig;

