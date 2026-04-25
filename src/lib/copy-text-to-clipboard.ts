/**
 * Best-effort copy to the system clipboard.
 *
 * After any `await` in a click handler, `navigator.clipboard.writeText` may
 * reject with NotAllowed / "Document is not focused" because the browser no
 * longer treats the call as part of a user gesture. A hidden
 * `textarea` + `document.execCommand("copy")` is more permissive in that
 * situation and often succeeds when the async Clipboard API does not.
 *
 * @returns which strategy succeeded, or throws if the user cancels the prompt
 *   fallback.
 */
export async function copyTextToClipboard(
  text: string
): Promise<"clipboard" | "execCommand" | "prompt"> {
  if (typeof document === "undefined") {
    throw new Error("Clipboard is not available in this context.");
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      if (document.hasFocus && !document.hasFocus() && typeof window !== "undefined") {
        window.focus();
      }
      await navigator.clipboard.writeText(text);
      return "clipboard";
    } catch {
      // Fall through: common after one or more `await` calls before this.
    }
  }

  if (copyTextViaExecCommand(text)) {
    return "execCommand";
  }

  if (typeof window === "undefined") {
    throw new Error("Copy failed in this environment.");
  }
  const ok = window.prompt("Copy this link (select all, then Ctrl+C):", text);
  if (ok === null) {
    throw new Error("Copy was cancelled.");
  }
  return "prompt";
}

function copyTextViaExecCommand(text: string): boolean {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.setAttribute("aria-hidden", "true");
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  ta.style.top = "0";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  ta.setSelectionRange(0, text.length);
  let success = false;
  try {
    success = document.execCommand("copy");
  } catch {
    success = false;
  } finally {
    document.body.removeChild(ta);
  }
  return success;
}
