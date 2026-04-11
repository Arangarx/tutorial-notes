"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useState, useEffect } from "react";

function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/admin/students";
  const resetOk = searchParams.get("reset") === "1";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetch("/api/setup-required")
      .then((r) => r.json())
      .then((data: { setupRequired?: boolean }) => {
        if (data.setupRequired) window.location.href = "/setup";
        else setReady(true);
      })
      .catch(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <div className="container" style={{ maxWidth: 560 }}>
        <div className="card">
          <p className="muted">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ maxWidth: 560 }}>
      <div className="card">
        <h1 style={{ marginTop: 0 }}>Login</h1>
        <p className="muted">
          Sign in with your admin account.
        </p>
        {resetOk ? (
          <p style={{ marginTop: 12, color: "rgba(180,255,200,0.95)" }}>
            Your password was updated. Sign in with your new password.
          </p>
        ) : null}

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);

            const res = await signIn("credentials", {
              email,
              password,
              callbackUrl,
              redirect: false,
            });

            setBusy(false);
            if (!res || res.error) {
              setError("Invalid credentials.");
              return;
            }
            window.location.href = res.url ?? callbackUrl;
          }}
        >
          <div style={{ marginTop: 16 }}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="email"
              required
            />
          </div>
          <div style={{ marginTop: 12 }}>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
              required
            />
          </div>

          {error ? (
            <p style={{ color: "#ffb4b4", marginTop: 12 }}>{error}</p>
          ) : null}

          <div className="row" style={{ justifyContent: "space-between", marginTop: 16 }}>
            <Link
              href="/forgot-password"
              className="muted"
              style={{ fontSize: 14, textDecoration: "underline", alignSelf: "center" }}
            >
              Forgot password?
            </Link>
            <button className="btn primary" disabled={busy} type="submit">
              {busy ? "Signing in..." : "Sign in"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="container" style={{ maxWidth: 560 }}>
        <div className="card"><p className="muted">Loading...</p></div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}

