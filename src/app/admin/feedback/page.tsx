import Link from "next/link";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminFeedbackPage() {
  const items = await db.feedbackItem.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="card">
      <h1 style={{ marginTop: 0 }}>Feedback inbox</h1>
      <p className="muted">
        <strong>This page only lists submissions.</strong> To send feedback yourself (even while signed
        in), use{" "}
        <Link href="/feedback" style={{ fontWeight: 600 }}>
          Send feedback
        </Link>{" "}
        in the top nav — that opens the public <code>/feedback</code> form.
      </p>

      <div className="divider" />

      {items.length === 0 ? (
        <p className="muted">
          No submissions yet.{" "}
          <Link href="/feedback" style={{ textDecoration: "underline", fontWeight: 600 }}>
            Open the public form (/feedback)
          </Link>{" "}
          to send a test — not this URL.
        </p>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {items.map((f) => (
            <div key={f.id} className="card">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{f.kind}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    {new Date(f.createdAt).toLocaleString()}
                    {f.contactEmail ? ` • ${f.contactEmail}` : ""}
                    {f.page ? ` • ${f.page}` : ""}
                  </div>
                </div>
              </div>
              <div className="divider" />
              <div style={{ whiteSpace: "pre-wrap" }}>{f.message}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

