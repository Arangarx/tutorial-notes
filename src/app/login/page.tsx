"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/admin/students";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="container" style={{ maxWidth: 560 }}>
      <div className="card">
        <h1 style={{ marginTop: 0 }}>Login</h1>
        <p className="muted">
          Use the admin credentials from your <code>.env</code>.
        </p>

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

          <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
            <button className="btn primary" disabled={busy} type="submit">
              {busy ? "Signing in..." : "Sign in"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

