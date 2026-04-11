"use server";

import { redirect } from "next/navigation";
import { hasAdminUsers, createAdmin } from "@/lib/auth-db";
import { sendMail } from "@/lib/email";
import { getPublicBaseUrl } from "@/lib/public-url";
import { setupBlockedNoSecretInProduction, setupTokenValid } from "@/lib/setup-guard";

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
  const displayName = String(formData.get("displayName") ?? "").trim() || null;

  if (!email || !password) return { error: "Email and password required" };
  if (password.length < 6) return { error: "Password must be at least 6 characters" };

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
