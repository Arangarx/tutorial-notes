import { db } from "@/lib/db";
import { requireOperator } from "@/lib/operator";

export const dynamic = "force-dynamic";

export default async function OutboxPage() {
  await requireOperator();
  const messages = await db.emailMessage.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="card">
      <h1 style={{ marginTop: 0 }}>Outbox</h1>
      <p className="muted">
        Sent and queued email messages. Use this to review what was sent and to copy share links if
        needed.
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
                <a className="btn" href={m.linkUrl} target="_blank" rel="noreferrer">
                  Open link
                </a>
              </div>
              <div style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>{m.bodyText}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

