/**
 * Pure helper for shaping the result of `transcribeAndGenerateAction`.
 *
 * Lives in its own non-server module because Next.js requires every export
 * from a `"use server"` file to be an async server action. The helper is
 * synchronous and pure, so it cannot live in `actions.ts`.
 *
 * Sarah's bug: previously, both the empty-transcript and gen-failure branches
 * of the action returned `ok:true` with empty fields, so the panel said
 * "Form filled" with nothing in the form. The server action may also return
 * `ok:false` before this helper when obvious Whisper junk is detected after an
 * all-empty LLM response (late guard in `actions.ts`). This helper now:
 *   - empty transcript            -> ok:false with actionable error
 *   - AI gen errors / all-empty   -> ok:true with raw transcript in `topics`
 *                                    + a `warning` so the tutor can hand-edit
 *   - happy path                  -> ok:true with structured fields, no warning
 *
 * Covered by `src/__tests__/regressions/transcribe-result-shape.test.ts`.
 */

export type TranscribeAndGenerateResult =
  | {
      ok: true;
      /** IDs of all SessionRecording rows created for this generation (one per segment). */
      recordingIds: string[];
      transcript: string;
      topics: string;
      homework: string;
      /** New in B4 — see `src/lib/ai.ts` PROMPT_VERSION v6. */
      assessment: string;
      /** UI-facing name; persisted to the legacy `nextSteps` DB column. */
      plan: string;
      links: string;
      promptVersion: string;
      /**
       * Non-fatal explanation when something noteworthy happened during the run.
       * The UI uses `warningKind` to pick the right framing — "form filled, FYI"
       * for skipped-only vs "form needs your edits" for AI fallback.
       */
      warning?: string;
      /**
       * What the warning is about, so the UI can avoid the misleading "Form
       * partially filled — please review." header when the form is in fact
       * fully filled and the notice is just "we ignored an empty recording."
       *  - `"skipped-only"` — AI succeeded; a silent segment was dropped. Form is complete.
       *  - `"ai-fallback"` — Topics has raw transcript; Homework / Assessment / Plan are empty.
       *    Tutor must hand-split the content. May also include a skipped notice.
       */
      warningKind?: "skipped-only" | "ai-fallback";
      /**
       * UTC ISO timestamp of the earliest recording's start (createdAt minus its
       * durationSeconds). The form formats these as local-time HH:MM and pre-fills
       * `Session start` / `Session end` so the tutor can see/edit the auto-derived
       * times before saving. (At save time the server still derives them as a
       * fallback when blank — see `createNote`.)
       */
      sessionStartedAt?: string;
      /** UTC ISO timestamp of the latest recording's createdAt (i.e. when it stopped). */
      sessionEndedAt?: string;
    }
  | { ok: false; error: string; /** Same id as Vercel log line `rid=` for this run. */ debugId?: string };

export function buildTranscribeAndGenerateResult(args: {
  recordingIds: string[];
  trimmedTranscript: string;
  rawTranscript: string;
  genResult:
    | { topics: string; homework: string; assessment: string; plan: string; links: string; promptVersion: string }
    | { error: string }
    | null;
  /** When `ok:false`, included so tutors can match Vercel logs. */
  debugId?: string;
  /**
   * Number of segments dropped pre-LLM because Whisper returned silence/hallucination
   * text. The kept segments still produced real content; we surface this as a warning
   * so the tutor knows one of their recordings was empty (e.g. an accidental short
   * stop) without losing the good ones.
   */
  skippedHallucinationSegments?: number;
  /** UTC ISO timestamp — see TranscribeAndGenerateResult.sessionStartedAt. */
  sessionStartedAt?: string;
  /** UTC ISO timestamp — see TranscribeAndGenerateResult.sessionEndedAt. */
  sessionEndedAt?: string;
}): TranscribeAndGenerateResult {
  const {
    recordingIds,
    trimmedTranscript,
    rawTranscript,
    genResult,
    debugId,
    skippedHallucinationSegments = 0,
    sessionStartedAt,
    sessionEndedAt,
  } = args;
  const sessionTimes = {
    ...(sessionStartedAt ? { sessionStartedAt } : {}),
    ...(sessionEndedAt ? { sessionEndedAt } : {}),
  };

  if (!trimmedTranscript) {
    return {
      ok: false,
      error:
        "We couldn't make out any words in this recording. The audio may have been silent or too quiet. Try recording again with the mic closer, then click Transcribe & generate notes.",
      ...(debugId ? { debugId } : {}),
    };
  }

  const skippedNotice =
    skippedHallucinationSegments > 0
      ? skippedHallucinationSegments === 1
        ? "One of your recordings had no clear audio (silent or too quiet) and was skipped. The form was filled from the other segment(s)."
        : `${skippedHallucinationSegments} of your recordings had no clear audio and were skipped. The form was filled from the other segment(s).`
      : null;

  function combineWarning(extra: string): string {
    return skippedNotice ? `${skippedNotice} ${extra}` : extra;
  }

  if (!genResult || "error" in genResult) {
    return {
      ok: true,
      recordingIds,
      transcript: rawTranscript,
      topics: trimmedTranscript,
      homework: "",
      assessment: "",
      plan: "",
      links: "",
      promptVersion: "",
      warning: combineWarning(
        "We transcribed the recording but couldn't auto-organize it (AI service hiccup). The raw transcript is in Topics — please move parts into Homework / Assessment / Plan before saving."
      ),
      warningKind: "ai-fallback",
      ...sessionTimes,
    };
  }

  const allEmpty =
    !genResult.topics.trim() &&
    !genResult.homework.trim() &&
    !genResult.assessment.trim() &&
    !genResult.plan.trim() &&
    !genResult.links.trim();

  if (allEmpty) {
    return {
      ok: true,
      recordingIds,
      transcript: rawTranscript,
      topics: trimmedTranscript,
      homework: "",
      assessment: "",
      plan: "",
      links: "",
      promptVersion: genResult.promptVersion,
      warning: combineWarning(
        "AI couldn't extract structured fields from this transcript. The raw text is in Topics — please edit before saving."
      ),
      warningKind: "ai-fallback",
      ...sessionTimes,
    };
  }

  return {
    ok: true,
    recordingIds,
    transcript: rawTranscript,
    topics: genResult.topics,
    homework: genResult.homework,
    assessment: genResult.assessment,
    plan: genResult.plan,
    links: genResult.links,
    promptVersion: genResult.promptVersion,
    ...(skippedNotice ? { warning: skippedNotice, warningKind: "skipped-only" as const } : {}),
    ...sessionTimes,
  };
}
