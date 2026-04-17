import OpenAI from "openai";
import { env } from "@/lib/env";

export const PROMPT_VERSION = "2026-04-16";

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
  const templateLine = input.template?.trim()
    ? input.template.trim()
    : "general";

  const recentContext =
    input.recentNotes && input.recentNotes.length > 0
      ? input.recentNotes
          .map((n) => {
            const d = n.date.toISOString().slice(0, 10);
            return `- ${d}: topics='${n.topics.trim()}' nextSteps='${n.nextSteps.trim()}'`;
          })
          .join("\n")
      : "(none)";

  return `Student: ${input.studentName}
Subject/template: ${templateLine}

Recent context (for continuity, may be empty):
${recentContext}

Tutor's notes from today's session:
${input.sessionText}

Return JSON with exactly these three fields, each a short paragraph (2–4 sentences) suitable for sending to a parent:
- "topics": what was covered today
- "homework": what the student should do before next session (empty string if nothing assigned)
- "nextSteps": what the tutor plans to cover next time`;
}

const SYSTEM_PROMPT =
  "You are a tutoring assistant. You take a tutor's freeform notes about a session and produce concise, structured session notes that the tutor can review and send to a parent. Be specific to what was actually covered. Don't invent details that aren't in the input. Use plain language a parent would understand.";

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
