"use client";

import { useState } from "react";
import { ModalPortal } from "@/components/ModalPortal";
import { SubmitButton } from "@/components/SubmitButton";
import { createWhiteboardSession } from "./actions";

/**
 * "Start whiteboard session" button + consent modal.
 *
 * Why a modal at all: whiteboard plan guardrail #4 + adversarial
 * review item #14. The tutor must explicitly acknowledge that the
 * session will record audio and stroke timing before the session
 * row is created. A subtle inline checkbox loses to a modal because
 * it forces the tutor to look at the consent copy before the click
 * that mints the session.
 *
 * The modal is purely a UX gate — `createWhiteboardSession` re-checks
 * the consent flag server-side, so a tutor who bypasses this UI
 * (Postman, browser devtools) still gets rejected. See the action's
 * docblock for the back/forward bypass rationale.
 *
 * The dialog is wrapped in `<ModalPortal>` so its `position: fixed`
 * backdrop escapes the parent `.card`'s stacking context (the
 * `.card { backdrop-filter: blur(...) }` rule creates a new stacking
 * context that traps fixed children — see ModalPortal.tsx docblock
 * for the gritty details).
 */
export function StartWhiteboardSession({
  studentId,
}: {
  studentId: string;
}) {
  const [open, setOpen] = useState(false);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    setOpen(false);
    setConsent(false);
    setError(null);
  };

  const modal = open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="wb-consent-title"
          aria-describedby="wb-consent-body"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={(e) => {
            // Close only when the backdrop itself is clicked, not on
            // child clicks. This keeps stray clicks inside the dialog
            // from accidentally dismissing the consent flow.
            if (e.target === e.currentTarget) handleClose();
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: 520,
              width: "calc(100% - 32px)",
              padding: 24,
              // Override .card's translucent --panel with a solid dark surface
              // so the modal pops from the backdrop and inherited white text
              // stays readable. Matches .admin-nav-drawer's hex.
              background: "#0d1328",
              border: "1px solid var(--border)",
            }}
          >
            <h3 id="wb-consent-title" style={{ marginTop: 0 }}>
              Start a whiteboard session
            </h3>
            <p id="wb-consent-body" className="muted" style={{ fontSize: 14 }}>
              The whiteboard records both the audio of the session and a
              timestamped log of every stroke drawn on the canvas — by you
              and by the student. The recording is stored in your account
              and is used to generate session notes after the session ends.
            </p>
            <p className="muted" style={{ fontSize: 13 }}>
              Confirm with the student before clicking Start that they are
              comfortable being recorded for the duration of the session.
            </p>

            <form
              action={async (fd) => {
                setError(null);
                try {
                  await createWhiteboardSession(studentId, fd);
                  // The action calls redirect() on success, which throws a
                  // NEXT_REDIRECT inside the form handler. We never reach
                  // this line on success.
                } catch (err) {
                  // NEXT_REDIRECT is the success path — let it propagate so
                  // the framework can navigate.
                  if (
                    err &&
                    typeof err === "object" &&
                    "digest" in err &&
                    typeof (err as { digest?: string }).digest === "string" &&
                    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
                  ) {
                    throw err;
                  }
                  // In production, Next.js replaces server-action error
                  // messages with the generic "An error occurred in the
                  // Server Components render..." string and parks the
                  // real failure behind a `digest`. Surfacing the digest
                  // is the only way for the tutor to give us a needle to
                  // grep Vercel logs by; the message alone is useless.
                  const digest =
                    err && typeof err === "object" && "digest" in err
                      ? String((err as { digest?: unknown }).digest ?? "")
                      : "";
                  const rawMsg =
                    err instanceof Error
                      ? err.message
                      : "Could not start the session.";
                  // The redacted-in-production message is verbose and
                  // scary. Replace it with friendlier copy when we see
                  // it; keep dev/test messages as-is so devs see the
                  // real cause.
                  const isRedacted = rawMsg.includes(
                    "omitted in production builds"
                  );
                  const friendlyMsg = isRedacted
                    ? "Could not start the session — the server hit an unexpected error."
                    : rawMsg;
                  setError(
                    digest
                      ? `${friendlyMsg}\n\nError ID: ${digest}\n(copy this and send it back so we can find the failure in the server logs).`
                      : friendlyMsg
                  );
                  // Also log the full error to the browser console so
                  // devtools shows the entire payload.
                  // eslint-disable-next-line no-console
                  console.error(
                    "[createWhiteboardSession] failed",
                    { digest, message: rawMsg, err }
                  );
                }
              }}
              style={{ marginTop: 16 }}
            >
              <label
                htmlFor="wb-consent-checkbox"
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  marginBottom: 16,
                  cursor: "pointer",
                }}
              >
                <input
                  id="wb-consent-checkbox"
                  type="checkbox"
                  name="consentAcknowledged"
                  value="true"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  // The native required attribute is intentionally omitted
                  // because we gate the Start button explicitly below;
                  // mixing both would let the browser surface a generic
                  // "fill in this field" tooltip that obscures the real
                  // copy.
                />
                <span style={{ fontSize: 14, lineHeight: 1.4 }}>
                  I have informed the student that audio and whiteboard
                  activity will be recorded for the duration of this
                  session, and they are comfortable with that.
                </span>
              </label>

              {error && (
                <p
                  role="alert"
                  style={{
                    color: "var(--color-error, #dc2626)",
                    fontSize: 13,
                    marginBottom: 12,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {error}
                </p>
              )}

              <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
                <button type="button" className="btn" onClick={handleClose}>
                  Cancel
                </button>
                <SubmitButton
                  label="Start session"
                  pendingLabel="Starting…"
                  disabled={!consent}
                />
              </div>
            </form>
          </div>
        </div>
      ) : null;

  return (
    <>
      <button
        type="button"
        className="btn"
        onClick={() => setOpen(true)}
        data-testid="start-whiteboard-session-btn"
      >
        Start whiteboard session
      </button>
      {modal ? <ModalPortal>{modal}</ModalPortal> : null}
    </>
  );
}
