"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdmin, getAdminByEmail } from "@/lib/auth-db";

const SignupSchema = z
  .object({
    email: z.string().email("Enter a valid email."),
    password: z.string().min(8, "Password must be at least 8 characters."),
    passwordConfirm: z.string(),
    displayName: z.string().optional(),
  })
  .refine((d) => d.password === d.passwordConfirm, {
    message: "Passwords do not match.",
    path: ["passwordConfirm"],
  });

export async function signup(
  _prev: { error?: string } | null,
  formData: FormData
): Promise<{ error?: string } | null> {
  const raw = {
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
    passwordConfirm: String(formData.get("passwordConfirm") ?? ""),
    displayName: String(formData.get("displayName") ?? "").trim(),
  };

  const parsed = SignupSchema.safeParse({
    email: raw.email,
    password: raw.password,
    passwordConfirm: raw.passwordConfirm,
    displayName: raw.displayName || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your inputs and try again." };
  }

  const { email, password, displayName } = parsed.data;
  const existing = await getAdminByEmail(email);
  if (existing) {
    return { error: "An account with this email already exists. Sign in instead." };
  }

  await createAdmin(email, password, displayName ?? null);
  redirect("/login?registered=1");
}
