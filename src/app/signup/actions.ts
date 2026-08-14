"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdmin } from "@/lib/auth-db";
import { findEmailRealmPresence } from "@/lib/cross-realm-email";
import { notifyOperatorsOfNewSignup } from "@/lib/notify-operator-new-signup";
import { validatePasswordStrength, MIN_PASSWORD_LENGTH } from "@/lib/password-strength";

const SignupSchema = z
  .object({
    email: z.string().email("Enter a valid email."),
    password: z
      .string()
      .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`),
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

  const strengthCheck = validatePasswordStrength(password);
  if (!strengthCheck.ok) {
    return { error: strengthCheck.feedback || "Password is too weak. Try a longer phrase." };
  }

  const presence = await findEmailRealmPresence(email);
  if (presence.inAdmin || presence.inAccountHolder) {
    // Anti-enumeration: a malicious actor can otherwise probe which emails
    // have accounts. Redirect to the same /login?registered=1 destination
    // a successful signup would hit, so the externally-observable outcome
    // is identical regardless of pre-existence. Real new accounts get the
    // expected "Sign in with the email and password you just chose"
    // confirmation; existing accounts also land on /login (no duplicate
    // row created, no password silently changed) and the legitimate user
    // who genuinely forgot they had an account just signs in or uses the
    // /forgot-password flow from there.
    //
    // (Tradeoff: legitimate "I forgot I already have an account" users
    // get no explicit "account exists" hint. Acceptable; the Forgot-password
    // affordance on /login covers that path.)
    redirect("/login?registered=1");
  }

  await createAdmin(email, password, displayName ?? null);
  await notifyOperatorsOfNewSignup({
    email: email.trim().toLowerCase(),
    displayName: displayName ?? null,
    method: "credentials",
  });
  redirect("/login?registered=1");
}
