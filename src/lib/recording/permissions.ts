/**
 * Mic permission state probe.
 *
 * The Permissions API for "microphone" is not implemented in every browser
 * (notably older Safari), so we treat any failure as "unknown" and fall back
 * to the prompt-on-Start path in the recorder hook.
 */

export type MicPermissionState = "granted" | "prompt" | "denied" | "unknown";

/**
 * Best-effort check of whether the page already has mic permission. Used to
 * decide whether to silently acquire on mount or wait for an explicit user
 * gesture.
 */
export async function queryMicPermission(): Promise<MicPermissionState> {
  try {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) {
      return "unknown";
    }
    // The "microphone" name isn't in the typed PermissionName union in some TS
    // lib targets, but it's the de facto standard. Cast to keep types happy.
    const status = await navigator.permissions.query({
      name: "microphone" as PermissionName,
    });
    return status.state;
  } catch {
    return "unknown";
  }
}
