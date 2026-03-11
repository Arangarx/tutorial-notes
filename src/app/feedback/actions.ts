"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { db } from "@/lib/db";

export async function submitFeedback(formData: FormData) {
  const kind = String(formData.get("kind") ?? "FEEDBACK");
  const message = String(formData.get("message") ?? "").trim();
  if (!message) throw new Error("Message required");

  const h = await headers();
  const page = h.get("referer") ?? null;

  await db.feedbackItem.create({
    data: { kind: kind === "BUG" ? "BUG" : "FEEDBACK", message, page },
  });

  revalidatePath("/admin/feedback");
}

