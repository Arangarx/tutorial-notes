import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db, withDbRetry } from "@/lib/db";
import { env } from "@/lib/env";
import { assertOwnsWhiteboardSession } from "@/lib/whiteboard-scope";
import { requireStudentScope } from "@/lib/student-scope";
import { WhiteboardWorkspaceClient } from "./WhiteboardWorkspaceClient";

/**
 * Tutor-side live whiteboard workspace.
 *
 * Trust posture (re-read before changing):
 *   - `assertOwnsWhiteboardSession` re-checks the logged-in tutor
 *     owns this session. Multi-tenant gate.
 *   - Re-validates `consentAcknowledged === true` belt-and-suspenders
 *     (the action enforces it on create; this re-check defends
 *     against a row mutated outside the action layer).
 *   - Refuses to serve the workspace for sessions that have already
 *     ended (`endedAt != null`) — those go to the read-only review
 *     surface (separate todo).
 *   - We bounce env-only logins to the admin home with an explanation
 *     because the schema requires an FK to AdminUser.
 *
 * The encryption key for the live-sync E2E layer NEVER touches the
 * server. The client component generates it on first mount and parks
 * it in `window.location.hash` (`#k=...`) so refresh keeps the same
 * key. The "Copy student link" button reuses that key for the
 * student URL.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Whiteboard session",
    robots: { index: false, follow: false },
  };
}

type RouteParams = { id: string; whiteboardSessionId: string };

export default async function WhiteboardWorkspacePage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { id: studentId, whiteboardSessionId } = await params;

  const scope = await requireStudentScope();
  if (scope.kind !== "admin") {
    redirect(
      `/admin?notice=${encodeURIComponent(
        "Whiteboard sessions require a registered admin account."
      )}`
    );
  }

  const session = await assertOwnsWhiteboardSession(whiteboardSessionId);

  if (session.studentId !== studentId) {
    // The URL says studentId X but the session row points at Y. Don't
    // silently redirect — just 404 so we never serve cross-student data.
    notFound();
  }
  if (!session.consentAcknowledged) {
    // Defence-in-depth — the action enforces this on create.
    notFound();
  }
  if (session.endedAt) {
    redirect(
      `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}`
    );
  }

  // Pull a few extra columns we need for the UI shell. We could push
  // these into the scope helper but keeping them here means the scope
  // helper stays tight and reusable.
  const detail = await withDbRetry(
    () =>
      db.whiteboardSession.findUnique({
        where: { id: whiteboardSessionId },
        select: {
          id: true,
          startedAt: true,
          bothConnectedAt: true,
          activeMs: true,
          lastActiveAt: true,
          eventsBlobUrl: true,
          // Per-student "Start with recording on?" default — biases the
          // workspace toggle's initial value (Sarah, Apr 2026 pilot ask).
          // The workspace client treats this as a SUGGESTED initial
          // state, not a hard rule; the tutor can always flip per
          // session.
          student: {
            select: { id: true, name: true, recordingDefaultEnabled: true },
          },
        },
      }),
    { label: "WhiteboardWorkspacePage.detail" }
  );
  if (!detail) notFound();

  const syncEnabled = Boolean(env.WHITEBOARD_SYNC_URL);

  return (
    <div className="container" style={{ maxWidth: 1280 }}>
      <div
        className="row"
        style={{
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div>
          <Link href={`/admin/students/${studentId}`} className="muted">
            ← Back to {detail.student.name}
          </Link>
          <h1 style={{ margin: "6px 0 0" }}>Whiteboard with {detail.student.name}</h1>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
            Started {detail.startedAt.toLocaleString()}
          </p>
        </div>
        {!syncEnabled && (
          <div
            className="card"
            style={{
              padding: "8px 12px",
              background: "rgba(234,179,8,0.12)",
              border: "1px solid rgba(234,179,8,0.4)",
              fontSize: 13,
              maxWidth: 360,
            }}
          >
            Live student collab is disabled in this environment
            (WHITEBOARD_SYNC_URL not set). Recording still works.
          </div>
        )}
      </div>

      <WhiteboardWorkspaceClient
        whiteboardSessionId={detail.id}
        studentId={detail.student.id}
        studentName={detail.student.name}
        adminUserId={session.adminUserId}
        startedAtIso={detail.startedAt.toISOString()}
        bothConnectedAtIso={detail.bothConnectedAt?.toISOString() ?? null}
        initialActiveMs={detail.activeMs}
        initialLastActiveAtIso={detail.lastActiveAt?.toISOString() ?? null}
        syncUrl={syncEnabled ? env.WHITEBOARD_SYNC_URL! : null}
        initialUserWantsRecording={detail.student.recordingDefaultEnabled}
      />
    </div>
  );
}
