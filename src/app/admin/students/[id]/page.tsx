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
import { ActiveWhiteboardSessionsList } from "./whiteboard/ActiveWhiteboardSessionsList";
import { StartWhiteboardSession } from "./whiteboard/StartWhiteboardSession";
import { StudentRecordingDefaultToggle } from "./StudentRecordingDefaultToggle";
import { env } from "@/lib/env";
import { formatDateOnlyDisplay } from "@/lib/date-only";

export const dynamic = "force-dynamic";

/**
 * Whisper + LLM can exceed default ~10s serverless limits.
 *
 * Budget for a worst-case ~60-minute single audio upload on this page:
 *   blob download   ~10 s
 *   ffmpeg split    ~40 s   (3–4 parts for a 60-min recording)
 *   Whisper calls   ~3–4 min (each ~22 MB chunk runs ~50–70 s sequentially)
 *   AI structuring  ~15 s
 *   ─────────────────────
 *   total           ~5 min
 *
 * 300 s (Vercel Pro maximum, also the cap on Hobby) gives us the full budget.
 * Anything beyond ~60 min would need to be split into a queue/worker pattern.
 *
 * This timeout applies to all server actions invoked from this page,
 * including transcribeAndGenerateAction. Vercel clamps to plan limits, so
 * a value larger than 300 is safe to set but will be capped.
 */
export const maxDuration = 300;

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
      // Still-running whiteboard rooms (endedAt = null) — surfaced under
      // the "Start" button so tutors can continue or end stragglers
      // without multiple forgotten live sessions piling up in the DB.
      whiteboardSessions: {
        where: { endedAt: null },
        orderBy: { startedAt: "desc" },
        take: 20,
        select: { id: true, startedAt: true },
      },
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
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div>
            <h3 style={{ margin: 0 }}>Whiteboard session</h3>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
              Live whiteboard with audio recording for tutoring sessions.
              Generates session notes from what you wrote and said.
            </p>
          </div>
          <StartWhiteboardSession studentId={student.id} />
        </div>
        <ActiveWhiteboardSessionsList
          studentId={student.id}
          sessions={student.whiteboardSessions}
        />
        <div style={{ marginTop: 10 }}>
          <StudentRecordingDefaultToggle
            studentId={student.id}
            initialEnabled={student.recordingDefaultEnabled}
          />
        </div>
      </div>

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
