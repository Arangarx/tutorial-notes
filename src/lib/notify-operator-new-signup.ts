/**
 * Best-effort operator notification when a new tutor account is created (WAITLISTED).
 * Fail-open — signup must succeed even when mail is unavailable.
 *
 * SERVER-ONLY.
 */

import { getOperatorEmailSet } from "@/lib/operator";
import { sendMail } from "@/lib/email";
import { getPublicBaseUrl } from "@/lib/public-url";

export type NewSignupMethod = "credentials" | "google";

export async function notifyOperatorsOfNewSignup(opts: {
  email: string;
  displayName?: string | null;
  method: NewSignupMethod;
}): Promise<void> {
  const recipients = Array.from(getOperatorEmailSet());
  if (recipients.length === 0) return;

  const base = getPublicBaseUrl();
  const methodLabel =
    opts.method === "google" ? "Google OAuth" : "email and password";

  try {
    await sendMail({
      to: recipients.join(", "),
      subject: `New tutor signup (WAITLISTED): ${opts.email}`,
      text: [
        "A new tutor account was created and is WAITLISTED pending your approval.",
        "",
        `Email: ${opts.email}`,
        opts.displayName ? `Name: ${opts.displayName}` : null,
        `Signup method: ${methodLabel}`,
        `Approval status: WAITLISTED`,
        "",
        `Review and approve at: ${base}/admin/tutor-approvals`,
        "",
        "— Tutoring Notes (automated)",
      ]
        .filter((line): line is string => line !== null)
        .join("\n"),
    });
  } catch {
    // Email not configured or failed — not a blocker for signup.
  }
}
