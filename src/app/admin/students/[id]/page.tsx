import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import {
  createNote,
  regenerateShareLink,
  revokeShareLink,
  sendUpdateEmail,
  setNoteStatus,
} from "./actions";

export const dynamic = "force-dynamic";

function formatDateInput(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function safeJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const student = await db.student.findUnique({
    where: { id },
    include: {
      notes: { orderBy: { date: "desc" }, take: 20 },
      shareLinks: { where: { revokedAt: null }, orderBy: { createdAt: "desc" } },
    },
  });

  if (!student) notFound();

  const activeShare = student.shareLinks[0] ?? null;

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <div className="muted" style={{ fontSize: 12 }}>
            <Link href="/admin/students">Students</Link> / {student.name}
          </div>
          <h1 style={{ margin: "6px 0 0" }}>{student.name}</h1>
        </div>
        <div className="row">
          <Link className="btn" href="/admin/outbox">
            Outbox
          </Link>
        </div>
      </div>

      <div className="divider" />

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Share link (for parents/students)</h3>
        {activeShare ? (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              This link does not require login. You can revoke/regenerate anytime.
            </p>
            <div className="row">
              {(() => {
                const url = `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/s/${activeShare.token}`;
                return (
                  <>
              <input
                readOnly
                    value={url}
              />
                    <a className="btn" href={url} target="_blank" rel="noreferrer">
                      Open
                    </a>
              <form action={regenerateShareLink.bind(null, student.id)}>
                <button className="btn primary" type="submit">
                  Regenerate
                </button>
              </form>
              <form action={revokeShareLink.bind(null, student.id)}>
                <button className="btn" type="submit">
                  Revoke
                </button>
              </form>
                  </>
                );
              })()}
            </div>
          </>
        ) : (
          <div className="row" style={{ justifyContent: "space-between" }}>
            <p className="muted" style={{ margin: 0 }}>
              No active share link yet.
            </p>
            <form action={regenerateShareLink.bind(null, student.id)}>
              <button className="btn primary" type="submit">
                Create share link
              </button>
            </form>
          </div>
        )}
      </div>

      <div className="divider" />

      <div className="row" style={{ alignItems: "stretch" }}>
        <div className="card" style={{ flex: 1, minWidth: 340 }}>
          <h3 style={{ marginTop: 0 }}>New session note</h3>

          <form action={createNote.bind(null, student.id)}>
            <div className="row">
              <div style={{ flex: 1, minWidth: 200 }}>
                <label>Date</label>
                <input name="date" type="date" defaultValue={formatDateInput(new Date())} />
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label>Template (optional)</label>
                <select name="template" defaultValue="">
                  <option value="">None</option>
                  <option value="Math session">Math session</option>
                  <option value="Reading session">Reading session</option>
                  <option value="Test prep">Test prep</option>
                </select>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <label>Topics covered</label>
              <textarea name="topics" rows={3} placeholder="What did you work on today?" />
            </div>
            <div style={{ marginTop: 12 }}>
              <label>Homework</label>
              <textarea name="homework" rows={3} placeholder="What should they do before next time?" />
            </div>
            <div style={{ marginTop: 12 }}>
              <label>Next steps</label>
              <textarea name="nextSteps" rows={3} placeholder="What’s the plan for next session?" />
            </div>
            <div style={{ marginTop: 12 }}>
              <label>Links (optional, one per line)</label>
              <textarea name="links" rows={3} placeholder="https://..." />
            </div>

            <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
              <button className="btn primary" type="submit">
                Save note
              </button>
            </div>
          </form>
        </div>

        <div className="card" style={{ flex: 1, minWidth: 340 }}>
          <h3 style={{ marginTop: 0 }}>Send update email (dev outbox)</h3>
          <p className="muted">
            This writes to a local outbox for preview. It still validates the full flow.
          </p>
          <form action={sendUpdateEmail.bind(null, student.id)}>
            <label>To</label>
            <input name="toEmail" type="email" placeholder="parent@example.com" required />
            <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
              <button className="btn primary" type="submit">
                Send
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="divider" />

      <h3 style={{ marginTop: 0 }}>Recent notes</h3>
      {student.notes.length === 0 ? (
        <p className="muted">No notes yet.</p>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {student.notes.map((n) => (
            <div key={n.id} className="card">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontWeight: 700 }}>
                    {new Date(n.date).toLocaleDateString()}
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    Status: {n.status}
                    {n.sentAt ? ` • Sent ${new Date(n.sentAt).toLocaleString()}` : ""}
                  </div>
                </div>
                <div className="row">
                  {n.status !== "READY" ? (
                    <form action={setNoteStatus.bind(null, n.id, student.id, "READY")}>
                      <button className="btn" type="submit">
                        Mark ready
                      </button>
                    </form>
                  ) : (
                    <form action={setNoteStatus.bind(null, n.id, student.id, "DRAFT")}>
                      <button className="btn" type="submit">
                        Mark draft
                      </button>
                    </form>
                  )}
                </div>
              </div>

              <div className="divider" />

              <div style={{ display: "grid", gap: 10 }}>
                <div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    Topics
                  </div>
                  <div style={{ whiteSpace: "pre-wrap" }}>{n.topics || <span className="muted">—</span>}</div>
                </div>
                <div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    Homework
                  </div>
                  <div style={{ whiteSpace: "pre-wrap" }}>
                    {n.homework || <span className="muted">—</span>}
                  </div>
                </div>
                <div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    Next steps
                  </div>
                  <div style={{ whiteSpace: "pre-wrap" }}>
                    {n.nextSteps || <span className="muted">—</span>}
                  </div>
                </div>
                {(() => {
                  const links = safeJsonArray(n.linksJson);
                  if (links.length === 0) return null;
                  return (
                    <div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        Links
                      </div>
                      <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                        {links.map((u) => (
                          <li key={u}>
                            <a href={u} target="_blank" rel="noreferrer">
                              {u}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

