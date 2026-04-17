"use client";

import Link from "next/link";
import { useState } from "react";

export default function HomePage() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleWaitlist(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Something went wrong. Try again.");
        return;
      }
      setSuccess(data.message ?? "You're on the list!");
      setEmail("");
      setName("");
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ margin: 0 }}>Tutoring Notes</h1>
            <p className="muted" style={{ marginTop: 8 }}>
              Write session notes fast. Send a clean update to parents/students
              in one click.
            </p>
          </div>
          <div className="row">
            <Link className="btn" href="/feedback">
              Feedback
            </Link>
            <Link className="btn" href="/signup">
              Create account
            </Link>
            <Link className="btn primary" href="/login">
              Sign in
            </Link>
          </div>
        </div>

        <div className="divider" />

        <div className="row" style={{ alignItems: "stretch", flexWrap: "wrap" }}>
          <div className="card" style={{ flex: 1, minWidth: 200 }}>
            <h3 style={{ marginTop: 0 }}>For tutors</h3>
            <ul className="muted" style={{ lineHeight: 1.6 }}>
              <li>2-minute capture flow</li>
              <li>Per-student history</li>
              <li>Email delivery with outbox history</li>
            </ul>
          </div>
          <div className="card" style={{ flex: 1, minWidth: 200 }}>
            <h3 style={{ marginTop: 0 }}>For families</h3>
            <ul className="muted" style={{ lineHeight: 1.6 }}>
              <li>Clean read-only link</li>
              <li>Homework and next steps always visible</li>
              <li>Mobile-friendly layout</li>
            </ul>
          </div>
          <div className="card" style={{ flex: 1, minWidth: 200 }}>
            <h3 style={{ marginTop: 0 }}>Early access</h3>
            <p className="muted" style={{ marginBottom: 0 }}>
              Free while we&apos;re in pilot. Give us feedback and help shape the product.
            </p>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Get early access</h2>
        <p className="muted">
          We&apos;re onboarding a small group of tutors. Drop your email and
          we&apos;ll reach out with access.
        </p>

        {success ? (
          <p style={{ fontWeight: 600 }}>{success}</p>
        ) : (
          <form onSubmit={handleWaitlist}>
            <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label htmlFor="waitlist-name">Name (optional)</label>
                <input
                  id="waitlist-name"
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                />
              </div>
              <div style={{ flex: 1, minWidth: 220 }}>
                <label htmlFor="waitlist-email">Email</label>
                <input
                  id="waitlist-email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <div style={{ alignSelf: "flex-end" }}>
                <button className="btn primary" type="submit" disabled={busy}>
                  {busy ? "Sending…" : "Request access"}
                </button>
              </div>
            </div>
            {error && <p style={{ color: "#ffb4b4", marginTop: 10 }}>{error}</p>}
          </form>
        )}
      </div>

      <p className="muted" style={{ marginTop: 12 }}>
        Admin area is protected by login. Parent/student views use share links. No ads, no tracking.
      </p>
    </div>
  );
}
