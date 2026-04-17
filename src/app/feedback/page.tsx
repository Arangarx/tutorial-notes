"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { submitFeedback, type FeedbackResult } from "./actions";

function SendButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn primary" type="submit" disabled={pending}>
      {pending ? "Sending…" : "Send"}
    </button>
  );
}

export default function FeedbackPage() {
  const { status } = useSession();
  const signedIn = status === "authenticated";
  const [state, formAction] = useActionState(
    submitFeedback,
    null as FeedbackResult | null
  );

  if (state?.ok) {
    return (
      <div className="container" style={{ maxWidth: 720 }}>
        <div className="card">
          <h1 style={{ margin: 0 }}>Thanks for the feedback!</h1>
          <p className="muted" style={{ marginTop: 10 }}>
            Your message was received. We read every submission.
          </p>
          <div style={{ marginTop: 16 }}>
            <Link className="btn primary" href={signedIn ? "/admin" : "/"}>
              {signedIn ? "Back to dashboard" : "Back to home"}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ maxWidth: 720 }}>
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h1 style={{ margin: 0 }}>Feedback</h1>
          <Link className="btn" href={signedIn ? "/admin" : "/"}>
            {signedIn ? "Dashboard" : "Home"}
          </Link>
        </div>

        <p className="muted" style={{ marginTop: 10 }}>
          Found a bug or have a suggestion? Send it here — we read every submission. (No account
          required.)
        </p>

        <div className="divider" />

        <form action={formAction}>
          <div className="row">
            <div style={{ flex: 1, minWidth: 220 }}>
              <label htmlFor="feedback-kind">Type</label>
              <select id="feedback-kind" name="kind" defaultValue="FEEDBACK">
                <option value="FEEDBACK">Feedback</option>
                <option value="BUG">Bug report</option>
              </select>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <label htmlFor="feedback-contactEmail">Your email (optional)</label>
            <input
              id="feedback-contactEmail"
              name="contactEmail"
              type="email"
              autoComplete="email"
              placeholder="So we can reply if needed"
            />
          </div>

          <div style={{ marginTop: 12 }}>
            <label htmlFor="feedback-message">Message</label>
            <textarea
              id="feedback-message"
              name="message"
              rows={6}
              placeholder="What should be improved? What went wrong?"
              required
              maxLength={10000}
            />
          </div>

          {state?.ok === false && (
            <p style={{ color: "#ffb4b4", marginTop: 12 }}>{state.error}</p>
          )}

          <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
            <SendButton />
          </div>
        </form>
      </div>
    </div>
  );
}
