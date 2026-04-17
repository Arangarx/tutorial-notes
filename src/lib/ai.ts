import OpenAI from "openai";
import { env } from "@/lib/env";

export const PROMPT_VERSION = "2026-04-16-v4";

export type RecentNoteContext = {
  date: Date;
  topics: string;
  nextSteps: string;
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
  nextSteps: string;
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

Return JSON with exactly these three fields. Each field should be 1-3 sentences drawn directly from the notes above. Do not add anything not stated in the notes. Do not prefix values with the field name (e.g. do not start with "Topics covered:", "Homework:", "Next steps:", etc.) — the field labels are shown separately in the UI:
- "topics": what was covered or worked on during TODAY's session (past tense — what already happened)
- "homework": what the student should do before next session (empty string "" if nothing assigned)
- "nextSteps": what the tutor plans to cover in a FUTURE session (future tense — "will work on", "next time", "plan to", etc.). If the notes mention something that hasn't happened yet, put it here, not in topics. Empty string "" if not mentioned.`;
}

const SYSTEM_PROMPT =
  "You are a tutoring assistant. Convert the tutor's raw session notes into clean, structured notes for a parent. " +
  "STRICT RULES: (1) Only include information that is explicitly stated in the tutor's notes. " +
  "(2) Do NOT add observations, encouragement, progress statements, or context from previous sessions — even if they seem natural. " +
  "(3) If a field has no information in the notes, return an empty string for that field. " +
  "(4) Use plain language a parent would understand. Do not invent or infer anything.";

/** Max tokens for input (~3000 words). Safeguard on top of the OpenAI spend cap. */
const MAX_INPUT_TOKENS = 4000;
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
  const nextSteps = typeof obj.nextSteps === "string" ? obj.nextSteps : "";

  return { topics, homework, nextSteps, promptVersion: PROMPT_VERSION };
}

/** Roughly estimate token count (4 chars ≈ 1 token). Used by callers to guard input length. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export { MAX_INPUT_TOKENS };
