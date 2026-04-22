"use client";

import { useTransition, useState, useImperativeHandle, forwardRef } from "react";
import { createNote } from "./actions";

export type PopulatePayload = {
  topics: string;
  homework: string;
  /** New in B4 — where the student stands on what was covered. */
  assessment: string;
  /** UI-facing name; mapped to legacy `nextSteps` DB column server-side. */
  plan: string;
  links: string;
  promptVersion: string;
  /** Set when the note was generated from one or more audio recordings. */
  recordingIds?: string[];
  /**
   * UTC ISO timestamps derived server-side from the recordings' createdAt /
   * durationSeconds. We format them as local-time HH:MM here so the time
   * inputs show what the server would otherwise auto-fill at save time.
   * Only set when the note was generated from audio.
   */
  sessionStartedAt?: string;
  sessionEndedAt?: string;
};

/** Format a UTC ISO timestamp as `HH:MM` in the browser's local timezone. */
function formatLocalTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

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
  const [assessment, setAssessment] = useState("");
  const [plan, setPlan] = useState("");
  const [links, setLinks] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  // Capture browser timezone offset once at mount so the server can localise
  // auto-filled recording timestamps (new Date().getTimezoneOffset() returns
  // minutes west of UTC — positive for UTC-N timezones).
  const [tzOffset] = useState(() => new Date().getTimezoneOffset());
  const [aiGenerated, setAiGenerated] = useState(false);
  const [aiPromptVersion, setAiPromptVersion] = useState("");
  const [recordingIds, setRecordingIds] = useState<string[]>([]);
  const [shareRecordingInEmail, setShareRecordingInEmail] = useState(false);
  const [, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);

  useImperativeHandle(ref, () => ({
    populate(payload: PopulatePayload) {
      setTopics(payload.topics);
      setHomework(payload.homework);
      setAssessment(payload.assessment);
      setPlan(payload.plan);
      if (payload.links) setLinks(payload.links);
      setAiGenerated(true);
      setAiPromptVersion(payload.promptVersion);
      if (payload.recordingIds && payload.recordingIds.length > 0) {
        setRecordingIds(payload.recordingIds);
        setShareRecordingInEmail(true);
      }
      // Don't clobber a time the tutor already typed in by hand. Server still
      // auto-fills missing times at save (see createNote), so this is purely a
      // preview convenience — they can clear/edit before clicking Save note.
      if (payload.sessionStartedAt && !startTime) {
        const formatted = formatLocalTime(payload.sessionStartedAt);
        if (formatted) setStartTime(formatted);
      }
      if (payload.sessionEndedAt && !endTime) {
        const formatted = formatLocalTime(payload.sessionEndedAt);
        if (formatted) setEndTime(formatted);
      }
    },
    clear() {
      setTopics("");
      setHomework("");
      setAssessment("");
      setPlan("");
      setLinks("");
      setStartTime("");
      setEndTime("");
      setAiGenerated(false);
      setAiPromptVersion("");
      setRecordingIds([]);
      setShareRecordingInEmail(false);
    },
    hasUserContent() {
      return !!(topics.trim() || homework.trim() || assessment.trim() || plan.trim());
    },
  }));

  const hasContent = !!(topics.trim() || homework.trim() || assessment.trim() || plan.trim() || links.trim());

  function handleClear() {
    setTopics("");
    setHomework("");
    setAssessment("");
    setPlan("");
    setLinks("");
    setStartTime("");
    setEndTime("");
    setAiGenerated(false);
    setAiPromptVersion("");
    setRecordingIds([]);
    setShareRecordingInEmail(false);
  }

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
        setAssessment("");
        setPlan("");
        setLinks("");
        setStartTime("");
        setEndTime("");
        setAiGenerated(false);
        setAiPromptVersion("");
        setRecordingIds([]);
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
      <input type="hidden" name="timezoneOffsetMinutes" value={String(tzOffset)} />
      {recordingIds.map((id) => (
        <input key={id} type="hidden" name="recordingId" value={id} />
      ))}
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

      <div className="row" style={{ marginTop: 12 }}>
        <div style={{ flex: 1, minWidth: 140 }}>
          <label htmlFor="note-start-time">Session start (optional)</label>
          <input
            id="note-start-time"
            name="startTime"
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <label htmlFor="note-end-time">Session end (optional)</label>
          <input
            id="note-end-time"
            name="endTime"
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
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
        <label htmlFor="note-assessment">Assessment</label>
        <textarea
          id="note-assessment"
          name="assessment"
          rows={3}
          placeholder="Where does the student stand on what was covered? Strengths, struggles."
          value={assessment}
          onChange={(e) => setAssessment(e.target.value)}
        />
      </div>
      <div style={{ marginTop: 12 }}>
        <label htmlFor="note-plan">Plan</label>
        <textarea
          id="note-plan"
          name="plan"
          rows={3}
          placeholder="What's the plan for next session?"
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
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

      {/* Recording section — only shown when one or more recordings were attached via AI panel */}
      {recordingIds.length > 0 && (
        <div
          style={{
            marginTop: 16,
            padding: "12px 14px",
            borderRadius: 6,
            border: "1px solid var(--color-border, #d1d5db)",
            borderLeft: "3px solid var(--color-primary, #2563eb)",
            minWidth: 0,
            overflow: "hidden",
          }}
          data-testid="recording-section"
        >
          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              cursor: "pointer",
              fontSize: 13,
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
            <span>
              <span style={{ fontWeight: 600 }}>🎙 Attach recording{recordingIds.length > 1 ? "s" : ""} to share link</span>
              <span style={{ display: "block", fontSize: 11, color: "var(--color-muted, #6b7280)", marginTop: 2, overflowWrap: "break-word", wordBreak: "break-word" }}>
                Confirm student consent before sharing with parents/guardians.
              </span>
            </span>
          </label>
        </div>
      )}

      <div className="row" style={{ justifyContent: "flex-end", marginTop: 12, gap: 8 }}>
        <button
          type="button"
          className="btn"
          disabled={!hasContent || submitting}
          onClick={handleClear}
        >
          Clear form
        </button>
        <button className="btn primary" type="submit" disabled={submitting || !hasContent}>
          {submitting ? "Saving…" : "Save note"}
        </button>
      </div>
    </form>
  );
});

export default NewNoteForm;
