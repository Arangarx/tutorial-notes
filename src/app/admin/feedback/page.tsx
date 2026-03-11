import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminFeedbackPage() {
  const items = await db.feedbackItem.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="card">
      <h1 style={{ marginTop: 0 }}>Feedback</h1>
      <p className="muted">
        Stored locally. For now you can copy/paste or use Prisma Studio for export.
      </p>

      <div className="divider" />

      {items.length === 0 ? (
        <p className="muted">No feedback yet.</p>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {items.map((f) => (
            <div key={f.id} className="card">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{f.kind}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    {new Date(f.createdAt).toLocaleString()}
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

