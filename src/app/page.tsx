import Link from "next/link";

export default function HomePage() {
  return (
    <div className="container">
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
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
            <Link className="btn primary" href="/admin/students">
              Open app
            </Link>
          </div>
        </div>

        <div className="divider" />

        <div className="row" style={{ alignItems: "stretch" }}>
          <div className="card" style={{ flex: 1 }}>
            <h3 style={{ marginTop: 0 }}>For tutors</h3>
            <ul className="muted" style={{ lineHeight: 1.6 }}>
              <li>2-minute capture flow</li>
              <li>Per-student history</li>
              <li>Dev email outbox for sending updates locally</li>
            </ul>
          </div>
          <div className="card" style={{ flex: 1 }}>
            <h3 style={{ marginTop: 0 }}>For families</h3>
            <ul className="muted" style={{ lineHeight: 1.6 }}>
              <li>Clean read-only link</li>
              <li>Homework and next steps are always visible</li>
              <li>Mobile-friendly layout</li>
            </ul>
          </div>
          <div className="card" style={{ flex: 1 }}>
            <h3 style={{ marginTop: 0 }}>Pricing (placeholder)</h3>
            <p className="muted">
              Starter: $— / month
              <br />
              Pro: $— / month
            </p>
            <p className="muted" style={{ marginBottom: 0 }}>
              (Pricing is a placeholder for MVP.)
            </p>
          </div>
        </div>
      </div>

      <p className="muted" style={{ marginTop: 16 }}>
        Admin area is protected by login. Parent/student views use share links.
      </p>
    </div>
  );
}

