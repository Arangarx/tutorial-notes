import { env } from "@/lib/env";

/** Public site URL for links in emails (reset, etc.). Set NEXTAUTH_URL in production. */
export function getPublicBaseUrl(): string {
  const fromEnv = env.NEXTAUTH_URL?.trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  const vercel = process.env.VERCEL_URL?.trim().replace(/\/$/, "");
  if (vercel) return vercel.startsWith("http") ? vercel : `https://${vercel}`;
  return "http://localhost:3000";
}
