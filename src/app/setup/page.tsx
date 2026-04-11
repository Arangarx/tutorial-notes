import Link from "next/link";
import { redirect } from "next/navigation";
import { hasAdminUsers } from "@/lib/auth-db";
import {
  setupBlockedNoSecretInProduction,
  setupReachableWithoutToken,
  setupTokenValid,
} from "@/lib/setup-guard";
import SetupForm from "./SetupForm";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ token?: string | string[] }>;
};

function tokenFromSearch(sp: { token?: string | string[] }): string | undefined {
  const t = sp.token;
  if (typeof t === "string") return t;
  if (Array.isArray(t)) return t[0];
  return undefined;
}

export default async function SetupPage({ searchParams }: Props) {
  const hasAdmins = await hasAdminUsers();
  if (hasAdmins) redirect("/login");

  const sp = await searchParams;
  const token = tokenFromSearch(sp);

  if (setupBlockedNoSecretInProduction()) {
    return (
      <div className="container" style={{ maxWidth: 560 }}>
        <div className="card">
          <h1 style={{ marginTop: 0 }}>First-time admin</h1>
          <p className="muted" style={{ marginTop: 0 }}>
            Public signup for the first admin is disabled in production until you configure a setup secret.
          </p>
          <p style={{ marginTop: 12 }}>
            <strong>Option A — recommended:</strong> In Vercel (or your host), set{" "}
            <code>SETUP_SECRET</code> to a long random string, redeploy, then open{" "}
            <code>/setup?token=…</code> with that same value and create your admin.
          </p>
          <p style={{ marginTop: 12 }}>
            <strong>Option B:</strong> Set <code>ADMIN_EMAIL</code> and <code>ADMIN_PASSWORD</code> in
            environment variables, redeploy, then sign in at <Link href="/login">/login</Link> — then add a
            real DB admin from the app if needed, or keep using env bootstrap (see README).
          </p>
          <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>
            See <code>docs/DEPLOY.md</code> for the full checklist.
          </p>
        </div>
      </div>
    );
  }

  if (!setupReachableWithoutToken() && !setupTokenValid(token)) {
    return (
      <div className="container" style={{ maxWidth: 560 }}>
        <div className="card">
          <h1 style={{ marginTop: 0 }}>Setup link required</h1>
          <p className="muted" style={{ marginTop: 0 }}>
            Open <code>/setup?token=…</code> using the same value as the <code>SETUP_SECRET</code>{" "}
            environment variable.
          </p>
          <p style={{ marginTop: 12 }}>
            <Link href="/login">Back to login</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ maxWidth: 560 }}>
      <div className="card">
        <h1 style={{ marginTop: 0 }}>Create admin account</h1>
        <p className="muted" style={{ marginTop: 0 }}>
          No admin account exists yet. Create the first one to sign in. Use a strong password.
        </p>
        <SetupForm setupToken={token ?? ""} />
      </div>
    </div>
  );
}
