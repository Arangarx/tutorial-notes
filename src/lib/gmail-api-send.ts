/**
 * Send email via Gmail API (REST) instead of SMTP. Uses the same OAuth token;
 * avoids 535 issues that can occur with Gmail SMTP + OAuth2.
 */
import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { env } from "./env";

/** Normalize subject to ASCII so it displays correctly in all clients (avoids UTF-8-in-header issues). */
function asciiSubject(subject: string): string {
  return subject
    .replace(/\u2013|\u2014/g, "-")   // en-dash, em-dash
    .replace(/[\u2018\u2019]/g, "'")  // curly single quotes
    .replace(/[\u201C\u201D]/g, '"')  // curly double quotes
    .replace(/\u2026/g, "...")        // ellipsis
    .replace(/[^\x00-\x7F]/g, " ")    // replace other non-ASCII with space
    .replace(/\s+/g, " ")             // collapse spaces
    .trim();
}

function buildMimeMessage(from: string, to: string, subject: string, text: string): string {
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${asciiSubject(subject)}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    text,
  ];
  return lines.join("\r\n");
}

function toBase64Url(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function sendViaGmailApi(
  refreshToken: string,
  fromEmail: string,
  options: { to: string; subject: string; text: string }
): Promise<{ sent: boolean; error?: string }> {
  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return { sent: false, error: "Google OAuth not configured" };

  const oauth2Client = new OAuth2Client(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const auth = await oauth2Client.getAccessToken();
  if (!auth.token) return { sent: false, error: "Could not get access token" };

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });
  const raw = buildMimeMessage(fromEmail, options.to, options.subject, options.text);
  const encoded = toBase64Url(Buffer.from(raw, "utf-8"));

  try {
    await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: encoded },
    });
    return { sent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { sent: false, error: message };
  }
}
