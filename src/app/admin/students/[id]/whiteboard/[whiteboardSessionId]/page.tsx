import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth-options";
import { db, withDbRetry } from "@/lib/db";
import { assertStudentNotErased } from "@/lib/erasure/assert-student-not-erased";
import { assertOwnsWhiteboardSession } from "@/lib/whiteboard-scope";
import WhiteboardReplay from "@/components/whiteboard/WhiteboardReplay";
import TutorNotesSection from "@/components/whiteboard/TutorNotesSection";
import { SessionCostPanel } from "@/components/admin/SessionCostPanel";
import { getSessionCostBreakdown } from "@/lib/observability/cost-queries";
import { loadTutorNoteForReview } from "@/app/admin/students/[id]/whiteboard/notes-actions";
import { buildReplayAudioPayload } from "@/lib/whiteboard/replay-audio-payload";
import { formatClockDuration } from "@/lib/time/format-duration-ms";

export const dynamic = "force-dynamic";

/**
 * 300s budget (Vercel Pro ceiling) — consistent with workspace page.
 * Required because deleteWhiteboardSessionAndDataAction runs a cascade
 * transaction that can touch many TranscriptChunk / recording rows, and
 * must complete within the route's maxDuration window.
 * Documented in docs/PLATFORM-ASSUMPTIONS.md §1.1.
 */
export const maxDuration = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; whiteboardSessionId: string }>;
}): Promise<Metadata> {
  const { whiteboardSessionId } = await params;
  return {
    title: `Whiteboard review — ${whiteboardSessionId.slice(0, 8)}`,
    robots: { index: false, follow: false },
  };
}

/**
 * Admin whiteboard review page.
 *
 * Route: /admin/students/[id]/whiteboard/[whiteboardSessionId]
 *
 * Shown after a session ends (when the workspace page redirects here)
 * or when the tutor revisits a past session from the student detail
 * page. Mounts the shared `<WhiteboardReplay>` component wired to the
 * proxied event-log + snapshot URLs.
 *
 * Trust posture:
 *   - `assertOwnsWhiteboardSession` ensures the logged-in tutor owns
 *     this session. Multi-tenant guard.
 *   - studentId URL param is cross-checked against the session row to
 *     prevent path-traversal across students.
 *   - URLs handed to the replay component are the proxy routes
 *     (`/api/whiteboard/[id]/events`, `/api/whiteboard/[id]/snapshot`)
 *     so the raw Blob URLs are never surfaced in the page HTML.
 *   - Audio served via `/api/audio/admin/[recordingId]` (existing
 *     admin-scoped audio proxy).
 *
 * wbsid= logging: the page title and console.log below carry
 * wbsid= so admin-side replays appear in observability.
 */
