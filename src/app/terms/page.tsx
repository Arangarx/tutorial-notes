import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms — Tutoring Notes",
  description: "Terms of use for Tutoring Notes.",
};

export default function TermsPage() {
  return (
    <div className="container" style={{ maxWidth: 720 }}>
      <div className="card">
        <h1 style={{ marginTop: 0 }}>Terms of use</h1>
        <p className="muted" style={{ fontSize: 14 }}>
          <strong>Summary:</strong> This is template text for a self-hosted tutoring notes app. The operator of
          each deployment (tutor, school, or company) should replace this with terms appropriate for their
          jurisdiction and relationship with users.
        </p>

        <div className="divider" style={{ margin: "20px 0" }} />

        <section style={{ display: "grid", gap: 12 }}>
          <h2 style={{ fontSize: 18, margin: 0 }}>The service</h2>
          <p className="muted" style={{ margin: 0 }}>
            Tutoring Notes helps tutors record session notes and share summaries with students or parents. The
            service is provided as-is by whoever runs this instance. Features may change with updates.
          </p>

          <h2 style={{ fontSize: 18, margin: "8px 0 0" }}>Your responsibilities</h2>
          <p className="muted" style={{ margin: 0 }}>
            You agree to use the app lawfully, to obtain consent where required for student data, and to keep
            credentials secure. You are responsible for the accuracy of information you enter and for
            communications you send through the app.
          </p>

          <h2 style={{ fontSize: 18, margin: "8px 0 0" }}>Disclaimer</h2>
          <p className="muted" style={{ margin: 0 }}>
            The software is provided without warranties of any kind. The operator is not liable for indirect or
            consequential damages to the extent permitted by law. Educational outcomes are not guaranteed.
          </p>

          <h2 style={{ fontSize: 18, margin: "8px 0 0" }}>Questions</h2>
          <p className="muted" style={{ margin: 0 }}>
            Contact the administrator of this deployment for support or legal notices.
          </p>
        </section>
      </div>
    </div>
  );
}
