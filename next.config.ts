import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: false },
  experimental: {
    serverActions: {
      // Match Whisper's 25 MB transcription limit — anything larger won't
      // transcribe anyway, so 25 MB is the natural ceiling for audio uploads.
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;

