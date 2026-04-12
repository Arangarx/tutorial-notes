import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Use — Tutoring Notes",
  description: "Terms of use for the Tutoring Notes application.",
};

export default function TermsPage() {
  return (
    <div className="container" style={{ maxWidth: 720 }}>
      <div className="card">
        <h1 style={{ marginTop: 0 }}>Terms of Use</h1>
        <p className="muted" style={{ fontSize: 14 }}>Last updated: April 2026</p>

        <div className="divider" style={{ margin: "20px 0" }} />

        <section style={{ display: "grid", gap: 16 }}>
          <div>
            <h2 style={{ fontSize: 18, margin: 0 }}>The service</h2>
            <p style={{ margin: "8px 0 0" }}>
              Tutoring Notes is a web application that helps tutors record session notes and share
              summaries with students and parents. The service is operated by Andrew Mortensen.
            </p>
          </div>

          <div>
            <h2 style={{ fontSize: 18, margin: 0 }}>Accounts</h2>
            <p style={{ margin: "8px 0 0" }}>
              You are responsible for keeping your login credentials secure. You must not share your
              account with others or use the service for any unlawful purpose.
            </p>
          </div>

          <div>
            <h2 style={{ fontSize: 18, margin: 0 }}>Your content</h2>
            <p style={{ margin: "8px 0 0" }}>
              You retain ownership of the notes, student information, and other content you enter. By
              using the service, you grant us permission to store and transmit that content as needed to
              operate the product (for example, storing notes in the database and sending emails you initiate).
            </p>
          </div>

          <div>
            <h2 style={{ fontSize: 18, margin: 0 }}>Acceptable use</h2>
            <p style={{ margin: "8px 0 0" }}>
              You agree to use the app lawfully, to obtain any consent required for the student and
              parent data you enter, and to take responsibility for the accuracy of information and
              communications you send through the service.
            </p>
          </div>

          <div>
            <h2 style={{ fontSize: 18, margin: 0 }}>Gmail integration</h2>
            <p style={{ margin: "8px 0 0" }}>
              If you connect your Gmail account, the app sends emails on your behalf only when you
              explicitly click &ldquo;Send update.&rdquo; You can disconnect at any time from Settings → Email.
              Your use of Gmail is also subject to Google&apos;s own terms of service.
            </p>
          </div>

          <div>
            <h2 style={{ fontSize: 18, margin: 0 }}>Availability and changes</h2>
            <p style={{ margin: "8px 0 0" }}>
              We aim to keep the service available but do not guarantee uptime. Features may change or be
              removed. We will make reasonable efforts to notify users of significant changes.
            </p>
          </div>

          <div>
            <h2 style={{ fontSize: 18, margin: 0 }}>Limitation of liability</h2>
            <p style={{ margin: "8px 0 0" }}>
              The service is provided &ldquo;as is&rdquo; without warranties of any kind. To the extent permitted by
              law, we are not liable for indirect, incidental, or consequential damages arising from your
              use of the service. Educational outcomes are not guaranteed.
            </p>
          </div>

          <div>
            <h2 style={{ fontSize: 18, margin: 0 }}>Contact</h2>
            <p style={{ margin: "8px 0 0" }}>
              Questions about these terms? Email{" "}
              <a href="mailto:arangarx+tutoringnotes@gmail.com">arangarx+tutoringnotes@gmail.com</a>.
            </p>
          </div>
        </section>

        <div className="divider" style={{ margin: "20px 0" }} />

        <p className="muted" style={{ fontSize: 13 }}>
          <Link href="/">Home</Link> · <Link href="/privacy">Privacy</Link>
        </p>
      </div>
    </div>
  );
}
