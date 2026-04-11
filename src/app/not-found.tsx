import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container" style={{ maxWidth: 560 }}>
      <div className="card" style={{ textAlign: "center" }}>
        <h1 style={{ marginTop: 0 }}>Page not found</h1>
        <p className="muted">
          This page does not exist or the link may have expired.
        </p>
        <div style={{ marginTop: 16 }}>
          <Link className="btn primary" href="/">
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
