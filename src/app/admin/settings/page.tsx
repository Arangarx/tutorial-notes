import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth-options";
import { isOperatorEmail } from "@/lib/operator";

export const dynamic = "force-dynamic";

export default async function SettingsIndexPage() {
  const session = await getServerSession(authOptions);
  const operator = isOperatorEmail(session?.user?.email);

  return (
    <div className="card">
      <h1 style={{ marginTop: 0 }}>Settings</h1>
      <p className="muted">Your profile and account settings.</p>

      <div style={{ display: "grid", gap: 12, marginTop: 20, maxWidth: 480 }}>
        <Link href="/admin/settings/profile" className="card" style={{ textDecoration: "none", display: "block" }}>
          <div style={{ fontWeight: 700 }}>Profile</div>
          <p className="muted" style={{ margin: "8px 0 0", fontSize: 14 }}>
            Your name, password, and account email.
          </p>
        </Link>
        {operator ? (
          <Link href="/admin/settings/email" className="card" style={{ textDecoration: "none", display: "block" }}>
            <div style={{ fontWeight: 700 }}>Email</div>
            <p className="muted" style={{ margin: "8px 0 0", fontSize: 14 }}>
              Connect Gmail or SMTP so "Send update" and password reset emails deliver.
            </p>
          </Link>
        ) : null}
      </div>

      <p className="muted" style={{ marginTop: 24, fontSize: 14 }}>
        <Link href="/admin/students">← Back to Students</Link>
      </p>
    </div>
  );
}
