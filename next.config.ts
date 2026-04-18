import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: false },
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

