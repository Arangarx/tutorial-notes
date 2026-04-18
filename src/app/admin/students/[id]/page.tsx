import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import {
  regenerateShareLink,
  revokeShareLink,
} from "./actions";
import SendUpdateForm from "./SendUpdateForm";
import { canAccessStudentRow, getStudentScope } from "@/lib/student-scope";
import { ShareLinkRow } from "./ShareLinkRow";
import { SubmitButton } from "@/components/SubmitButton";
import { StudentActions } from "./StudentActions";
import { NoteCardActions } from "./NoteCardActions";
import NoteEntrySection from "./NoteEntrySection";
import { env } from "@/lib/env";

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

  const scope = await getStudentScope();
  if (scope.kind === "none") redirect("/login");

  const student = await db.student.findUnique({
    where: { id },
    include: {
      notes: { orderBy: { date: "desc" }, take: 20 },
      shareLinks: { where: { revokedAt: null }, orderBy: { createdAt: "desc" } },
    },
  });

  if (!student) notFound();
  if (!canAccessStudentRow(scope, student)) notFound();

  const activeShare = student.shareLinks[0] ?? null;

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div className="muted" style={{ fontSize: 12 }}>
            <Link href="/admin/students">Students</Link> / {student.name}
          </div>
          <h1 style={{ margin: "6px 0 0" }}>{student.name}</h1>
        </div>
        <div className="row">
          <StudentActions studentId={student.id} currentName={student.name} />
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
            {(() => {
              const url = `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/s/${activeShare.token}`;
              return (
                <>
                  <ShareLinkRow url={url} />
                  <div className="row" style={{ marginTop: 8 }}>
                    <form action={regenerateShareLink.bind(null, student.id)}>
                      <SubmitButton label="Regenerate" pendingLabel="Regenerating…" />
                    </form>
                    <form action={revokeShareLink.bind(null, student.id)}>
                      <SubmitButton label="Revoke" pendingLabel="Revoking…" className="btn" />
                    </form>
                  </div>
                </>
              );
            })()}
          </>
        ) : (
          <div className="row" style={{ justifyContent: "space-between" }}>
            <p className="muted" style={{ margin: 0 }}>
              No active share link yet.
            </p>
            <form action={regenerateShareLink.bind(null, student.id)}>
              <SubmitButton label="Create share link" />
            </form>
          </div>
        )}
      </div>

      <div className="divider" />

      <NoteEntrySection studentId={student.id} aiEnabled={!!env.OPENAI_API_KEY} blobEnabled={!!env.BLOB_READ_WRITE_TOKEN} />

      <div className="divider" />

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Send update email</h3>
        <p className="muted">
          Sends the share link to the parent. The parent email address is saved for this student
          for next time.
        </p>
        <SendUpdateForm studentId={student.id} defaultToEmail={student.parentEmail} />
      </div>

      <div className="divider" />

      <h3 style={{ marginTop: 0 }}>Recent notes</h3>
      {student.notes.length === 0 ? (
        <p className="muted">No notes yet.</p>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {student.notes.map((n) => {
            const links = safeJsonArray(n.linksJson);
            return (
              <div key={n.id} className="card">
                <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>
                      {new Date(n.date).toLocaleDateString()}
                    </div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                      Status: {n.status}
                    </div>
                  </div>
                  <NoteCardActions
                    noteId={n.id}
                    studentId={student.id}
                    status={n.status}
                    sentAt={n.sentAt ? n.sentAt.toISOString() : null}
                    defaultValues={{
                      date: formatDateInput(n.date),
                      template: n.template ?? "",
                      topics: n.topics,
                      homework: n.homework,
                      nextSteps: n.nextSteps,
                      links: safeJsonArray(n.linksJson).join("\n"),
                    }}
                  />
                </div>

                <div className="divider" />

                <div style={{ display: "grid", gap: 10 }}>
                  <div>
                    <div className="muted" style={{ fontSize: 12 }}>Topics</div>
                    <div style={{ whiteSpace: "pre-wrap" }}>{n.topics || <span className="muted">—</span>}</div>
                  </div>
                  <div>
                    <div className="muted" style={{ fontSize: 12 }}>Homework</div>
                    <div style={{ whiteSpace: "pre-wrap" }}>{n.homework || <span className="muted">—</span>}</div>
                  </div>
                  <div>
                    <div className="muted" style={{ fontSize: 12 }}>Next steps</div>
                    <div style={{ whiteSpace: "pre-wrap" }}>{n.nextSteps || <span className="muted">—</span>}</div>
                  </div>
                  {links.length > 0 && (
                    <div>
                      <div className="muted" style={{ fontSize: 12 }}>Links</div>
                      <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                        {links.map((u) => (
                          <li key={u}>
                            <a href={u} target="_blank" rel="noreferrer">{u}</a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
