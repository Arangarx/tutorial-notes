"use client";

import Link from "next/link";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="container" style={{ maxWidth: 560 }}>
      <div className="card" style={{ textAlign: "center" }}>
        <h1 style={{ marginTop: 0 }}>Something went wrong</h1>
        <p className="muted">
          An unexpected error occurred. You can try again or go back to the home page.
        </p>
        <div className="row" style={{ justifyContent: "center", marginTop: 16 }}>
          <button className="btn primary" onClick={reset}>
            Try again
          </button>
          <Link className="btn" href="/">
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
