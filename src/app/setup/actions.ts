"use server";

import { redirect } from "next/navigation";
import { hasAdminUsers, createAdmin } from "@/lib/auth-db";
import { findEmailRealmPresence } from "@/lib/cross-realm-email";
import { sendMail } from "@/lib/email";
import { getPublicBaseUrl } from "@/lib/public-url";
import { setupBlockedNoSecretInProduction, setupTokenValid } from "@/lib/setup-guard";
import { validatePasswordStrength, MIN_PASSWORD_LENGTH } from "@/lib/password-strength";

export async function createFirstAdmin(
  _prev: { error?: string } | null,
  formData: FormData
): Promise<{ error?: string }> {
  const hasAdmins = await hasAdminUsers();
  if (hasAdmins) redirect("/login");

  if (setupBlockedNoSecretInProduction()) {
    return { error: "Setup is disabled in production until SETUP_SECRET is configured. See docs/DEPLOY.md." };
  }

  const setupToken = String(formData.get("setupToken") ?? "");
  if (!setupTokenValid(setupToken)) {
    return { error: "Invalid or missing setup token. Open /setup?token=… with the same value as SETUP_SECRET." };
  }

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim() || null;

  if (!email || !password) return { error: "Email and password required" };
  if (password !== passwordConfirm) return { error: "Passwords do not match." };
  const strengthCheck = validatePasswordStrength(password);
  if (!strengthCheck.ok) {
    return {
      error:
        strengthCheck.feedback ||
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters and not too simple.`,
    };
  }

  const presence = await findEmailRealmPresence(email);
  if (presence.inAccountHolder) {
    return {
      error:
        "This email is already registered as a parent account. Sign in at /login or use a different email.",
    };
  }
  if (presence.inAdmin) {
    return {
      error: "An account with this email already exists. Sign in at /login.",
    };
  }

  await createAdmin(email, password, displayName);

  // Best-effort welcome email — silent if email is not configured.
  try {
    const base = getPublicBaseUrl();
    await sendMail({
      to: email,
      subject: "Welcome to Tutoring Notes",
      text: [
        `Hi${displayName ? ` ${displayName}` : ""},`,
        "",
        "Your Tutoring Notes account is ready.",
        "",
        `Sign in at: ${base}/login`,
        "",
        "Next steps:",
        `  • Add a student: ${base}/admin/students`,
        `  • Configure email so parents receive notes: ${base}/admin/settings/email`,
        `  • Invite feedback: ${base}/feedback`,
        "",
        "– The Tutoring Notes team",
      ].join("\n"),
    });
  } catch {
    // Email not configured or failed — not a blocker for setup.
  }

  redirect("/login?setup=done");
}
