/**
 * Whisper often hallucinates stock phrases when given silence, room tone, or
 * a bad/muted mic — especially short clips. See OpenAI community reports +
 * tutoring pilot (Apr 2026): 65-char "thanks for watching / subscribe" with
 * no real speech.
 *
 * These checks are intentionally conservative: only block obvious boilerplate,
 * not real short utterances.
 */

/** Phrases Whisper commonly invents with little or no speech. */
const HALLUCINATION_PATTERNS: RegExp[] = [
  /thanks\s+for\s+watching/i,
  /thank\s+you\s+for\s+watching/i,
  /please\s+subscribe/i,
  /hit\s+(that\s+)?like\s+button/i,
  /like\s+and\s+subscribe/i,
  /don'?t\s+forget\s+to\s+subscribe/i,
  /see\s+you\s+(in\s+the\s+)?next\s+(video|one)/i,
  /^\s*bye\.?\s*$/i,
  /^\s*thank\s+you\.?\s*$/i,
];

/**
 * Returns true when the transcript is very likely a silence / junk artifact
 * rather than a tutoring session. Caller may delete the recording and ask
 * the tutor to check mic + duration.
 */
export function looksLikeSilenceHallucination(
  transcript: string,
  durationSeconds: number | null
): boolean {
  const t = transcript.trim();
  if (!t) return true;

  for (const re of HALLUCINATION_PATTERNS) {
    if (re.test(t)) return true;
  }

  // Very short audio + very short text often means "nothing useful" (not perfect).
  if (durationSeconds !== null && durationSeconds <= 2 && t.length < 40) {
    return true;
  }

  return false;
}
