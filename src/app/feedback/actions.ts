"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { db } from "@/lib/db";

export type FeedbackResult = { ok: true } | { ok: false; error: string };

export async function submitFeedback(
  _prev: FeedbackResult | null,
  formData: FormData
): Promise<FeedbackResult> {
  const kind = String(formData.get("kind") ?? "FEEDBACK");
  const message = String(formData.get("message") ?? "").trim();
  if (!message) return { ok: false, error: "Message is required." };

  const h = await headers();
  const page = h.get("referer") ?? null;

  await db.feedbackItem.create({
    data: { kind: kind === "BUG" ? "BUG" : "FEEDBACK", message, page },
  });

  revalidatePath("/admin/feedback");
  return { ok: true };
}
