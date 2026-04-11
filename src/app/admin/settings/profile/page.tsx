import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth-options";
import { getAdminByEmail } from "@/lib/auth-db";
import ChangePasswordForm from "./ChangePasswordForm";
import ProfileForm from "./ProfileForm";

export default async function ProfileSettingsPage() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) {
    return (
      <div className="card">
        <p>Sign in to edit your profile.</p>
        <Link href="/login">Login</Link>
      </div>
    );
  }
  const admin = await getAdminByEmail(email);

  return (
    <div className="card">
      <h1 style={{ marginTop: 0 }}>Profile</h1>
      <p className="muted">
        Signed in as <strong>{email}</strong>. Set how parents see you in update emails.
      </p>
      <ProfileForm defaultDisplayName={admin?.displayName ?? ""} />

      <div className="divider" style={{ margin: "28px 0" }} />

      {admin ? (
        <ChangePasswordForm />
      ) : (
        <p className="muted" style={{ fontSize: 14, maxWidth: 480 }}>
          <strong>Password:</strong> This session uses server environment login only. Change{" "}
          <code>ADMIN_PASSWORD</code> in your host settings, or complete <code>/setup</code> to create a
          database account — then you can change your password here or use{" "}
          <Link href="/forgot-password">Forgot your password?</Link> from the login page.
        </p>
      )}

      <p className="muted" style={{ marginTop: 24, fontSize: 14 }}>
        <Link href="/admin/settings">← All settings</Link>
        {" · "}
        <Link href="/admin/students">Students</Link>
      </p>
    </div>
  );
}
