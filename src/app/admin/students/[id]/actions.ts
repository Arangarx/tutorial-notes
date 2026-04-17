"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth-options";
import { db } from "@/lib/db";
import { getAdminByEmail } from "@/lib/auth-db";
import { sendMail } from "@/lib/email";
import { generateShareToken, parseLinksFromTextarea } from "@/lib/security";
import { assertOwnsStudent, requireStudentScope } from "@/lib/student-scope";
import { generateSessionNote, estimateTokens, MAX_INPUT_TOKENS } from "@/lib/ai";
import { transcribeAudio } from "@/lib/transcribe";
import { put } from "@vercel/blob";
import { getAudioUrl, getBlobMetadata, deleteBlob, BLOB_MAX_BYTES } from "@/lib/blob";

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
  const aiGenerated = formData.get("aiGenerated") === "true";
  const aiPromptVersion = aiGenerated
    ? String(formData.get("aiPromptVersion") ?? "").trim() || null
    : null;
  const recordingId = String(formData.get("recordingId") ?? "").trim() || null;
  const shareRecordingInEmail = formData.get("shareRecordingInEmail") === "true";

  const links = parseLinksFromTextarea(linksText);

  // If a recordingId is provided, verify it belongs to this student before linking.
  if (recordingId) {
    const recording = await db.sessionRecording.findUnique({
      where: { id: recordingId },
      select: { studentId: true },
    });
    if (!recording || recording.studentId !== studentId) {
      throw new Error("Recording not found or access denied");
    }
  }

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
      aiGenerated,
      aiPromptVersion,
      ...(recordingId ? { recordingId, shareRecordingInEmail } : {}),
    },
  });

  revalidatePath(`/admin/students/${studentId}`);
}

// ---------------------------------------------------------------------------
// AI: generate structured note from freeform session text
// ---------------------------------------------------------------------------

export type GenerateNoteResult =
  | { ok: true; topics: string; homework: string; nextSteps: string; promptVersion: string }
  | { ok: false; error: string };

export async function generateNoteFromTextAction(
  studentId: string,
  sessionText: string
): Promise<GenerateNoteResult> {
  await assertOwnsStudent(studentId);

  const trimmed = sessionText.trim();
  if (!trimmed) return { ok: false, error: "Please enter some session text first." };
  if (estimateTokens(trimmed) > MAX_INPUT_TOKENS) {
    return { ok: false, error: "Session text is too long. Please shorten it and try again." };
  }

  const student = await db.student.findUniqueOrThrow({
    where: { id: studentId },
    select: { name: true },
  });

  const recentNotes = await db.sessionNote.findMany({
    where: { studentId },
    orderBy: { date: "desc" },
    take: 2,
    select: { date: true, topics: true, nextSteps: true, template: true },
  });

  // Use the most recent note's template as context if available.
  const template = recentNotes[0]?.template ?? null;

  const result = await generateSessionNote({
    studentName: student.name,
    sessionText: trimmed,
    recentNotes: recentNotes.map((n) => ({
      date: n.date,
      topics: n.topics,
      nextSteps: n.nextSteps,
    })),
    template,
  });

  if ("error" in result) {
    if (result.error === "not configured") {
      return { ok: false, error: "AI generation is not configured on this server." };
    }
    return { ok: false, error: result.error };
  }

  return {
    ok: true,
    topics: result.topics,
    homework: result.homework,
    nextSteps: result.nextSteps,
    promptVersion: result.promptVersion,
  };
}

// ---------------------------------------------------------------------------
// AI: transcribe audio recording and generate structured note
// ---------------------------------------------------------------------------

export type TranscribeAndGenerateResult =
  | {
      ok: true;
      recordingId: string;
      transcript: string;
      topics: string;
      homework: string;
      nextSteps: string;
      promptVersion: string;
    }
  | { ok: false; error: string };

/**
 * Given a Vercel Blob URL for an uploaded audio recording:
 * 1. Verifies tutor owns the student (multi-tenant guard).
 * 2. Creates a SessionRecording row linked to the student + tutor.
 * 3. Downloads the audio bytes and sends to Whisper for transcription.
 * 4. Updates the recording row with transcript + duration.
 * 5. Runs generateSessionNote on the transcript.
 * 6. Returns the recording ID + generated note fields.
 */
