import nodemailer from "nodemailer";
import { db } from "@/lib/db";
import { env, isEmailConfigured } from "./env";
import { createGmailTransport } from "./gmail-transport";
import { asciiEmailDisplayName, sendViaGmailApi } from "./gmail-api-send";

let _transport: nodemailer.Transporter | null = null;

function buildTransportFromConfig(config: {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
}) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.password },
  });
}

function hasEmailConfigModel(): boolean {
  return typeof (db as { emailConfig?: { findFirst: unknown } }).emailConfig?.findFirst === "function";
}

function hasOAuthEmailConnectionModel(): boolean {
  return typeof (db as { oAuthEmailConnection?: { findFirst: unknown } }).oAuthEmailConnection?.findFirst === "function";
}

/** Returns Gmail OAuth connection or null if table missing / no row. Safe to call before db push. */
export async function getGmailConnection(): Promise<{ refreshToken: string; email: string } | null> {
  if (!hasOAuthEmailConnectionModel()) return null;
  try {
    const row = await db.oAuthEmailConnection.findFirst({ where: { provider: "gmail" } });
    return row ? { refreshToken: row.refreshToken, email: row.email } : null;
  } catch {
    return null; // e.g. table does not exist yet (run prisma db push)
  }
}

async function getTransportAndFrom(): Promise<{ transport: nodemailer.Transporter; fromEmail: string } | null> {
  const gmail = await getGmailConnection();
  if (gmail) {
    const transport = await createGmailTransport(gmail.refreshToken, gmail.email);
    if (transport) return { transport, fromEmail: gmail.email };
    // Gmail connected but transport failed (e.g. env vars missing or token invalid). Do not fall back to SMTP.
    return null;
  }

  if (!hasEmailConfigModel()) {
    if (isEmailConfigured()) {
      if (!_transport) {
        const port = env.SMTP_PORT ? parseInt(env.SMTP_PORT, 10) : 587;
        _transport = nodemailer.createTransport({
          host: env.SMTP_HOST!,
          port: Number.isNaN(port) ? 587 : port,
          secure: env.SMTP_SECURE === "true",
          auth: { user: env.SMTP_USER!, pass: env.SMTP_PASS! },
        });
      }
      const from =
        env.SMTP_FROM ?? env.SMTP_USER ?? "noreply@tutoring-notes.local";
      return { transport: _transport, fromEmail: from };
    }
    return null;
  }
  const dbConfig = await db.emailConfig.findFirst({ orderBy: { updatedAt: "desc" } });
  if (dbConfig) {
    const transport = buildTransportFromConfig({
      host: dbConfig.host,
      port: dbConfig.port,
      secure: dbConfig.secure,
      user: dbConfig.user,
      password: dbConfig.password,
    });
    const from = dbConfig.fromEmail ?? dbConfig.user;
    return { transport, fromEmail: from };
  }
  if (isEmailConfigured()) {
    if (!_transport) {
      const port = env.SMTP_PORT ? parseInt(env.SMTP_PORT, 10) : 587;
      _transport = nodemailer.createTransport({
        host: env.SMTP_HOST!,
        port: Number.isNaN(port) ? 587 : port,
        secure: env.SMTP_SECURE === "true",
        auth: { user: env.SMTP_USER!, pass: env.SMTP_PASS! },
      });
    }
    const from = env.SMTP_FROM ?? env.SMTP_USER ?? "noreply@tutoring-notes.local";
    return { transport: _transport, fromEmail: from };
  }
  return null;
}

export async function isEmailConfiguredAny(): Promise<boolean> {
  const gmail = await getGmailConnection();
  if (gmail) return true;
  if (!hasEmailConfigModel()) return isEmailConfigured();
  const dbConfig = await db.emailConfig.findFirst();
  if (dbConfig) return true;
  return isEmailConfigured();
}

export async function sendMail(options: {
  to: string;
  subject: string;
  text: string;
  /** Full From address or email only; if display name is set, pass via fromDisplayName for Gmail API. */
  from?: string;
  /** Shown as "Name" <fromEmail> in Gmail; ignored if using plain SMTP without from string. */
  fromDisplayName?: string | null; // omit or null to send with address only (rare)
}): Promise<{ sent: boolean; error?: string }> {
  const gmail = await getGmailConnection();
  if (gmail) {
    const result = await sendViaGmailApi(gmail.refreshToken, gmail.email, {
      to: options.to,
      subject: options.subject,
      text: options.text,
      fromDisplayName: options.fromDisplayName,
    });
    if (result.sent) return { sent: true };
    if (result.error) return { sent: false, error: result.error };
  }

  const result = await getTransportAndFrom();
  if (!result) return { sent: false };

  const emailAddr = options.from ?? result.fromEmail;
  const dn = options.fromDisplayName?.trim()
    ? asciiEmailDisplayName(options.fromDisplayName.trim())
    : "";
  const from = dn
    ? `"${dn.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}" <${emailAddr}>`
    : emailAddr;

  try {
    await result.transport.sendMail({
      from,
      to: options.to,
      subject: options.subject,
      text: options.text,
    });
    return { sent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { sent: false, error: message };
  }
}
