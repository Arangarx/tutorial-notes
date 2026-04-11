import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy — Tutoring Notes",
  description: "How Tutoring Notes handles tutor and student-related data.",
};

export default function PrivacyPage() {
  return (
    <div className="container" style={{ maxWidth: 720 }}>
      <div className="card">
        <h1 style={{ marginTop: 0 }}>Privacy policy</h1>
        <p className="muted" style={{ fontSize: 14 }}>
          <strong>Summary:</strong> This app is operated by whoever deploys it (the tutor or their organization).
          Student names, session notes, parent contact details, and email content stay under that operator’s
          control. Replace this page with your own legal text before a broad public launch; the sections below
          are a sensible default for a self-hosted tutoring tool.
        </p>

        <div className="divider" style={{ margin: "20px 0" }} />

        <section style={{ display: "grid", gap: 12 }}>
          <h2 style={{ fontSize: 18, margin: 0 }}>What we collect</h2>
          <p className="muted" style={{ margin: 0 }}>
            The application may store: tutor/admin account email and password (hashed); optional display name;
            student names; session notes and metadata; parent or guardian email addresses you enter; outbound
            email copies or logs where the product records them; optional feedback messages you submit; and
            OAuth tokens if you connect Gmail or similar for sending mail.
          </p>

          <h2 style={{ fontSize: 18, margin: "8px 0 0" }}>How we use it</h2>
          <p className="muted" style={{ margin: 0 }}>
            Data is used to run the product: sign-in, storing notes, generating share links, and sending updates
            you choose to send. We do not sell personal data. Analytics are not built into this template unless
            you add them.
          </p>

          <h2 style={{ fontSize: 18, margin: "8px 0 0" }}>Where it lives</h2>
          <p className="muted" style={{ margin: 0 }}>
            Data is stored in the database configured by the deployer (<code>DATABASE_URL</code>). You are
            responsible for backups, access control, and choosing a host that meets your retention needs.
          </p>

          <h2 style={{ fontSize: 18, margin: "8px 0 0" }}>Retention</h2>
          <p className="muted" style={{ margin: 0 }}>
            Records remain until deleted by an admin or removed with the database. Define your own retention
            policy for students and parents and implement deletion if your jurisdiction requires it.
          </p>

          <h2 style={{ fontSize: 18, margin: "8px 0 0" }}>Contact</h2>
          <p className="muted" style={{ margin: 0 }}>
            For privacy questions, contact the person or organization that gave you access to this deployment
            (your tutor or admin).
          </p>
        </section>
      </div>
    </div>
  );
}
