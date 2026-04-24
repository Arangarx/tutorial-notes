import Link from "next/link";
import { LocalDateTimeText } from "@/components/LocalDateTimeText";
import { SubmitButton } from "@/components/SubmitButton";
import { endOpenWhiteboardFromStudentPage } from "./actions";

export type ActiveWbListItem = {
  id: string;
  startedAt: Date;
};

/**
 * Renders still-open (endedAt = null) whiteboard sessions for this
 * student so tutors can **Continue** the workspace or **End** a
 * straggler without hunting down an old tab.
 *
 * If we only exposed "Start whiteboard session", every click minted
 * a new `WhiteboardSession` row; without ending the previous one
 * in-app, the DB could accumulate many live rooms — each with its own
 * join-token surface + relay room id. This list is the light-touch
 * inventory + kill-switch (Sarah-pilot / Andrew session-flow question,
 * Apr 2026).
 */
export function ActiveWhiteboardSessionsList({
  studentId,
  sessions,
}: {
  studentId: string;
  sessions: readonly ActiveWbListItem[];
}) {
  if (sessions.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        marginTop: 16,
        padding: "12px 14px",
        border: "1px solid var(--border, rgba(255,255,255,0.12))",
        borderRadius: 8,
        background: "var(--panel, rgba(255,255,255,0.04))",
      }}
    >
      <h4 style={{ margin: "0 0 4px", fontSize: 14 }}>Open whiteboard sessions</h4>
      <p className="muted" style={{ margin: "0 0 10px", fontSize: 12, lineHeight: 1.45 }}>
        These rooms are still not ended from the whiteboard. Continue
        to pick up where you left off, or end a room to revoke its join
        link. You can also start a new room above — that creates
        an additional open session, so end ones you do not need.
      </p>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {sessions.map((s) => {
          const startedAtIso = s.startedAt.toISOString();
          return (
            <li
              key={s.id}
              className="row"
              style={{
                flexWrap: "wrap",
                gap: 8,
                alignItems: "center",
                padding: "8px 0",
                borderTop: "1px solid var(--border, rgba(255,255,255,0.08))",
              }}
            >
              <span className="muted" style={{ fontSize: 13, flex: "1 1 160px" }}>
                Started{" "}
                <LocalDateTimeText
                  dateTime={startedAtIso}
                  className="muted"
                />
                <span style={{ fontSize: 11, marginLeft: 6, opacity: 0.7 }}>
                  ({s.id.slice(0, 8)}…)
                </span>
              </span>
              <div className="row" style={{ gap: 8 }}>
                <Link
                  className="btn btn-primary"
                  href={`/admin/students/${studentId}/whiteboard/${s.id}/workspace`}
                >
                  Continue
                </Link>
                <form action={endOpenWhiteboardFromStudentPage} title={`Session ${s.id}`}>
                  <input type="hidden" name="whiteboardSessionId" value={s.id} />
                  <SubmitButton
                    label="End"
                    pendingLabel="Ending…"
                    className="btn"
                    aria-label="End this open whiteboard room"
                  />
                </form>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
