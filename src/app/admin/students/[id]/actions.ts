"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { sendMail } from "@/lib/email";
import { generateShareToken, parseLinksFromTextarea } from "@/lib/security";

function baseUrl() {
  return process.env.NEXTAUTH_URL ?? "http://localhost:3000";
}

export async function regenerateShareLink(studentId: string) {
  await db.shareLink.updateMany({
    where: { studentId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  await db.shareLink.create({
    data: { studentId, token: generateShareToken() },
  });

  revalidatePath(`/admin/students/${studentId}`);
}

export async function revokeShareLink(studentId: string) {
  await db.shareLink.updateMany({
    where: { studentId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  revalidatePath(`/admin/students/${studentId}`);
}

export async function createNote(studentId: string, formData: FormData) {
  const dateStr = String(formData.get("date") ?? "");
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid date");

  const template = String(formData.get("template") ?? "").trim() || null;
  const topics = String(formData.get("topics") ?? "").trim();
  const homework = String(formData.get("homework") ?? "").trim();
  const nextSteps = String(formData.get("nextSteps") ?? "").trim();
  const linksText = String(formData.get("links") ?? "");

  const links = parseLinksFromTextarea(linksText);

  await db.sessionNote.create({
    data: {
      studentId,
      date,
      template,
      topics,
      homework,
      nextSteps,
      linksJson: JSON.stringify(links),
      status: "DRAFT",
    },
  });

  revalidatePath(`/admin/students/${studentId}`);
}

export async function setNoteStatus(noteId: string, studentId: string, status: "DRAFT" | "READY") {
  await db.sessionNote.update({ where: { id: noteId }, data: { status } });
  revalidatePath(`/admin/students/${studentId}`);
}

export type SendUpdateResult = {
  ok: boolean;
  sent: boolean;
  outboxOnly?: boolean;
  error?: string;
  toEmail?: string;
};

export async function sendUpdateEmail(
  _prev: SendUpdateResult | null,
  formData: FormData
): Promise<SendUpdateResult> {
  const studentId = String(formData.get("studentId") ?? "").trim();
  const toEmail = String(formData.get("toEmail") ?? "").trim();
  if (!studentId || !toEmail) return { ok: false, sent: false, error: "Student and email required" };

  const activeLink =
    (await db.shareLink.findFirst({
      where: { studentId, revokedAt: null },
      orderBy: { createdAt: "desc" },
    })) ??
    (await db.shareLink.create({
      data: { studentId, token: generateShareToken() },
    }));

  const linkUrl = `${baseUrl()}/s/${activeLink.token}`;

  const student = await db.student.findUniqueOrThrow({ where: { id: studentId } });
  const subject = `Session update — ${student.name}`;
  const bodyText = `Hi!\n\nHere is the latest session update for ${student.name}:\n${linkUrl}\n\n— Tutor`;

  await db.emailMessage.create({
    data: { toEmail, subject, bodyText, linkUrl },
  });

  const { sent, error } = await sendMail({
    to: toEmail,
    subject,
    text: bodyText,
  });

  if (error) {
    console.error("[sendUpdateEmail] SMTP error:", error);
    await db.sessionNote.updateMany({
      where: { studentId, status: { in: ["READY", "DRAFT"] } },
      data: { status: "SENT", sentAt: new Date() },
    });
    revalidatePath(`/admin/students/${studentId}`);
    revalidatePath("/admin/outbox");
    return { ok: true, sent: false, error, toEmail };
  }

  await db.student.update({
    where: { id: studentId },
    data: { parentEmail: toEmail },
  });

  await db.sessionNote.updateMany({
    where: { studentId, status: { in: ["READY", "DRAFT"] } },
    data: { status: "SENT", sentAt: new Date() },
  });

  revalidatePath(`/admin/students/${studentId}`);
  revalidatePath("/admin/outbox");

  if (sent) return { ok: true, sent: true, toEmail };
  return { ok: true, sent: false, outboxOnly: true, toEmail };
}

