"use client";

import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="container" style={{ maxWidth: 560 }}>
      <div className="card">
        <h1 style={{ marginTop: 0 }}>Forgot password</h1>
        <p className="muted">
          Enter the email for your admin account. If it exists and email is configured, we will send a
          reset link.
        </p>
        <p className="muted" style={{ fontSize: 13 }}>
          Accounts that only use <code style={{ fontSize: 12 }}>ADMIN_EMAIL</code> /{" "}
          <code style={{ fontSize: 12 }}>ADMIN_PASSWORD</code> in server config are not reset here —
          update the server environment instead.
        </p>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            setMessage(null);
            try {
              const res = await fetch("/api/auth/forgot-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
              });
              const data = (await res.json()) as { ok?: boolean; message?: string; error?: string };
              if (!res.ok || !data.ok) {
                setError(data.error ?? "Something went wrong.");
                return;
              }
              setMessage(data.message ?? "Check your email.");
            } catch {
              setError("Network error. Try again.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <div style={{ marginTop: 16 }}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          {error ? <p style={{ color: "#ffb4b4", marginTop: 12 }}>{error}</p> : null}
          {message ? <p style={{ marginTop: 12 }}>{message}</p> : null}

          <div className="row" style={{ justifyContent: "space-between", marginTop: 16 }}>
            <Link href="/login" className="muted" style={{ fontSize: 14, textDecoration: "underline" }}>
              Back to login
            </Link>
            <button className="btn primary" type="submit" disabled={busy}>
              {busy ? "Sending…" : "Send reset link"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