export async function transcribeAndGenerateAction(
  studentId: string,
  blobUrl: string,
  mimeType: string
): Promise<TranscribeAndGenerateResult> {
  const scope = await requireStudentScope();
  if (scope.kind === "env") {
    // env-only admin has no DB id — restrict for simplicity
    return { ok: false, error: "Audio features require a DB-backed tutor account." };
  }
  await assertOwnsStudent(studentId);

  // Validate it looks like a Vercel Blob URL (defence in depth).
  if (!blobUrl.includes("blob.vercel-storage.com")) {
    return { ok: false, error: "Invalid audio URL." };
  }

  let sizeBytes: number;
  let resolvedMimeType: string;
  try {
    const meta = await getBlobMetadata(blobUrl);
    sizeBytes = meta.size;
    resolvedMimeType = meta.contentType || mimeType;
  } catch {
    return { ok: false, error: "Could not reach audio file. Please try uploading again." };
  }

  // Create the recording row early so we can return the ID even on transcription error.
  const recording = await db.sessionRecording.create({
    data: {
      adminUserId: scope.adminId,
      studentId,
      blobUrl,
      mimeType: resolvedMimeType,
      sizeBytes,
    },
  });

  // Download bytes for Whisper — private blob requires Bearer token.
  let audioBuffer: Buffer;
  try {
    const res = await fetch(blobUrl, {
      headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN ?? ""}` },
    });
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    audioBuffer = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    // Clean up the blob + DB row if download fails — nothing is saved yet.
    await deleteBlob(blobUrl).catch(() => undefined);
    await db.sessionRecording.delete({ where: { id: recording.id } }).catch(() => undefined);
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[transcribeAndGenerate] download failed:", msg);
    return { ok: false, error: "Could not download audio for transcription. Please try again." };
  }

  // Map MIME types to Whisper-accepted extensions (Whisper validates by file extension).
  const MIME_TO_EXT: Record<string, string> = {
    "audio/x-m4a": "m4a",
    "audio/m4a": "m4a",
    "audio/mp4": "mp4",
    "audio/mpeg": "mp3",
    "audio/mpga": "mp3",
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/oga": "oga",
    "audio/wav": "wav",
    "audio/flac": "flac",
  };
  const baseMime = resolvedMimeType.split(";")[0].trim().toLowerCase();
  const ext = MIME_TO_EXT[baseMime] ?? baseMime.split("/")[1]?.split(";")[0] ?? "webm";
  const filename = `session-${studentId}.${ext}`;
  const transcribeResult = await transcribeAudio(audioBuffer, filename, resolvedMimeType);

  if ("error" in transcribeResult) {
    if (transcribeResult.error === "not configured") {
      return { ok: false, error: "AI transcription is not configured on this server." };
    }
    return { ok: false, error: transcribeResult.error };
  }

  // Persist transcript + duration.
  await db.sessionRecording.update({
    where: { id: recording.id },
    data: {
      transcript: transcribeResult.transcript,
      durationSeconds: transcribeResult.durationSeconds,
    },
  });

  const trimmed = transcribeResult.transcript.trim();
  if (!trimmed) {
    return {
      ok: true,
      recordingId: recording.id,
      transcript: "",
      topics: "",
      homework: "",
      nextSteps: "",
      promptVersion: "",
    };
  }

  // Generate structured note from transcript.
  const student = await db.student.findUniqueOrThrow({
    where: { id: studentId },
    select: { name: true },
  });

  const template = await db.sessionNote.findFirst({
    where: { studentId },
    orderBy: { date: "desc" },
    select: { template: true },
  }).then((n) => n?.template ?? null);

  const sessionText = trimmed.length > MAX_INPUT_TOKENS * 4
    ? trimmed.slice(0, MAX_INPUT_TOKENS * 4)
    : trimmed;

  const genResult = await generateSessionNote({
    studentName: student.name,
    sessionText,
    template,
  });

  if ("error" in genResult) {
    // Transcription succeeded — return recording + transcript even if note gen fails.
    return {
      ok: true,
      recordingId: recording.id,
      transcript: transcribeResult.transcript,
      topics: "",
      homework: "",
      nextSteps: "",
      promptVersion: "",
    };
  }

  return {
    ok: true,
    recordingId: recording.id,
    transcript: transcribeResult.transcript,
    topics: genResult.topics,
    homework: genResult.homework,
    nextSteps: genResult.nextSteps,
    promptVersion: genResult.promptVersion,
  };
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

  const scope = await requireStudentScope();
  await db.emailMessage.create({
    data: {
      toEmail, subject, bodyText, linkUrl,
      adminUserId: scope.kind === "admin" ? scope.adminId : null,
    },
  });

  const { sent, error } = await sendMail({
    to: toEmail,
    subject,
    text: bodyText,
    fromDisplayName,
    adminUserId: scope.kind === "admin" ? scope.adminId : null,
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

/**
 * Server-side audio upload → Vercel Blob.
 * Receives the file as FormData so the browser never touches blob.vercel-storage.com
 * directly (avoids firewall/SSL-inspection issues with cross-origin PUTs).
 * Body size limit is set to 25 MB in next.config (matching Whisper's limit).
 */
type UploadAudioResult =
  | { ok: true; blobUrl: string; mimeType: string; sizeBytes: number }
  | { ok: false; error: string };

export async function uploadAudioAction(
  studentId: string,
  formData: FormData
): Promise<UploadAudioResult> {
  // assertOwnsStudent handles auth + ownership check internally
  await assertOwnsStudent(studentId);

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No file provided" };

  if (file.size > BLOB_MAX_BYTES) {
    return {
      ok: false,
      error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is ${Math.round(BLOB_MAX_BYTES / 1024 / 1024)} MB.`,
    };
  }

  const mimeType = file.type || "audio/mpeg";
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const pathname = `sessions/${studentId}/${Date.now()}-${safeName}`;

  const blob = await put(pathname, file, {
    access: "private",
    contentType: mimeType,
  });

  return { ok: true, blobUrl: blob.url, mimeType, sizeBytes: file.size };
}

