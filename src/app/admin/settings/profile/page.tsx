import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth-options";
import { getAdminByEmail } from "@/lib/auth-db";
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
      <p className="muted" style={{ marginTop: 24, fontSize: 14 }}>
        <Link href="/admin/students">← Back to Students</Link>
      </p>
    </div>
  );
}
