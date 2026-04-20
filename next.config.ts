import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: false },
  /** Keep ffmpeg binary out of the bundle; loaded at runtime from ffmpeg-static / FFMPEG_BIN. */
  serverExternalPackages: ["ffmpeg-static"],
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