type RouteParams = { id: string; whiteboardSessionId: string };

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function WhiteboardReviewPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { id: studentId, whiteboardSessionId } = await params;

  console.log(
    `[wbReview.page] wbsid=${whiteboardSessionId} studentId=${studentId}`
  );

  // Ownership check — 404 on miss or cross-tutor.
  const session = await assertOwnsWhiteboardSession(whiteboardSessionId);

  if (session.studentId !== studentId) {
    console.warn(
      `[wbReview.page] wbsid=${whiteboardSessionId} studentId mismatch: ` +
        `url=${studentId} row=${session.studentId}`
    );
    notFound();
  }

  await assertStudentNotErased(session.studentId);

  // Fetch display columns.
  const detail = await withDbRetry(
    () =>
      db.whiteboardSession.findUnique({
        where: { id: whiteboardSessionId },
        select: {
          id: true,
          startedAt: true,
          endedAt: true,
          durationSeconds: true,
          noteId: true,
          eventsSchemaVersion: true,
          snapshotBlobUrl: true,
          concatBlobUrl: true,
          concatDurationSeconds: true,
          student: { select: { id: true, name: true } },
          audioRecordings: {
            select: {
              id: true,
              mimeType: true,
              durationSeconds: true,
              orderIndex: true,
            },
            orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
          },
        },
      }),
    { label: "wbReview.page.detail" }
  );
  if (!detail) notFound();

  // Ended sessions use in-shell SessionReviewMode + WhiteboardReplayInFrame.
  if (detail.endedAt) {
    redirect(
      `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace?surface=replay`
    );
  }

  const eventsApiUrl = `/api/whiteboard/${whiteboardSessionId}/events`;
  const snapshotApiUrl = `/api/whiteboard/${whiteboardSessionId}/snapshot`;
  const replayAudio = buildReplayAudioPayload({
    whiteboardSessionId,
    concatBlobUrl: detail.concatBlobUrl,
    concatDurationSeconds: detail.concatDurationSeconds,
    audioRecordings: detail.audioRecordings,
    audience: "admin",
  });
  const audioSegments = replayAudio.audioSegments;

  const sessionLabel = `Recording of ${detail.student.name} — ${formatDate(detail.startedAt)}`;
  const recordingDurationSeconds = replayAudio.canonicalDurationSeconds
    ? replayAudio.canonicalDurationSeconds
    : detail.audioRecordings.reduce((sum, rec) => sum + (rec.durationSeconds ?? 0), 0);
  const durationLabel =
    recordingDurationSeconds > 0
      ? formatClockDuration(recordingDurationSeconds, { padMinutes: false })
      : detail.durationSeconds
        ? formatClockDuration(detail.durationSeconds, { padMinutes: false })
        : null;

  const isLive = !detail.endedAt;

  // Load TutorNote for auto-notes section (ownership already asserted above).
  const tutorNote = !isLive
    ? await loadTutorNoteForReview(whiteboardSessionId)
    : null;

  const initialNote = tutorNote
    ? {
        found: true as const,
        status: tutorNote.status,
        content: tutorNote.content ?? null,
        isPartial: tutorNote.isPartial,
        error: tutorNote.error ?? null,
        generatedAt: tutorNote.generatedAt?.toISOString() ?? null,
      }
    : { found: false as const };

  // Fetch the linked SessionNote status (if any) to gate the "View attached note"
  // link — only show for READY/SENT notes (not DRAFT which is the review-page subject).
  const linkedNoteStatus =
    detail.noteId
      ? await withDbRetry(
          () =>
            db.sessionNote.findUnique({
              where: { id: detail.noteId! },
              select: { status: true },
            }),
          { label: "wbReview.page.noteStatus" }
        ).then((n) => n?.status ?? null)
      : null;

  // Cost panel visibility gate — must NOT be shown to real non-test tutors (Sarah).
  // Show only when the viewer is:
  //   (a) an ADMIN-role account (Andrew, the operator) — not impersonating
  //   (b) an admin actively impersonating a test account (Andrew testing as Sarah)
  //   (c) a test-marked account (isTestAccount=true — QA accounts)
  // A real TUTOR-role account with isTestAccount=false must never see API costs.
  // Note: we include role==="ADMIN" so Andrew can always see his own session costs
  // without needing to impersonate — this is a judgment call, flagged in the
  // smoke report.
  const viewerSession = await getServerSession(authOptions);
  const showCostPanel =
    viewerSession?.user?.role === "ADMIN" ||
    viewerSession?.user?.isImpersonating === true ||
    viewerSession?.user?.isTestAccount === true;

  const sessionCost = !isLive && showCostPanel
    ? await getSessionCostBreakdown(whiteboardSessionId)
    : null;

  return (
    <div className="container" style={{ maxWidth: 1280 }}>
      {/* Header */}
      <div
        className="row"
        style={{
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 12,
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div>
          <Link href={`/admin/students/${studentId}`} className="muted">
            ← Back to {detail.student.name}
          </Link>
          <h1 style={{ margin: "6px 0 0" }}>
            Whiteboard — {detail.student.name}
          </h1>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
            {formatDate(detail.startedAt)}
            {durationLabel && ` · ${durationLabel}`}
            {isLive && (
              <span
                style={{
                  marginLeft: 8,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  color: "var(--error)",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: "var(--error)",
                    display: "inline-block",
                  }}
                />
                Session still in progress
              </span>
            )}
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {detail.noteId && linkedNoteStatus && linkedNoteStatus !== "DRAFT" && (
            <Link
              href={`/admin/students/${studentId}/notes`}
              className="btn"
            >
              View attached note
            </Link>
          )}
          {isLive && (
            <Link
              href={`/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`}
              className="btn primary"
            >
              Return to live session
            </Link>
          )}
        </div>
      </div>

      {/* Session info card */}
      {isLive && (
        <div
          className="card"
          style={{
            padding: "10px 14px",
            background: "var(--warning-soft)",
            border: "1px solid var(--warning-border)",
            fontSize: 13,
            marginBottom: 12,
          }}
        >
          This session is still in progress. The event log shown below
          reflects what was recorded up to the last checkpoint. End the
          session from the workspace to save the final recording.
        </div>
      )}

      {/* Replay */}
      <WhiteboardReplay
        eventsBlobUrl={eventsApiUrl}
        audioSegments={audioSegments}
        canonicalAudioBlobUrl={replayAudio.canonicalAudioBlobUrl}
        canonicalAudioMimeType={replayAudio.canonicalAudioMimeType}
        canonicalDurationSeconds={replayAudio.canonicalDurationSeconds}
        snapshotBlobUrl={detail.snapshotBlobUrl ? snapshotApiUrl : null}
        title={sessionLabel}
        whiteboardSessionId={whiteboardSessionId}
      />

      {/* Auto-generated session notes (slice 3 — no manual button required) */}
      {!isLive && (
        <div style={{ marginTop: 16 }}>
          <TutorNotesSection
            whiteboardSessionId={whiteboardSessionId}
            studentId={studentId}
            initialNote={initialNote}
            hasAudio={detail.audioRecordings.length > 0}
          />
        </div>
      )}

      {sessionCost ? (
        <SessionCostPanel
          whisperMinutes={sessionCost.whisperMinutes}
          whisperUsd={sessionCost.whisperUsd}
          gptInputTokens={sessionCost.gptInputTokens}
          gptOutputTokens={sessionCost.gptOutputTokens}
          gptUsd={sessionCost.gptUsd}
          blobEgressBytes={sessionCost.blobEgressBytes}
          blobEgressUsd={sessionCost.blobEgressUsd}
          blobStorageUsd={sessionCost.blobStorageUsd}
          computeUsd={sessionCost.computeUsd}
          totalUsd={sessionCost.totalUsd}
        />
      ) : null}

      {/* Footer meta */}
      <div
        className="muted"
        style={{ fontSize: 11, textAlign: "right", marginTop: 8 }}
      >
        wbsid={whiteboardSessionId.slice(0, 8)} · schema v
        {detail.eventsSchemaVersion}
      </div>
    </div>
  );
}
