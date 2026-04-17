import Link from "next/link";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { authOptions } from "@/auth-options";
import { isGmailConnectAllowedForEmail } from "@/lib/gmail-connect-allowed";
import { isEmailConfiguredAny, getGmailConnection } from "@/lib/email";
import { requireOperator } from "@/lib/operator";
import { disconnectGmail } from "./actions";
import EmailConfigForm from "./EmailConfigForm";
import OAuthEmailSection from "./OAuthEmailSection";

export default async function EmailSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const params = await searchParams;
  if (typeof (db as { emailConfig?: { findFirst: unknown } }).emailConfig?.findFirst !== "function") {
    return (
      <div className="card">
        <h1 style={{ marginTop: 0 }}>Email settings</h1>
        <p style={{ color: "#ffd700" }}>
          Prisma client is out of date. Run <code>npx prisma generate</code>, then restart the dev
          server (e.g. <code>npm run dev</code>).
        </p>
        <p className="muted" style={{ marginTop: 12 }}>
          <Link href="/admin/students">← Back to Students</Link>
        </p>
      </div>
    );
  }
  await requireOperator();
  const session = await getServerSession(authOptions);
  const sessionEmail = session?.user?.email ?? null;
  const canUseGmailConnect = isGmailConnectAllowedForEmail(sessionEmail);

  const config = await db.emailConfig.findFirst({ orderBy: { updatedAt: "desc" } });
  const configured = await isEmailConfiguredAny();
  const gmailConnection = await getGmailConnection(); // safe: null if table missing (run prisma db push)
  const googleOAuthAvailable = !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

  return (
    <div className="card">
      <h1 style={{ marginTop: 0 }}>Email settings</h1>
      <p className="muted">
        Choose how to send “Send update” emails. Easiest: connect your Gmail with one click. Or use
        SMTP (Resend, SendGrid, etc.) if you prefer.
      </p>

      {configured ? (
        <p style={{ color: "#90ee90", marginBottom: 16 }}>
          Email is configured. “Send update” will deliver to the recipient’s inbox.
        </p>
      ) : (
        <p style={{ color: "#ffd700", marginBottom: 16 }}>
          Email is not configured. Connect an account or set up SMTP below to actually send.
        </p>
      )}

      <OAuthEmailSection
        gmailConnected={gmailConnection ? { email: gmailConnection.email } : null}
        googleOAuthAvailable={googleOAuthAvailable}
        canUseGmailConnect={canUseGmailConnect}
        connectError={params.error}
        connectSuccess={params.connected}
      />

      <div style={{ marginTop: 32 }}>
        <h3 style={{ marginTop: 0 }}>Or use SMTP</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          For Resend, SendGrid, or your own server. Leave fields empty if you only use Connect Gmail. Leave password blank to keep the existing one.
        </p>
        <EmailConfigForm
          defaultHost={config?.host ?? ""}
          defaultPort={config?.port ?? undefined}
          defaultSecure={config?.secure ?? false}
          defaultUser={config?.user ?? ""}
          defaultFromEmail={config?.fromEmail ?? ""}
        />
      </div>

      <p className="muted" style={{ marginTop: 24, fontSize: 14 }}>
        <Link href="/admin/settings">← All settings</Link>
        {" · "}
        <Link href="/admin/students">Students</Link>
      </p>
    </div>
  );
}
