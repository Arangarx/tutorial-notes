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
import NoteEntrySection from "./NoteEntrySection";
import { env } from "@/lib/env";
import { formatDateOnlyDisplay } from "@/lib/date-only";

export const dynamic = "force-dynamic";

/**
 * Whisper + LLM can exceed default ~10s serverless limits.
 * Vercel caps this by plan (e.g. 60s Hobby, 300s Pro) — higher values are clamped.
 */
export const maxDuration = 120;

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
      shareLinks: { where: { revokedAt: null }, orderBy: { createdAt: "desc" } },
      _count: { select: { notes: true } },
      notes: { orderBy: { date: "desc" }, take: 1, select: { date: true } },
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

      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h3 style={{ margin: 0 }}>Session notes</h3>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
            {student._count.notes === 0 ? (
              "No notes yet."
            ) : (
              <>
                {student._count.notes} note{student._count.notes !== 1 ? "s" : ""}
                {student.notes[0] && (
                  <> · last {formatDateOnlyDisplay(student.notes[0].date)}</>
                )}
              </>
            )}
          </p>
        </div>
        <Link className="btn" href={`/admin/students/${id}/notes`}>
          View all notes →
        </Link>
      </div>
    </div>
  );
}
