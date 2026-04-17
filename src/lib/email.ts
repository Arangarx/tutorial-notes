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
    return null;
  }
}

/** Per-tutor Gmail connection. */
export async function getGmailConnectionForTutor(adminUserId: string | null): Promise<{ refreshToken: string; email: string } | null> {
  if (!hasOAuthEmailConnectionModel()) return null;
  try {
    const row = await db.oAuthEmailConnection.findFirst({ where: { provider: "gmail", adminUserId } });
    return row ? { refreshToken: row.refreshToken, email: row.email } : null;
  } catch {
    return null;
  }
}

async function getTransportAndFrom(adminUserId?: string | null): Promise<{ transport: nodemailer.Transporter; fromEmail: string } | null> {
  const gmail = adminUserId !== undefined
    ? await getGmailConnectionForTutor(adminUserId)
    : await getGmailConnection();
  if (gmail) {
    const transport = await createGmailTransport(gmail.refreshToken, gmail.email);
    if (transport) return { transport, fromEmail: gmail.email };
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

  const configWhere = adminUserId !== undefined ? { adminUserId } : {};
  const dbConfig = await db.emailConfig.findFirst({ where: configWhere, orderBy: { updatedAt: "desc" } });
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

/** Per-tutor check: is email configured for this specific tutor? */
export async function isEmailConfiguredForTutor(adminUserId: string | null): Promise<boolean> {
  const gmail = await getGmailConnectionForTutor(adminUserId);
  if (gmail) return true;
  if (!hasEmailConfigModel()) return isEmailConfigured();
  const dbConfig = await db.emailConfig.findFirst({ where: { adminUserId } });
  if (dbConfig) return true;
  return isEmailConfigured();
}

export async function sendMail(options: {
  to: string;
  subject: string;
  text: string;
  from?: string;
  fromDisplayName?: string | null;
  adminUserId?: string | null;
}): Promise<{ sent: boolean; error?: string }> {
  const gmail = options.adminUserId !== undefined
    ? await getGmailConnectionForTutor(options.adminUserId)
    : await getGmailConnection();
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

  const transportResult = await getTransportAndFrom(options.adminUserId);
  if (!transportResult) return { sent: false };

  const emailAddr = options.from ?? transportResult.fromEmail;
  const dn = options.fromDisplayName?.trim()
    ? asciiEmailDisplayName(options.fromDisplayName.trim())
    : "";
  const from = dn
    ? `"${dn.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}" <${emailAddr}>`
    : emailAddr;

  try {
    await transportResult.transport.sendMail({
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
