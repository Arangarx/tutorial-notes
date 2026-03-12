import { redirect } from "next/navigation";
import { hasAdminUsers } from "@/lib/auth-db";
import SetupForm from "./SetupForm";

export default async function SetupPage() {
  const hasAdmins = await hasAdminUsers();
  if (hasAdmins) redirect("/login");

  return (
    <div className="container" style={{ maxWidth: 560 }}>
      <div className="card">
        <h1 style={{ marginTop: 0 }}>Create admin account</h1>
        <p className="muted" style={{ marginTop: 0 }}>
          No admin account exists yet. Create the first one to sign in. Use a strong password.
        </p>
        <SetupForm />
      </div>
    </div>
  );
}
