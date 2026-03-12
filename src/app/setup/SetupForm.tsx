"use client";

import { useActionState, useState } from "react";
import { createFirstAdmin } from "./actions";

export default function SetupForm() {
  const [state, formAction] = useActionState(createFirstAdmin, null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      action={formAction}
      onSubmit={() => setBusy(true)}
    >
      <div style={{ marginTop: 16 }}>
        <label htmlFor="setup-email">Email</label>
        <input
          id="setup-email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </div>
      <div style={{ marginTop: 12 }}>
        <label htmlFor="setup-password">Password</label>
        <input
          id="setup-password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={6}
          required
        />
      </div>
      {state?.error ? (
        <p style={{ color: "#ffb4b4", marginTop: 12 }}>{state.error}</p>
      ) : null}
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
        <button className="btn primary" disabled={busy} type="submit">
          {busy ? "Creating..." : "Create account"}
        </button>
      </div>
    </form>
  );
}
