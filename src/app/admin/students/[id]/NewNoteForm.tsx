"use client";

import { useTransition, useState, useImperativeHandle, forwardRef } from "react";
import { createNote } from "./actions";

export type PopulatePayload = {
  topics: string;
  homework: string;
  nextSteps: string;
  promptVersion: string;
  /** Set when the note was generated from an audio recording. */
  recordingId?: string;
};

export type NewNoteFormHandle = {
  populate: (payload: PopulatePayload) => void;
  /** Clears all AI-filled fields and recording state. */
  clear: () => void;
  /** Returns true if any of the AI-fillable fields have content the user typed. */
  hasUserContent: () => boolean;
};

type Props = {
  studentId: string;
  /** Called after a note is successfully saved, so parent can reset dependent panels. */
  onSaved?: () => void;
};

const TEMPLATES = [
  { value: "", label: "None" },
  { value: "Math session", label: "Math session" },
  { value: "Reading session", label: "Reading session" },
  { value: "Test prep", label: "Test prep" },
];

function formatDateInput(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

const NewNoteForm = forwardRef<NewNoteFormHandle, Props>(function NewNoteForm(
  { studentId, onSaved },
  ref
) {
  const [date] = useState(() => formatDateInput(new Date()));
  const [template, setTemplate] = useState("");
  const [topics, setTopics] = useState("");
  const [homework, setHomework] = useState("");
  const [nextSteps, setNextSteps] = useState("");
  const [links, setLinks] = useState("");
  const [aiGenerated, setAiGenerated] = useState(false);
  const [aiPromptVersion, setAiPromptVersion] = useState("");
  const [recordingId, setRecordingId] = useState<string | undefined>(undefined);
  const [shareRecordingInEmail, setShareRecordingInEmail] = useState(false);
  const [, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);

  useImperativeHandle(ref, () => ({
    populate(payload: PopulatePayload) {
      setTopics(payload.topics);
      setHomework(payload.homework);
      setNextSteps(payload.nextSteps);
      setAiGenerated(true);
      setAiPromptVersion(payload.promptVersion);
      if (payload.recordingId) {
        setRecordingId(payload.recordingId);
        setShareRecordingInEmail(false);
      }
    },
    clear() {
      setTopics("");
      setHomework("");
      setNextSteps("");
      setAiGenerated(false);
      setAiPromptVersion("");
      setRecordingId(undefined);
      setShareRecordingInEmail(false);
    },
    hasUserContent() {
      return !!(topics.trim() || homework.trim() || nextSteps.trim());
    },
  }));

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    setSubmitting(true);
    startTransition(async () => {
      try {
        await createNote(studentId, formData);
        // Reset form state on success
        setTemplate("");
        setTopics("");
        setHomework("");
        setNextSteps("");
        setLinks("");
        setAiGenerated(false);
        setAiPromptVersion("");
        setRecordingId(undefined);
        setShareRecordingInEmail(false);
        onSaved?.();
      } finally {
        setSubmitting(false);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} data-testid="new-note-form" autoComplete="off">
      {/* Hidden AI provenance fields */}
      <input type="hidden" name="aiGenerated" value={String(aiGenerated)} />
      <input type="hidden" name="aiPromptVersion" value={aiPromptVersion} />
      {recordingId && (
        <input type="hidden" name="recordingId" value={recordingId} />
      )}
      <input type="hidden" name="shareRecordingInEmail" value={String(shareRecordingInEmail)} />

      <div className="row">
        <div style={{ flex: 1, minWidth: 200 }}>
          <label htmlFor="note-date">Date</label>
          <input id="note-date" name="date" type="date" defaultValue={date} />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label htmlFor="note-template">Template (optional)</label>
          <select
            id="note-template"
            name="template"
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
          >
            {TEMPLATES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <label htmlFor="note-topics">Topics covered</label>
        <textarea
          id="note-topics"
          name="topics"
          rows={3}
          placeholder="What did you work on today?"
          value={topics}
          onChange={(e) => setTopics(e.target.value)}
        />
      </div>
      <div style={{ marginTop: 12 }}>
        <label htmlFor="note-homework">Homework</label>
        <textarea
          id="note-homework"
          name="homework"
          rows={3}
          placeholder="What should they do before next time?"
          value={homework}
          onChange={(e) => setHomework(e.target.value)}
        />
      </div>
      <div style={{ marginTop: 12 }}>
        <label htmlFor="note-next-steps">Next steps</label>
        <textarea
          id="note-next-steps"
          name="nextSteps"
          rows={3}
          placeholder="What's the plan for next session?"
          value={nextSteps}
          onChange={(e) => setNextSteps(e.target.value)}
        />
      </div>
      <div style={{ marginTop: 12 }}>
        <label htmlFor="note-links">Links (optional, one per line)</label>
        <textarea
          id="note-links"
          name="links"
          rows={3}
          placeholder="https://..."
          value={links}
          onChange={(e) => setLinks(e.target.value)}
        />
      </div>

      {/* Recording section — only shown when a recording was attached via AI panel */}
      {recordingId && (
        <div
          style={{
            marginTop: 16,
            padding: "12px 14px",
            borderRadius: 6,
            border: "1px solid var(--color-border, #d1d5db)",
            borderLeft: "3px solid var(--color-primary, #2563eb)",
          }}
          data-testid="recording-section"
        >
          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              cursor: "pointer",
            }}
            data-testid="share-recording-label"
          >
            <input
              type="checkbox"
              checked={shareRecordingInEmail}
              onChange={(e) => setShareRecordingInEmail(e.target.checked)}
              style={{ marginTop: 2, flexShrink: 0 }}
              data-testid="share-recording-checkbox"
            />
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>
                Session recording attached — include in parent share link
              </div>
              <div style={{ fontSize: 11, color: "var(--color-muted, #6b7280)", marginTop: 3 }}>
                Off by default. When enabled, parents can play the audio on the notes page.
                Obtain student consent before sharing.
              </div>
            </div>
          </label>
        </div>
      )}

      <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
        <button className="btn primary" type="submit" disabled={submitting}>
          {submitting ? "Saving…" : "Save note"}
        </button>
      </div>
    </form>
  );
});

export default NewNoteForm;
