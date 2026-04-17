"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { signup } from "./actions";

export default function SignupForm() {
  const [state, formAction] = useActionState(signup, null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      action={formAction}
      onSubmit={() => setBusy(true)}
    >
      <div style={{ marginTop: 16 }}>
        <label htmlFor="signup-email">Email</label>
        <input
          id="signup-email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </div>
      <div style={{ marginTop: 12 }}>
        <label htmlFor="signup-password">Password</label>
        <input
          id="signup-password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>
      <div style={{ marginTop: 12 }}>
        <label htmlFor="signup-password-confirm">Confirm password</label>
        <input
          id="signup-password-confirm"
          name="passwordConfirm"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>
      <div style={{ marginTop: 12 }}>
        <label htmlFor="signup-displayName">Your name (shown to parents in emails)</label>
        <input
          id="signup-displayName"
          name="displayName"
          type="text"
          autoComplete="name"
          placeholder="e.g. Alex Chen"
        />
        <p className="muted" style={{ marginTop: 6, fontSize: 13 }}>
          Optional but recommended. You can change this later under Admin → Profile.
        </p>
      </div>
      {state?.error ? (
        <p style={{ color: "#ffb4b4", marginTop: 12 }}>{state.error}</p>
      ) : null}
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
        <button className="btn primary" disabled={busy} type="submit">
          {busy ? "Creating…" : "Create account"}
        </button>
      </div>
      <p className="muted" style={{ marginTop: 16, fontSize: 14 }}>
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </form>
  );
}
