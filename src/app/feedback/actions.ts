"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { getClientIpFromHeaders } from "@/lib/client-ip";
import { db } from "@/lib/db";
import {
  scoreFeedbackSubmission,
  truncateSubmitterIp,
} from "@/lib/feedback-spam";
import { rateLimit } from "@/lib/rate-limit";

export type FeedbackResult = { ok: true } | { ok: false; error: string };

const MAX_MESSAGE = 10_000;
const MAX_PAGE_REFERER = 2048;
const FEEDBACK_RATE_LIMIT = { max: 5, windowMs: 3_600_000 };
const HONEYPOT_FIELD = "companyWebsite";

const FeedbackFormSchema = z.object({
  kind: z.enum(["BUG", "FEEDBACK"]),
  message: z
    .string()
    .trim()
    .min(1, "Message is required.")
    .max(MAX_MESSAGE, `Message must be at most ${MAX_MESSAGE} characters.`),
  contactEmail: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().email("Enter a valid email or leave this blank.").max(320).optional()
  ),
});

export async function submitFeedback(
  _prev: FeedbackResult | null,
  formData: FormData
): Promise<FeedbackResult> {
  const honeypot = formData.get(HONEYPOT_FIELD);
  if (typeof honeypot === "string" && honeypot.trim() !== "") {
    return { ok: true };
  }

  const h = await headers();
  const ip = getClientIpFromHeaders(h);
  const rateKey = `feedback:${ip}`;
  const rl = rateLimit(
    rateKey,
    FEEDBACK_RATE_LIMIT.max,
    FEEDBACK_RATE_LIMIT.windowMs
  );
  if (!rl.allowed) {
    return {
      ok: false,
      error: "Too many submissions. Try again in an hour.",
    };
  }

  const rawKind = String(formData.get("kind") ?? "FEEDBACK");
  const messageRaw = formData.get("message");
  const contactRaw = formData.get("contactEmail");
  const parsed = FeedbackFormSchema.safeParse({
    kind: rawKind === "BUG" ? "BUG" : "FEEDBACK",
    message: typeof messageRaw === "string" ? messageRaw : "",
    contactEmail: typeof contactRaw === "string" ? contactRaw : "",
  });

  if (!parsed.success) {
    const first = parsed.error.flatten().fieldErrors;
    const msg =
      first.message?.[0] ??
      first.contactEmail?.[0] ??
      first.kind?.[0] ??
      "Check your input and try again.";
    return { ok: false, error: msg };
  }

  const { kind, message, contactEmail } = parsed.data;

  const referer = h.get("referer");
  const page =
    referer && referer.length > 0
      ? referer.slice(0, MAX_PAGE_REFERER)
      : null;

  const spam = scoreFeedbackSubmission({ message, contactEmail });
  const submitterIp = truncateSubmitterIp(ip);

  await db.feedbackItem.create({
    data: {
      kind,
      message,
      page,
      contactEmail: contactEmail ?? null,
      status: spam.isSpam ? "SPAM" : "INBOX",
      spamReason: spam.isSpam ? spam.reasons.join(", ") : null,
      submitterIp,
    },
  });

  revalidatePath("/admin/feedback");
  return { ok: true };
}
