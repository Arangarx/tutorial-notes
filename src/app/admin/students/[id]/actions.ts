"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth-options";
import { db } from "@/lib/db";
import { getAdminByEmail } from "@/lib/auth-db";
import { sendMail } from "@/lib/email";
import { generateShareToken, parseLinksFromTextarea } from "@/lib/security";
import { assertOwnsStudent } from "@/lib/student-scope";

function baseUrl() {
  return process.env.NEXTAUTH_URL ?? "http://localhost:3000";
}

function signerFromSessionEmail(email: string | null | undefined): string {
  if (!email) return "Your tutor";
  const local = email.split("@")[0] ?? "";
  const words = local.replace(/[._-]+/g, " ").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "Your tutor";
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

async function resolveTutorDisplayName(): Promise<{ signer: string; fromDisplayName: string }> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email ?? null;
  const admin = email ? await getAdminByEmail(email) : null;
  const fromDb = admin?.displayName?.trim();
  const signer = fromDb || signerFromSessionEmail(email);
  return { signer, fromDisplayName: signer };
}

export async function regenerateShareLink(studentId: string) {
  await assertOwnsStudent(studentId);
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
  await assertOwnsStudent(studentId);
  await db.shareLink.updateMany({
    where: { studentId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  revalidatePath(`/admin/students/${studentId}`);
}

export async function createNote(studentId: string, formData: FormData) {
  await assertOwnsStudent(studentId);
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
  await assertOwnsStudent(studentId);
  const row = await db.sessionNote.findFirst({ where: { id: noteId, studentId } });
  if (!row) return;
  await db.sessionNote.update({ where: { id: noteId }, data: { status } });
  revalidatePath(`/admin/students/${studentId}`);
}

export async function renameStudent(studentId: string, formData: FormData) {
  await assertOwnsStudent(studentId);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Name is required");
  await db.student.update({ where: { id: studentId }, data: { name } });
  revalidatePath(`/admin/students/${studentId}`);
}

export async function deleteStudent(studentId: string) {
  await assertOwnsStudent(studentId);
  await db.student.delete({ where: { id: studentId } });
  revalidatePath("/admin/students");
}

export async function updateNote(noteId: string, studentId: string, formData: FormData) {
  await assertOwnsStudent(studentId);
  const existing = await db.sessionNote.findFirst({ where: { id: noteId, studentId } });
  if (!existing) return;
  const dateStr = String(formData.get("date") ?? "");
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid date");

  const template = String(formData.get("template") ?? "").trim() || null;
  const topics = String(formData.get("topics") ?? "").trim();
  const homework = String(formData.get("homework") ?? "").trim();
  const nextSteps = String(formData.get("nextSteps") ?? "").trim();
  const linksText = String(formData.get("links") ?? "");
  const links = parseLinksFromTextarea(linksText);

  await db.sessionNote.update({
    where: { id: noteId },
    data: { date, template, topics, homework, nextSteps, linksJson: JSON.stringify(links) },
  });
  revalidatePath(`/admin/students/${studentId}`);
}

export async function deleteNote(noteId: string, studentId: string) {
  await assertOwnsStudent(studentId);
  const existing = await db.sessionNote.findFirst({ where: { id: noteId, studentId } });
  if (!existing) return;
  await db.sessionNote.delete({ where: { id: noteId } });
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
  await assertOwnsStudent(studentId);
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
  const { signer, fromDisplayName } = await resolveTutorDisplayName();

  const latestNote = await db.sessionNote.findFirst({
    where: { studentId },
    orderBy: { date: "desc" },
  });
  const topicsLine =
    latestNote?.topics?.trim() ? `\nRecent focus: ${latestNote.topics.trim()}\n` : "\n";

  const subject = `Session update - ${student.name}`;
  const bodyText = `Hi,

${signer} is sharing a session update for ${student.name}.${topicsLine}
Open this link to read notes, homework, and next steps (no login needed):
${linkUrl}

If the link does not open, you can reply to this email.

— ${signer}`;

  await db.emailMessage.create({
    data: { toEmail, subject, bodyText, linkUrl },
  });

  const { sent, error } = await sendMail({
    to: toEmail,
    subject,
    text: bodyText,
    fromDisplayName,
  });

  if (error) {
    console.error("[sendUpdateEmail] SMTP error:", error);
    // Do NOT mark notes as SENT — the email failed to deliver.
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
  // outboxOnly: email not configured, message saved to outbox — still mark notes sent
  // since the tutor intentionally triggered the send and can manually deliver the link.
  return { ok: true, sent: false, outboxOnly: true, toEmail };
}

