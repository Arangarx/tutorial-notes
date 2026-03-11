import Link from "next/link";
import { requireAdminSession } from "@/lib/require-admin";

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireAdminSession();

  return (
    <div className="container">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="row">
          <Link className="btn" href="/">
            Home
          </Link>
          <Link className="btn" href="/admin/students">
            Students
          </Link>
          <Link className="btn" href="/admin/outbox">
            Outbox
          </Link>
          <Link className="btn" href="/admin/feedback">
            Feedback
          </Link>
        </div>
        <div className="row">
          <Link className="btn" href="/api/auth/signout">
            Sign out
          </Link>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>{children}</div>

      <footer className="muted" style={{ marginTop: 24 }}>
        <Link href="/feedback">Send feedback</Link>
      </footer>
    </div>
  );
}

