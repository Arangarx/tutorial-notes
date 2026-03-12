"use server";

import { redirect } from "next/navigation";
import { hasAdminUsers, createAdmin } from "@/lib/auth-db";

export async function createFirstAdmin(
  _prev: { error?: string } | null,
  formData: FormData
): Promise<{ error?: string }> {
  const hasAdmins = await hasAdminUsers();
  if (hasAdmins) redirect("/login");

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { error: "Email and password required" };
  if (password.length < 6) return { error: "Password must be at least 6 characters" };

  await createAdmin(email, password);
  redirect("/login?setup=done");
}
