"use client";

import Link from "next/link";

export default function AdminError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="card" style={{ textAlign: "center" }}>
      <h1 style={{ marginTop: 0 }}>Something went wrong</h1>
      <p className="muted">
        An unexpected error occurred in the admin area.
      </p>
      <div className="row" style={{ justifyContent: "center", marginTop: 16 }}>
        <button className="btn primary" onClick={reset}>
          Try again
        </button>
        <Link className="btn" href="/admin/students">
          Students
        </Link>
      </div>
    </div>
  );
}
