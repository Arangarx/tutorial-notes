import Link from "next/link";

export const dynamic = "force-dynamic";

// Defensive: table may not exist if migration hasn't run yet.
async function getWaitlistEntries() {
  try {
    const { db } = await import("@/lib/db");
    return await db.waitlistEntry.findMany({ orderBy: { createdAt: "desc" } });
  } catch {
    return [];
  }
}

export default async function AdminWaitlistPage() {
  const entries = await getWaitlistEntries();

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Waitlist</h1>
        <Link className="btn" href="/admin">Dashboard</Link>
      </div>
      <p className="muted" style={{ marginTop: 8 }}>
        People who signed up for early access from the landing page.
      </p>

      <div className="divider" />

      {entries.length === 0 ? (
        <p className="muted">No signups yet.</p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {entries.map((e) => (
            <div key={e.id} className="card">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{e.email}</div>
                  {e.name && <div className="muted" style={{ fontSize: 13 }}>{e.name}</div>}
                  {e.note && <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{e.note}</div>}
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {new Date(e.createdAt).toLocaleDateString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
