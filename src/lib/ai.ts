import OpenAI from "openai";
import { env } from "@/lib/env";

/**
 * Bumped from v5 → v6 in B4 for Sarah's pilot feedback:
 *   - Output expanded from 4 → 5 fields (added "assessment").
 *   - "nextSteps" renamed to "plan" in the JSON contract (UI label is
 *     "Plan" everywhere). The DB column is still `nextSteps`; the server
 *     action maps `result.plan` → `nextSteps` at the boundary.
 *   - Style tightened: bare essentials only, no padding sentences, no
 *     restating the field name in the value.
 *
 * Bumping the version invalidates `aiPromptVersion` on existing notes so
 * the admin UI can flag them as "generated under an older prompt" if we
 * ever surface that.
 */
export const PROMPT_VERSION = "2026-04-20-v6";

export type RecentNoteContext = {
  date: Date;
  topics: string;
  /** UI calls this "Plan"; DB column is still `nextSteps`. */
  plan: string;
};

export type GenerateSessionNoteInput = {
  studentName: string;
  sessionText: string;
  recentNotes?: RecentNoteContext[];
  template?: string | null;
};

export type GenerateSessionNoteSuccess = {
  topics: string;
  homework: string;
  /**
   * Where the student stands on what was covered (new in v6).
   */
  assessment: string;
  /**
   * UI label is "Plan". This is the JSON key the LLM returns; the server
   * action maps it to the legacy `nextSteps` DB column so we don't need a
   * data migration.
   */
  plan: string;
  links: string;
  promptVersion: string;
};

export type GenerateSessionNoteResult =
  | GenerateSessionNoteSuccess
  | { error: string };

function buildUserPrompt(input: GenerateSessionNoteInput): string {
  const templateLine = input.template?.trim() ? input.template.trim() : "general";

  return `Subject/template: ${templateLine}

Tutor's notes from today's session (use ONLY this to fill the fields):
${input.sessionText}

Return JSON with exactly these five fields. Write the BARE ESSENTIALS — short phrases or comma lists, not sentences. Do NOT pad with greetings, commentary, encouragement, or sentences that restate the field name (e.g. for topics write "Quadratics, factoring, negative coefficients" not "Today we worked on quadratics, factoring, and negative coefficients"). Do not prefix values with the field name. Do not invent anything not stated in the notes:
- "topics": what was covered today (past tense, terse list — "X, Y, Z"). Empty string "" if not mentioned.
- "homework": what the student should do before next session (terse list of items). Empty string "" if nothing assigned.
- "assessment": where the student stands on what was covered today — strengths, struggles, mastery level. ONLY include things the tutor's notes explicitly say (e.g. "struggled with negatives", "comfortable with factoring"). Empty string "" if the notes don't comment on understanding.
- "plan": what the tutor plans for a FUTURE session (future tense, terse — "Move to systems of equations", "Re-test fractions"). If the notes mention something that hasn't happened yet, put it here, not in topics. Empty string "" if not mentioned.
- "links": any URLs or websites mentioned in the notes, one per line. Empty string "" if none.`;
}

const SYSTEM_PROMPT =
  "You are a tutoring assistant. Convert the tutor's raw session notes into clean, structured notes for a parent. " +
  "STRICT RULES: (1) Only include information that is EXPLICITLY stated in the tutor's notes. " +
  "(2) Do NOT add observations, encouragement, progress statements, or context from previous sessions — even if they seem natural. " +
  "(3) If a field has no information in the notes, return an empty string for that field. " +
  "(4) Be terse. A parent should be able to scan the note in under 10 seconds. Short phrases over sentences. No padding. " +
  "(5) Use plain language a parent would understand. Do not invent or infer anything.";

/**
 * Max tokens of session text we send to the LLM. ~30000 tokens ≈ ~22.5k words ≈
 * ~2.5 hours of normal speech, well within gpt-4o-mini's 128k context window.
 * Cost per call at this ceiling is ~$0.0045 (input $0.15/M), still trivial.
 *
 * Was 4000 (~3000 words) historically — too tight for any serious session and
 * caused two bugs Sarah hit during her pilot:
 *   - Pasting a 30-min transcript was rejected outright in
 *     `generateNoteFromTextAction`.
 *   - Long Whisper transcripts were silently truncated by `slice()` in
 *     `transcribeAndGenerateAction`, so notes were generated from only the
 *     first ~16k characters of the audio.
 * If we ever do hit this ceiling for real, the right next step is map-reduce
 * summarization, not bumping further — see docs/BACKLOG.md.
 */
const MAX_INPUT_TOKENS = 30000;
/** Max tokens for the JSON response. */
const MAX_OUTPUT_TOKENS = 800;

export async function generateSessionNote(
  input: GenerateSessionNoteInput
): Promise<GenerateSessionNoteResult> {
  if (!env.OPENAI_API_KEY) {
    return { error: "not configured" };
  }

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  let raw: string;
  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      max_tokens: MAX_OUTPUT_TOKENS,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: buildUserPrompt(input),
        },
      ],
      // Soft input cap via truncation awareness — the caller should guard input length.
      // max_completion_tokens covers our output; input is bounded by model context.
    });

    raw = response.choices[0]?.message?.content ?? "";
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ai] OpenAI request failed:", msg);
    return { error: "AI request failed. Please try again." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error("[ai] Failed to parse OpenAI response:", raw);
    return { error: "AI returned an unexpected response. Please try again." };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { error: "AI returned an unexpected response. Please try again." };
  }

  const obj = parsed as Record<string, unknown>;
  const topics = typeof obj.topics === "string" ? obj.topics : "";
  const homework = typeof obj.homework === "string" ? obj.homework : "";
  const assessment = typeof obj.assessment === "string" ? obj.assessment : "";
  // Accept legacy `nextSteps` from any pre-v6 prompt response too — defence in
  // depth in case the model echoes the old field name (rare with json_object
  // mode but free to handle).
  const plan =
    typeof obj.plan === "string"
      ? obj.plan
      : typeof obj.nextSteps === "string"
      ? obj.nextSteps
      : "";
  const links = typeof obj.links === "string" ? obj.links : "";

  return { topics, homework, assessment, plan, links, promptVersion: PROMPT_VERSION };
}

/** Roughly estimate token count (4 chars ≈ 1 token). Used by callers to guard input length. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export { MAX_INPUT_TOKENS };
