"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth-options";
import { getAdminByEmail, updateAdminDisplayName, updateAdminPassword, verifyPassword } from "@/lib/auth-db";
import { requestPasswordReset } from "@/lib/password-reset";
import { requireAdminSession } from "@/lib/require-admin";

const MIN_PASSWORD_LEN = 8;

export async function saveProfileDisplayName(formData: FormData) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) throw new Error("Not signed in");

  const displayName = String(formData.get("displayName") ?? "").trim() || null;
  await updateAdminDisplayName(email, displayName);
  revalidatePath("/admin/settings/profile");
  revalidatePath("/admin");
}

export async function changePassword(
  _prev: { error?: string; ok?: boolean } | null,
  formData: FormData
): Promise<{ error?: string; ok?: boolean }> {
  await requireAdminSession();
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) return { error: "Not signed in." };

  const admin = await getAdminByEmail(email);
  if (!admin) {
    return {
      error:
        "This account uses server environment login (ADMIN_EMAIL / ADMIN_PASSWORD). Update the password in your host settings.",
    };
  }

  const current = String(formData.get("currentPassword") ?? "");
  const nextPass = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (!current || !nextPass || !confirm) {
    return { error: "Fill in current password, new password, and confirmation." };
  }
  if (nextPass.length < MIN_PASSWORD_LEN) {
    return { error: `New password must be at least ${MIN_PASSWORD_LEN} characters.` };
  }
  if (nextPass !== confirm) {
    return { error: "New passwords do not match." };
  }
  if (nextPass === current) {
    return { error: "New password must be different from your current password." };
  }

  const match = await verifyPassword(current, admin.passwordHash);
  if (!match) {
    return { error: "Current password is incorrect." };
  }

  await updateAdminPassword(email, nextPass);
  revalidatePath("/admin/settings/profile");

  return { ok: true };
}

/** Same reset email as /forgot-password, but uses the signed-in user’s email (no typing). */
export async function sendPasswordResetEmail(): Promise<{ ok: boolean; message?: string; error?: string }> {
  await requireAdminSession();
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) return { ok: false, error: "Not signed in." };

  const admin = await getAdminByEmail(email);
  if (!admin) {
    return {
      ok: false,
      error: "This login uses server environment credentials. Change password in your host settings.",
    };
  }

  await requestPasswordReset(email);
  return {
    ok: true,
    message:
      "If email delivery is configured, we sent a reset link. Check your inbox (and spam). The link expires in one hour.",
  };
}
