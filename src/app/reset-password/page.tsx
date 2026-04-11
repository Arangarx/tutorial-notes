"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!token) {
    return (
      <div className="card">
        <h1 style={{ marginTop: 0 }}>Invalid link</h1>
        <p className="muted">This page needs a reset token from your email.</p>
        <p style={{ marginTop: 16 }}>
          <Link href="/forgot-password" style={{ textDecoration: "underline" }}>
            Request a new link
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <h1 style={{ marginTop: 0 }}>Set a new password</h1>
      <p className="muted">Choose a strong password (at least 8 characters).</p>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          if (password !== confirm) {
            setError("Passwords do not match.");
            return;
          }
          setBusy(true);
          try {
            const res = await fetch("/api/auth/reset-password", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token, password }),
            });
            const data = (await res.json()) as { ok?: boolean; error?: string };
            if (!res.ok || !data.ok) {
              setError(data.error ?? "Could not reset password.");
              return;
            }
            router.push("/login?reset=1");
          } catch {
            setError("Network error. Try again.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div style={{ marginTop: 16 }}>
          <label htmlFor="password">New password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>
        <div style={{ marginTop: 12 }}>
          <label htmlFor="confirm">Confirm password</label>
          <input
            id="confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>

        {error ? <p style={{ color: "#ffb4b4", marginTop: 12 }}>{error}</p> : null}

        <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save password"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="container" style={{ maxWidth: 560 }}>
      <Suspense
        fallback={
          <div className="card">
            <p className="muted">Loading…</p>
          </div>
        }
      >
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
