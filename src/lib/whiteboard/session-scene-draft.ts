/**
 * Per-tab draft of the Excalidraw `elements` array in `sessionStorage`.
 * Used so a refresh can restore strokes drawn while the tutor is still
 * "waiting for the student" — in that case `recordingActive` is false and
 * the whiteboard event log (IndexedDB) never records those onChange diffs.
 *
 * Not E2E encrypted; it never leaves the browser. Cleared on session end
 * and after a successful event blob upload.
 */

const KEY_PREFIX = "wn_wb_session_elements_v1:";

export function sessionSceneDraftKey(whiteboardSessionId: string): string {
  return `${KEY_PREFIX}${whiteboardSessionId}`;
}

export function loadSessionSceneDraft(
  whiteboardSessionId: string
): ReadonlyArray<unknown> | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(sessionSceneDraftKey(whiteboardSessionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

const MAX_DRAFT_BYTES = 4_000_000;

export function saveSessionSceneDraft(
  whiteboardSessionId: string,
  elements: ReadonlyArray<unknown>
): void {
  if (typeof sessionStorage === "undefined") return;
  if (elements.length === 0) {
    clearSessionSceneDraft(whiteboardSessionId);
    return;
  }
  try {
    const json = JSON.stringify(elements);
    if (json.length > MAX_DRAFT_BYTES) return;
    sessionStorage.setItem(sessionSceneDraftKey(whiteboardSessionId), json);
  } catch {
    // Quota or private mode — ignore.
  }
}

export function clearSessionSceneDraft(whiteboardSessionId: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(sessionSceneDraftKey(whiteboardSessionId));
  } catch {
    // ignore
  }
}
