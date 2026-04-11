"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { changePassword, sendPasswordResetEmail } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn primary" type="submit" disabled={pending}>
      {pending ? "Saving…" : "Update password"}
    </button>
  );
}

export default function ChangePasswordForm() {
  const [state, formAction] = useActionState(changePassword, null);
  const formRef = useRef<HTMLFormElement>(null);
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const [resetErr, setResetErr] = useState<string | null>(null);
  const [resetPending, startReset] = useTransition();

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state?.ok]);

  return (
    <div style={{ maxWidth: 440 }}>
      <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: "1.1rem" }}>Password</h2>

      <form ref={formRef} action={formAction}>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          Change your password here if you know your current one (at least 8 characters).
        </p>
        <div style={{ marginTop: 16 }}>
          <label htmlFor="current-password">Current password</label>
          <input
            id="current-password"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        <div style={{ marginTop: 12 }}>
          <label htmlFor="new-password">New password</label>
          <input
            id="new-password"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>
        <div style={{ marginTop: 12 }}>
          <label htmlFor="confirm-password">Confirm new password</label>
          <input
            id="confirm-password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>
        {state?.error ? (
          <p style={{ color: "#ffb4b4", marginTop: 12 }}>{state.error}</p>
        ) : null}
        {state?.ok ? (
          <p style={{ color: "#90ee90", marginTop: 12 }}>
            Password updated. Use your new password next time you sign in.
          </p>
        ) : null}
        <div style={{ marginTop: 16 }}>
          <SubmitButton />
        </div>
      </form>

      <div className="divider" style={{ margin: "24px 0" }} />

      <h3 style={{ marginTop: 0, marginBottom: 8, fontSize: "1rem", fontWeight: 600 }}>
        Reset via email
      </h3>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        We’ll send a link to <strong>your signed-in email</strong> so you can set a new password without your current
        one. Requires email (SMTP or Gmail) to be configured for the app.
      </p>
      {resetErr ? <p style={{ color: "#ffb4b4", marginTop: 12 }}>{resetErr}</p> : null}
      {resetMsg ? <p style={{ color: "#90ee90", marginTop: 12 }}>{resetMsg}</p> : null}
      <button
        type="button"
        className="btn"
        style={{ marginTop: 12 }}
        disabled={resetPending}
        onClick={() => {
          setResetErr(null);
          setResetMsg(null);
          startReset(async () => {
            const r = await sendPasswordResetEmail();
            if (r.ok && r.message) setResetMsg(r.message);
            else setResetErr(r.error ?? "Could not send reset email.");
          });
        }}
      >
        {resetPending ? "Sending…" : "Email me a reset link"}
      </button>
    </div>
  );
}
