"use client";

import { useState, useTransition } from "react";
import { setStudentRecordingDefault } from "./actions";

/**
 * Per-student "default to recording on" toggle for the whiteboard
 * workspace. Sarah's pilot ask (Apr 2026): some students decline
 * recording, and re-unticking the Start checkbox every time is a
 * paper cut. This switch biases the initial state of the workspace's
 * `userWantsRecording` toggle so those students ship Start-unticked
 * by default; the tutor can still flip per session.
 *
 * Implementation notes:
 *
 *   - Optimistic UI: we flip local state immediately and revert on
 *     error so the click feels instant. The action is cheap (single
 *     row update) but we still surface an error inline if it fails
 *     so the tutor knows the next session won't reflect the change.
 *
 *   - `useTransition` wraps the action call so React can show the
 *     "saving" state without blocking input.
 *
 *   - Revalidate is server-side via `revalidatePath` in the action;
 *     no manual router.refresh() needed here.
 */

export function StudentRecordingDefaultToggle({
  studentId,
  initialEnabled,
}: {
  studentId: string;
  initialEnabled: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleChange = (next: boolean) => {
    const previous = enabled;
    setEnabled(next);
    setError(null);
    startTransition(async () => {
      try {
        await setStudentRecordingDefault(studentId, next);
      } catch (err) {
        setEnabled(previous);
        setError(
          err instanceof Error ? err.message : "Could not save the change."
        );
      }
    });
  };

  return (
    <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <label
        htmlFor={`record-default-${studentId}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          fontSize: 13,
          cursor: pending ? "wait" : "pointer",
          opacity: pending ? 0.7 : 1,
        }}
      >
        <input
          id={`record-default-${studentId}`}
          type="checkbox"
          checked={enabled}
          onChange={(e) => handleChange(e.target.checked)}
          disabled={pending}
          data-testid="student-recording-default-toggle"
        />
        <span>
          Start whiteboard recording on by default
          <span className="muted" style={{ marginLeft: 6, fontSize: 12 }}>
            ({enabled ? "on" : "off"})
          </span>
        </span>
      </label>
      {error && (
        <span
          role="alert"
          style={{ color: "var(--color-error, #dc2626)", fontSize: 12 }}
        >
          {error}
        </span>
      )}
    </div>
  );
}
