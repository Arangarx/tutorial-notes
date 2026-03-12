"use client";

import { disconnectGmail } from "./actions";

export default function OAuthEmailSection({
  gmailConnected,
  googleOAuthAvailable,
  connectError,
  connectSuccess,
}: {
  gmailConnected: { email: string } | null;
  googleOAuthAvailable: boolean;
  connectError: string | undefined;
  connectSuccess: string | undefined;
}) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ marginTop: 0 }}>Send with your account</h3>
      <p className="muted" style={{ marginTop: 0 }}>
        Sign in with Google to send from your Gmail. No SMTP setup — one click and you’re done.
      </p>

      {gmailConnected ? (
        <div className="row" style={{ alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ color: "#90ee90" }}>Connected as {gmailConnected.email}</span>
          <form action={disconnectGmail}>
            <button type="submit" className="btn">
              Disconnect Gmail
            </button>
          </form>
        </div>
      ) : googleOAuthAvailable ? (
        <div>
          {/* Full-page navigation so the server redirect to Google is followed; Link would client-navigate and can flash an error on 302 */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/api/auth/gmail/connect" className="btn primary">
            Connect Gmail
          </a>
        </div>
      ) : (
        <p className="muted" style={{ fontSize: 14 }}>
          “Connect Gmail” is available once the app deployer adds Google OAuth credentials (
          <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code>) to the server environment.
          Use SMTP below in the meantime.
        </p>
      )}

      {connectSuccess === "gmail" && (
        <p style={{ color: "#90ee90", marginTop: 12 }}>Gmail connected. You can send from that address now.</p>
      )}
      {connectError === "google_oauth_not_configured" && (
        <p style={{ color: "#ffd700", marginTop: 12 }}>
          Google OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to the server environment, or use SMTP below.
        </p>
      )}
      {connectError === "gmail_denied" && (
        <p style={{ color: "#ffb4b4", marginTop: 12 }}>You declined access. You can try again or use SMTP.</p>
      )}
      {connectError === "no_refresh_token" && (
        <p style={{ color: "#ffb4b4", marginTop: 12 }}>
          Google didn’t return a refresh token. Try disconnecting and connecting again, or use SMTP.
        </p>
      )}
      {connectError === "db_not_ready" && (
        <p style={{ color: "#ffd700", marginTop: 12 }}>
          Run <code>npx prisma generate</code> and <code>npx prisma db push</code>, then try again.
        </p>
      )}

      <p className="muted" style={{ marginTop: 12, fontSize: 14 }}>
        Outlook / Microsoft 365: coming soon. Use Gmail or SMTP for now.
      </p>
    </div>
  );
}
