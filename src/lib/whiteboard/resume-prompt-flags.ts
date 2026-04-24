/**
 * One-shot flags so a tutor who just confirmed the *stale room* gate
 * (WorkspaceResumeGate) is not immediately hit with a second
 * *IndexedDB checkpoint* prompt for the same session.
 */

const PREFIX = "wn_skip_idb_after_gate_v1:";

export function markSkipIndexedDbResumeAfterGate(whiteboardSessionId: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(`${PREFIX}${whiteboardSessionId}`, "1");
  } catch {
    // ignore
  }
}

/** Returns true if the flag was present (and then cleared). */
export function consumeSkipIndexedDbResumeAfterGate(whiteboardSessionId: string): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    const k = `${PREFIX}${whiteboardSessionId}`;
    if (sessionStorage.getItem(k) !== "1") return false;
    sessionStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}
