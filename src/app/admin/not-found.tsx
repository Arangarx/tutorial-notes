import Link from "next/link";

export default function AdminNotFound() {
  return (
    <div className="card" style={{ textAlign: "center" }}>
      <h1 style={{ marginTop: 0 }}>Not found</h1>
      <p className="muted">
        This item does not exist or may have been deleted.
      </p>
      <div style={{ marginTop: 16 }}>
        <Link className="btn primary" href="/admin/students">
          Back to Students
        </Link>
      </div>
    </div>
  );
}
