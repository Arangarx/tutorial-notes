import type { Metadata } from "next";
import Link from "next/link";
import SignupForm from "./SignupForm";

export const metadata: Metadata = {
  title: "Sign up — Tutoring Notes",
  description: "Create a tutor account for Tutoring Notes.",
};

export default function SignupPage() {
  return (
    <div className="container" style={{ maxWidth: 560 }}>
      <div className="card">
        <h1 style={{ marginTop: 0 }}>Create account</h1>
        <p className="muted">
          Sign up with email and password. Each account is separate — your students and notes stay in your
          workspace.
        </p>
        <SignupForm />
        <p className="muted" style={{ marginTop: 24, fontSize: 13 }}>
          <Link href="/">← Home</Link>
        </p>
      </div>
    </div>
  );
}
