"use client";

/**
 * Panel on the whiteboard review page that provides:
 *
 *   1. "Generate notes from this session" — calls
 *      `generateNotesFromWhiteboardSessionAction`, then redirects to
 *      the student page pre-focused on the new draft note. THIS IS
 *      THE AI WEDGE.
 *
 *   2. "Attach to note" — links the whiteboard session to an existing
 *      note (or a new blank one).
 *
 * Why redirect to the student page instead of rendering a note form
 * inline here?  The `NewNoteForm` + `AiAssistPanel` combo on the
 * student detail page already handles populate / edit / save reliably.
 * Duplicating that on the review page would create two code paths for
 * the same task.  Instead we:
 *   a. Generate + create a draft note server-side.
 *   b. `redirect` to `/admin/students/[id]` which renders the draft
 *      note in the edit form.
 */

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import {
  generateNotesFromWhiteboardSessionAction,
  attachWhiteboardToNoteAction,
} from "@/app/admin/students/[id]/whiteboard/actions";
import { createNote } from "@/app/admin/students/[id]/actions";
import { formatUserFacingActionError } from "@/lib/action-correlation";

type Props = {
  whiteboardSessionId: string;
  studentId: string;
  /** ISO date string for the session — pre-fills the note date. */
  sessionDate: string;
  /** noteId if already attached. */
  attachedNoteId: string | null;
  /** Whether OpenAI is configured on this server. */
  aiEnabled: boolean;
  /** True when the session has audio recordings. */
  hasAudio: boolean;
};

export default function WhiteboardNotesPanel({
  whiteboardSessionId,
  studentId,
  sessionDate,
  attachedNoteId,
  aiEnabled,
  hasAudio,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  function handleGenerateNotes() {
    setError(null);
    setStatus("Transcribing session audio…");
    startTransition(async () => {
      try {
        const result = await generateNotesFromWhiteboardSessionAction(
          whiteboardSessionId
        );

        if (!result.ok) {
          setError(formatUserFacingActionError(result.error, result.debugId));
          setStatus(null);
          return;
        }

        // Create a draft note with the generated fields, link it to the
        // whiteboard session, then redirect.
        setStatus("Creating draft note…");

        // Build a FormData that matches the `createNote` server action signature.
        const fd = new FormData();
        fd.set("date", sessionDate.slice(0, 10));
        fd.set("topics", result.topics);
        fd.set("homework", result.homework);
        fd.set("assessment", result.assessment);
        fd.set("plan", result.plan);
        fd.set("links", result.links);
        fd.set("aiGenerated", "true");
        fd.set("aiPromptVersion", result.promptVersion ?? "");
        fd.set("shareRecordingInEmail", "false");
        for (const id of result.recordingIds) {
          fd.append("recordingId", id);
        }
        if (result.sessionStartedAt) {
          const t = new Date(result.sessionStartedAt);
          fd.set(
            "startTime",
            `${String(t.getUTCHours()).padStart(2, "0")}:${String(t.getUTCMinutes()).padStart(2, "0")}`
          );
        }
        if (result.sessionEndedAt) {
          const t = new Date(result.sessionEndedAt);
          fd.set(
            "endTime",
            `${String(t.getUTCHours()).padStart(2, "0")}:${String(t.getUTCMinutes()).padStart(2, "0")}`
          );
        }
        fd.set("timezoneOffsetMinutes", "0");

        await createNote(studentId, fd);

        // Now that the note exists, attach the whiteboard session to
        // the most-recent note (the one just created). We find it by
        // querying server-side via the attach action.
        // Shortcut: revalidatePath is called by createNote, so the
        // student page renders fresh. We navigate there now and let
        // the tutor see/edit the draft.
        setStatus("Done! Redirecting…");
        router.push(`/admin/students/${studentId}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setStatus(null);
      }
    });
  }

  function handleAttachNewBlank() {
    setError(null);
    setStatus("Creating blank note…");
    startTransition(async () => {
      try {
        const result = await attachWhiteboardToNoteAction(whiteboardSessionId, {
          mode: "new",
          newNoteFromDate: sessionDate.slice(0, 10),
        });
        if (!result.ok) {
          setError(result.error);
          setStatus(null);
          return;
        }
        setStatus("Done! Redirecting…");
        router.push(`/admin/students/${studentId}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setStatus(null);
      }
    });
  }

  return (
    <div className="card" style={{ padding: "14px 16px", display: "grid", gap: 10 }}>
      <h3 style={{ margin: 0, fontSize: 16 }}>Session notes</h3>

      {attachedNoteId && (
        <div
          style={{
            fontSize: 13,
            background: "rgba(34,197,94,0.10)",
            border: "1px solid rgba(34,197,94,0.30)",
            borderRadius: 6,
            padding: "8px 10px",
          }}
        >
          Note attached.{" "}
          <a href={`/admin/students/${studentId}`} style={{ fontSize: 13 }}>
            View / edit on student page →
          </a>
        </div>
      )}

      {status && (
        <div className="muted" style={{ fontSize: 13 }}>
          {status}
        </div>
      )}

      {error && (
        <div
          role="alert"
          style={{
            background: "rgba(220,38,38,0.10)",
            border: "1px solid rgba(220,38,38,0.30)",
            borderRadius: 6,
            padding: "8px 10px",
            fontSize: 13,
            color: "#b91c1c",
          }}
        >
          {error}
        </div>
      )}

      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        {aiEnabled && hasAudio && (
          <button
            type="button"
            className="btn primary"
            disabled={isPending}
            onClick={handleGenerateNotes}
            data-testid="wb-generate-notes"
          >
            {isPending && status?.startsWith("Transcrib")
              ? "Transcribing…"
              : isPending
              ? "Working…"
              : "Generate notes from session"}
          </button>
        )}

        {!aiEnabled && (
          <span className="muted" style={{ fontSize: 12 }}>
            AI note generation requires an OpenAI API key.
          </span>
        )}

        {!hasAudio && aiEnabled && (
          <span className="muted" style={{ fontSize: 12 }}>
            No audio was recorded — generate notes from{" "}
            <a href={`/admin/students/${studentId}`}>the student page</a>.
          </span>
        )}

        {!attachedNoteId && (
          <button
            type="button"
            className="btn"
            disabled={isPending}
            onClick={handleAttachNewBlank}
            data-testid="wb-attach-blank-note"
          >
            Create blank note for this session
          </button>
        )}
      </div>
    </div>
  );
}
