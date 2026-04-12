import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — Tutoring Notes",
  description: "How Tutoring Notes collects, uses, and protects your data.",
};

export default function PrivacyPage() {
  return (
    <div className="container" style={{ maxWidth: 720 }}>
      <div className="card">
        <h1 style={{ marginTop: 0 }}>Privacy Policy</h1>
        <p className="muted" style={{ fontSize: 14 }}>Last updated: April 2026</p>

        <div className="divider" style={{ margin: "20px 0" }} />

        <section style={{ display: "grid", gap: 16 }}>
          <div>
            <h2 style={{ fontSize: 18, margin: 0 }}>What Tutoring Notes is</h2>
            <p style={{ margin: "8px 0 0" }}>
              Tutoring Notes is a web application that helps private tutors write session notes and share
              updates with students and their families. It is operated by Andrew Mortensen.
            </p>
          </div>

          <div>
            <h2 style={{ fontSize: 18, margin: 0 }}>What data we collect</h2>
            <ul style={{ margin: "8px 0 0", paddingLeft: 20, lineHeight: 1.7 }}>
              <li><strong>Account information:</strong> email address, hashed password, and optional display name when you create an account.</li>
              <li><strong>Session notes:</strong> student names, session dates, topics, homework, next steps, and any links you add.</li>
              <li><strong>Parent/guardian email addresses</strong> you enter when sending updates.</li>
              <li><strong>Email logs:</strong> copies of outbound messages (subject, recipient, body text, share link).</li>
              <li><strong>Feedback submissions:</strong> messages and optional contact email submitted through the feedback form.</li>
              <li><strong>Waitlist entries:</strong> email and optional name from the landing page interest form.</li>
              <li><strong>Gmail OAuth tokens</strong> if you use &ldquo;Connect Gmail&rdquo; (see below).</li>
            </ul>
          </div>

          <div>
            <h2 style={{ fontSize: 18, margin: 0 }}>How we use your data</h2>
            <p style={{ margin: "8px 0 0" }}>
              Your data is used solely to operate the product: signing in, storing and displaying session
              notes, generating share links, and sending the email updates you choose to send. We do not
              sell, rent, or share personal data with third parties for marketing or advertising.
            </p>
          </div>

          <div>
            <h2 style={{ fontSize: 18, margin: 0 }}>Gmail integration (Connect Gmail)</h2>
            <p style={{ margin: "8px 0 0" }}>
              When you click &ldquo;Connect Gmail,&rdquo; the app requests permission to send email on your behalf
              using the <strong>Gmail API</strong> (<code>gmail.send</code> scope) and to read your email
              address (<code>userinfo.email</code> scope). These permissions are used exclusively to send
              session-update emails from your Gmail account when you click &ldquo;Send update&rdquo; in the app.
            </p>
            <p style={{ margin: "8px 0 0" }}>
              We store a refresh token so the app can send on your behalf without asking you to sign in
              each time. We do <strong>not</strong> read, search, modify, or delete any of your existing
              emails. You can disconnect Gmail at any time from Settings → Email, which deletes the stored
              token.
            </p>
          </div>

          <div>
            <h2 style={{ fontSize: 18, margin: 0 }}>Where data is stored</h2>
            <p style={{ margin: "8px 0 0" }}>
              Data is stored in a PostgreSQL database hosted on <strong>Neon</strong> (US region). The
              application is hosted on <strong>Vercel</strong>. Both providers maintain their own security
              and compliance practices.
            </p>
          </div>

          <div>
            <h2 style={{ fontSize: 18, margin: 0 }}>Data retention and deletion</h2>
            <p style={{ margin: "8px 0 0" }}>
              Data is retained as long as your account exists. Tutors can delete individual students and
              notes from within the app. If you want your account or all associated data deleted, contact
              us at the email below and we will process the request promptly.
            </p>
          </div>

          <div>
            <h2 style={{ fontSize: 18, margin: 0 }}>Security</h2>
            <p style={{ margin: "8px 0 0" }}>
              Passwords are hashed with bcrypt before storage. All connections use HTTPS. OAuth tokens are
              stored in the database and are not exposed to the browser. We follow reasonable security
              practices but cannot guarantee absolute security.
            </p>
          </div>

          <div>
            <h2 style={{ fontSize: 18, margin: 0 }}>Contact</h2>
            <p style={{ margin: "8px 0 0" }}>
              For privacy questions, data deletion requests, or concerns, email{" "}
              <a href="mailto:arangarx+tutoringnotes@gmail.com">arangarx+tutoringnotes@gmail.com</a>.
            </p>
          </div>
        </section>

        <div className="divider" style={{ margin: "20px 0" }} />

        <p className="muted" style={{ fontSize: 13 }}>
          <Link href="/">Home</Link> · <Link href="/terms">Terms</Link>
        </p>
      </div>
    </div>
  );
}
