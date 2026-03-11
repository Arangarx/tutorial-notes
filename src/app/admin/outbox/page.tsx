import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function OutboxPage() {
  const messages = await db.emailMessage.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="card">
      <h1 style={{ marginTop: 0 }}>Outbox (dev)</h1>
      <p className="muted">
        This is a local preview of “sent” emails for the MVP. It allows end-to-end
        testing of the email flow without external providers.
      </p>

      <div className="divider" />

      {messages.length === 0 ? (
        <p className="muted">No messages yet.</p>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {messages.map((m) => (
            <div key={m.id} className="card">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{m.subject}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    To {m.toEmail} • {new Date(m.createdAt).toLocaleString()}
                  </div>
                </div>
              </div>
              <div className="divider" />
              <div className="row">
                <input readOnly value={m.linkUrl} />
              </div>
              <div style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>{m.bodyText}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

