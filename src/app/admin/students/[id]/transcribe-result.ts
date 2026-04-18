/**
 * Pure helper for shaping the result of `transcribeAndGenerateAction`.
 *
 * Lives in its own non-server module because Next.js requires every export
 * from a `"use server"` file to be an async server action. The helper is
 * synchronous and pure, so it cannot live in `actions.ts`.
 *
 * Sarah's bug: previously, both the empty-transcript and gen-failure branches
 * of the action returned `ok:true` with empty fields, so the panel said
 * "Form filled" with nothing in the form. This helper now:
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
      nextSteps: string;
      links: string;
      promptVersion: string;
      /**
       * Non-fatal explanation when transcription succeeded but AI structuring
       * failed or produced nothing useful. The recording is still attached and
       * the raw transcript is placed in `topics` so the tutor can hand-edit
       * instead of losing the whole session.
       */
      warning?: string;
    }
  | { ok: false; error: string };

export function buildTranscribeAndGenerateResult(args: {
  recordingIds: string[];
  trimmedTranscript: string;
  rawTranscript: string;
  genResult:
    | { topics: string; homework: string; nextSteps: string; links: string; promptVersion: string }
    | { error: string }
    | null;
}): TranscribeAndGenerateResult {
  const { recordingIds, trimmedTranscript, rawTranscript, genResult } = args;

  if (!trimmedTranscript) {
    return {
      ok: false,
      error:
        "We couldn't make out any words in this recording. The audio may have been silent or too quiet. Try recording again with the mic closer, then click Transcribe & generate notes.",
    };
  }

  if (!genResult || "error" in genResult) {
    return {
      ok: true,
      recordingIds,
      transcript: rawTranscript,
      topics: trimmedTranscript,
      homework: "",
      nextSteps: "",
      links: "",
      promptVersion: "",
      warning:
        "We transcribed the recording but couldn't auto-organize it (AI service hiccup). The raw transcript is in Topics — please move parts into Homework / Next steps before saving.",
    };
  }

  const allEmpty =
    !genResult.topics.trim() &&
    !genResult.homework.trim() &&
    !genResult.nextSteps.trim() &&
    !genResult.links.trim();

  if (allEmpty) {
    return {
      ok: true,
      recordingIds,
      transcript: rawTranscript,
      topics: trimmedTranscript,
      homework: "",
      nextSteps: "",
      links: "",
      promptVersion: genResult.promptVersion,
      warning:
        "AI couldn't extract structured fields from this transcript. The raw text is in Topics — please edit before saving.",
    };
  }

  return {
    ok: true,
    recordingIds,
    transcript: rawTranscript,
    topics: genResult.topics,
    homework: genResult.homework,
    nextSteps: genResult.nextSteps,
    links: genResult.links,
    promptVersion: genResult.promptVersion,
  };
}
