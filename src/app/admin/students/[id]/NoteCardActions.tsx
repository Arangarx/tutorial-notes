"use client";

import { useState, useTransition } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { updateNote, deleteNote, setNoteStatus } from "./actions";

interface NoteCardActionsProps {
  noteId: string;
  studentId: string;
  defaultValues: {
    date: string;
    template: string;
    topics: string;
    homework: string;
    nextSteps: string;
    links: string;
    /** HH:MM (24-hour) extracted from stored UTC timestamp, or empty string. */
    startTime: string;
    endTime: string;
  };
  status: string;
  sentAt: string | null;
}

export function NoteCardActions({
  noteId,
  studentId,
  defaultValues,
  status,
  sentAt,
}: NoteCardActionsProps) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [, startTransition] = useTransition();

  function markReady() {
    startTransition(() => { void setNoteStatus(noteId, studentId, "READY"); });
  }
  function markDraft() {
    startTransition(() => { void setNoteStatus(noteId, studentId, "DRAFT"); });
  }

  if (confirmDelete) {
    return (
      <div className="row">
        <span className="muted" style={{ fontSize: 14 }}>Delete this note? This is permanent.</span>
        <form action={async () => { await deleteNote(noteId, studentId); }}>
          <button className="btn" type="submit" style={{ color: "#ffb4b4" }}>Delete</button>
        </form>
        <button className="btn" type="button" onClick={() => setConfirmDelete(false)}>Cancel</button>
      </div>
    );
  }

  if (editing) {
    return (
      <form
        action={async (fd: FormData) => {
          await updateNote(noteId, studentId, fd);
          setEditing(false);
        }}
        style={{ display: "grid", gap: 10, marginTop: 8, width: "100%" }}
      >
        <div className="row">
          <div style={{ flex: 1 }}>
            <label htmlFor={`edit-date-${noteId}`}>Date</label>
            <input id={`edit-date-${noteId}`} name="date" type="date" defaultValue={defaultValues.date} required />
          </div>
          <div style={{ flex: 1 }}>
            <label htmlFor={`edit-template-${noteId}`}>Template</label>
            <select id={`edit-template-${noteId}`} name="template" defaultValue={defaultValues.template}>
              <option value="">None</option>
              <option value="Math session">Math session</option>
              <option value="Reading session">Reading session</option>
              <option value="Test prep">Test prep</option>
            </select>
          </div>
        </div>
        <div className="row">
          <div style={{ flex: 1 }}>
            <label htmlFor={`edit-start-time-${noteId}`}>Session start</label>
            <input
              id={`edit-start-time-${noteId}`}
              name="startTime"
              type="time"
              defaultValue={defaultValues.startTime}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label htmlFor={`edit-end-time-${noteId}`}>Session end</label>
            <input
              id={`edit-end-time-${noteId}`}
              name="endTime"
              type="time"
              defaultValue={defaultValues.endTime}
            />
          </div>
        </div>
        <div>
          <label htmlFor={`edit-topics-${noteId}`}>Topics</label>
          <textarea id={`edit-topics-${noteId}`} name="topics" rows={2} defaultValue={defaultValues.topics} />
        </div>
        <div>
          <label htmlFor={`edit-homework-${noteId}`}>Homework</label>
          <textarea id={`edit-homework-${noteId}`} name="homework" rows={2} defaultValue={defaultValues.homework} />
        </div>
        <div>
          <label htmlFor={`edit-next-steps-${noteId}`}>Next steps</label>
          <textarea id={`edit-next-steps-${noteId}`} name="nextSteps" rows={2} defaultValue={defaultValues.nextSteps} />
        </div>
        <div>
          <label htmlFor={`edit-links-${noteId}`}>Links (one per line)</label>
          <textarea id={`edit-links-${noteId}`} name="links" rows={2} defaultValue={defaultValues.links} />
        </div>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn" type="button" onClick={() => setEditing(false)}>Cancel</button>
          <SubmitButton label="Save changes" pendingLabel="Saving…" />
        </div>
      </form>
    );
  }

  return (
    <div className="row" style={{ flexWrap: "wrap" }}>
      {status !== "READY" ? (
        <button className="btn" type="button" onClick={markReady}>Mark ready</button>
      ) : (
        <button className="btn" type="button" onClick={markDraft}>Mark draft</button>
      )}
      <button className="btn" type="button" onClick={() => setEditing(true)}>Edit</button>
      <button
        className="btn"
        type="button"
        onClick={() => setConfirmDelete(true)}
        style={{ color: "#ffb4b4" }}
      >
        Delete
      </button>
      {sentAt && (
        <span className="muted" style={{ fontSize: 12, alignSelf: "center" }}>
          Sent {new Date(sentAt).toLocaleString()}
        </span>
      )}
    </div>
  );
}
