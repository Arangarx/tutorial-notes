import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  NEXTAUTH_SECRET: z.string().min(1),
  NEXTAUTH_URL: z.string().min(1).optional(),
  // Optional when using first-run setup (AdminUser in DB)
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(6).optional(),
  /** Production: set a long random value; open /setup?token=… to create first admin. Empty = unset. */
  SETUP_SECRET: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().min(16).optional()
  ),
  // Optional: when set, real email is sent via SMTP
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_SECURE: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().email().optional(),
  // Optional: for "Connect Gmail" OAuth (deployer sets once; users never touch)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  /** Comma-separated admin emails allowed to use Connect Gmail. If unset, all admins may try. Use to keep OAuth off for random signups. */
  GMAIL_CONNECT_ALLOWLIST: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().optional()
  ),
  /** Comma-separated emails that may open global feedback inbox + waitlist. `ADMIN_EMAIL` is always included. */
  OPERATOR_EMAILS: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().optional()
  ),
  /** OpenAI API key. Optional — if absent, AI features degrade gracefully. */
  OPENAI_API_KEY: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().optional()
  ),
  /** Vercel Blob read/write token. Optional — if absent, audio upload is disabled. */
  BLOB_READ_WRITE_TOKEN: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().optional()
  ),
  /**
   * URL of the excalidraw-room sync server (Phase 1 whiteboard live
   * collaboration). Format: `wss://wb.example.com` — no trailing
   * slash. Optional in dev: when unset, the whiteboard runs in
   * tutor-solo mode (no live student join, recording still works).
   * Production must set this; the workspace UI reflects the missing
   * URL with a copy hint pointing at `pipeline-projects/whiteboard-sync/README.md`.
   */
  WHITEBOARD_SYNC_URL: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z
      .string()
      .url()
      .refine((u) => u.startsWith("wss://") || u.startsWith("ws://"), {
        message: "must start with wss:// (prod) or ws:// (dev)",
      })
      .optional()
  ),
});

const parsed = EnvSchema.safeParse({
  DATABASE_URL: process.env.DATABASE_URL,
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
  NEXTAUTH_URL: process.env.NEXTAUTH_URL,
  ADMIN_EMAIL: process.env.ADMIN_EMAIL,
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  SETUP_SECRET: process.env.SETUP_SECRET,
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT,
  SMTP_SECURE: process.env.SMTP_SECURE,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  SMTP_FROM: process.env.SMTP_FROM,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GMAIL_CONNECT_ALLOWLIST: process.env.GMAIL_CONNECT_ALLOWLIST,
  OPERATOR_EMAILS: process.env.OPERATOR_EMAILS,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
  WHITEBOARD_SYNC_URL: process.env.WHITEBOARD_SYNC_URL,
});

if (!parsed.success) {
  throw new Error("Invalid env: " + JSON.stringify(parsed.error.flatten()));
}

export const env = parsed.data;

/** True if SMTP is configured so we can send real email. */
export function isEmailConfigured(): boolean {
  return !!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}
