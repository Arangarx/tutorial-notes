/**
 * Correlates server-action log lines in Vercel with tutor reports (screenshots).
 * Pass the same id through a request and log `[actionName] rid=<uuid> ...`.
 */
export function createActionCorrelationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `rid-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/** Short form for user-visible error lines (full id stays in logs). */
export function shortCorrelationId(rid: string): string {
  return rid.replace(/-/g, "").slice(0, 8);
}

/** Appends a short ref so tutors can match Vercel lines that include the full `rid`. */
export function formatUserFacingActionError(error: string, debugId?: string): string {
  if (!debugId?.trim()) return error;
  return `${error} Ref: ${shortCorrelationId(debugId)}`;
}
