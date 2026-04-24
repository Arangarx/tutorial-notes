"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { put } from "@vercel/blob";
import { db, withDbRetry } from "@/lib/db";
import { assertOwnsStudent, requireStudentScope } from "@/lib/student-scope";
import { assertOwnsWhiteboardSession } from "@/lib/whiteboard-scope";
import { createActionCorrelationId } from "@/lib/action-correlation";
import { transcribeAudio } from "@/lib/transcribe";
import { generateSessionNote, estimateTokens, MAX_INPUT_TOKENS } from "@/lib/ai";
import {
  buildTranscribeAndGenerateResult,
  type TranscribeAndGenerateResult,
} from "@/app/admin/students/[id]/transcribe-result";
import { looksLikeSilenceHallucination } from "@/lib/whisper-guardrails";
import { parseDateOnlyInput } from "@/lib/date-only";

/**
 * Whiteboard session lifecycle server actions.
 *
 * `createWhiteboardSession` is the ONLY way a `WhiteboardSession` row
 * gets minted in production. It enforces three rules that a client
 * cannot bypass by hand-rolling a fetch:
 *
 *   1. **Tutor owns this student.** `assertOwnsStudent` is the same
 *      multi-tenant gate used by every other student-scoped action.
 *
 *   2. **Consent acknowledgement is server-truth.** The plan calls
 *      this out as a hard-gate (whiteboard guardrail #4 + adversarial
 *      review item #14): the consent checkbox MUST be checked AND the
 *      check must be re-validated server-side. A tutor who hand-crafts
 *      a POST without `consentAcknowledged: true` is rejected here,
 *      not just at the modal. The workspace page also re-validates
 *      `consentAcknowledged === true` on render (belt + suspenders for
 *      the back/forward bypass case where someone tampers with the
 *      row directly via Prisma Studio etc.).
 *
 *   3. **Empty events.json placeholder is materialised IMMEDIATELY.**
 *      `WhiteboardSession.eventsBlobUrl` is non-nullable. We cannot
 *      mint the row first and write the events later — a crash
 *      between the row insert and the Blob put would orphan a row
 *      with a placeholder string URL that 404s on every replay
 *      attempt. We write the empty log to Blob FIRST, then insert the
 *      row referencing the real URL. The recorder hook overwrites
 *      this URL on Stop with the final events.json (via the
 *      `/api/upload/blob` route).
 */

const PHASE1_SCHEMA_VERSION = 1;

function emptyEventsJson(startedAtIso: string): string {
  return JSON.stringify({
    schemaVersion: PHASE1_SCHEMA_VERSION,
    startedAt: startedAtIso,
    durationMs: 0,
    events: [],
  });
}

export async function createWhiteboardSession(
  studentId: string,
  formData: FormData
): Promise<void> {
  const rid = createActionCorrelationId();

  // Parse + sanity-check inputs BEFORE the auth round-trip so cheap
  // failures don't burn DB / Blob writes. Order:
  //   1. shape (consent checkbox present + truthy)
  //   2. ownership (cheap DB call)
  //   3. expensive Blob write
  //   4. row insert
  // If step 3 succeeds but step 4 fails, we leave behind one orphaned
  // empty events.json — non-fatal cost, kept this way for code
  // simplicity (a try/catch + Blob.delete would still race).
  const consentRaw = formData.get("consentAcknowledged");
  const consentAcknowledged =
    consentRaw === "true" || consentRaw === "on" || consentRaw === "1";
  if (!consentAcknowledged) {
    console.warn(
      `[createWhiteboardSession] rid=${rid} studentId=${studentId} REJECTED: consent not acknowledged`
    );
    throw new Error(
      "You must acknowledge the recording consent before starting a whiteboard session."
    );
  }

  const scope = await requireStudentScope();
  if (scope.kind !== "admin") {
    // The whiteboard requires a real (DB-backed) admin row because
    // the session needs an FK to AdminUser. The legacy env-only login
    // (`scope.kind === "env"`) doesn't have one. Surface a clear copy
    // so an admin in that legacy state knows what to do.
    console.warn(
      `[createWhiteboardSession] rid=${rid} studentId=${studentId} REJECTED: env-only admin (no AdminUser row)`
    );
    throw new Error(
      "Whiteboard sessions require a registered admin account. Please complete account setup first."
    );
  }
  await assertOwnsStudent(studentId);

  const startedAtIso = new Date().toISOString();
  let eventsBlobUrl: string;
  try {
    // The pathname is intentionally unguessable + scoped under the
    // tutor + student so a future cleanup sweep can list-and-delete
    // by prefix. Random suffix to avoid collisions if a tutor starts
    // two sessions in the same millisecond (impossible in practice
    // but cheap insurance).
    const result = await put(
      `whiteboard-sessions/${scope.adminId}/${studentId}/${Date.now()}-events.json`,
      emptyEventsJson(startedAtIso),
      {
        // The Vercel Blob store backing this project is configured for
        // PRIVATE access. Passing "public" returns:
        //   "Vercel Blob: Cannot use public access on a private store."
        // Replay reads this URL through /api/whiteboard/[id]/events
        // (and the share-token sibling /public-events), which proxy
        // the bytes server-side using BLOB_READ_WRITE_TOKEN — so
        // private works end-to-end. See lib/blob.ts header for the
        // full posture and __tests__/regressions/upload-access-private.test.ts
        // for the regression that pins all whiteboard upload paths.
        access: "private",
        contentType: "application/json",
        addRandomSuffix: true,
      }
    );
    eventsBlobUrl = result.url;
  } catch (err) {
    console.error(
      `[createWhiteboardSession] rid=${rid} studentId=${studentId} Blob put failed:`,
      err
    );
    throw new Error(
      "Could not create the whiteboard session storage. Please try again in a moment."
    );
  }

  let session;
  try {
    session = await withDbRetry(
      () =>
        db.whiteboardSession.create({
          data: {
            adminUserId: scope.adminId,
            studentId,
            consentAcknowledged: true,
            eventsBlobUrl,
            eventsSchemaVersion: PHASE1_SCHEMA_VERSION,
            // startedAt + createdAt default to now() in the schema.
          },
          select: { id: true, studentId: true },
        }),
      { label: "createWhiteboardSession" }
    );
  } catch (err) {
    console.error(
      `[createWhiteboardSession] rid=${rid} studentId=${studentId} db.create failed:`,
      err
    );
    throw new Error(
      "Could not create the whiteboard session. Please try again."
    );
  }

  console.log(
    `[createWhiteboardSession] rid=${rid} wbsid=${session.id} studentId=${studentId} adminUserId=${scope.adminId} created`
  );

  // redirect() throws a NEXT_REDIRECT internally; the calling form
  // path treats that as "navigate" rather than as an error. Place it
  // last so the row is durable before navigation.
  redirect(
    `/admin/students/${studentId}/whiteboard/${session.id}/workspace`
  );
}

// -------------------------------------------------------------------
// Join-token lifecycle (issueJoinToken / revokeJoinTokensForSession)
// -------------------------------------------------------------------

/**
 * Maximum number of NON-revoked, NON-expired join tokens we permit
 * for a single whiteboard session at any given time.
 *
 * The real-world use case is: tutor clicks "Copy student link", sends
 * it to the student. If the student needs a fresh link (closed the
 * tab, etc.) the tutor clicks again — we issue a new one and let the
 * old one stay live until expiry. Capping at 10 keeps an
 * accidentally-stuck "regenerate" loop from minting unbounded rows.
 *
 * If we ever hit this limit in practice, switch to "revoke the oldest
 * non-revoked token automatically on issue" — but for now, hard fail
 * so we notice the bug instead of silently dropping the old link.
 */
const MAX_ACTIVE_JOIN_TOKENS_PER_SESSION = 10;

/** Default lifetime of an issued join token. */
const JOIN_TOKEN_LIFETIME_MS = 24 * 60 * 60 * 1000; // 24 h

/**
 * Token bytes — 32 bytes (256-bit) base64url-encoded becomes 43 chars.
 * Same entropy budget as the AES key the URL fragment carries; brute-
 * forcing this alone still doesn't unlock anything (the encryption
 * key is in the fragment) but it gates server-side state lookup so
 * keep it long.
 */
const JOIN_TOKEN_BYTE_LEN = 32;

function generateJoinToken(): string {
  return randomBytes(JOIN_TOKEN_BYTE_LEN)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export type IssueJoinTokenResult = {
  /** Opaque token to embed in the student URL path. */
  token: string;
  /** Path the tutor's client should append `#k=<key>` to before sharing. */
  joinPath: string;
  /** ISO timestamp when this token stops working. */
  expiresAt: string;
};

/**
 * Mint a fresh join token for the given whiteboard session. The
 * caller's encryption key is NOT passed to this action — the key
 * lives only in the tutor's URL fragment, and the tutor's client
 * appends it to the returned `joinPath` before copying to clipboard.
 *
 * Trust posture (re-read before changing):
 *   - `assertOwnsWhiteboardSession` re-checks the session belongs to
 *     the logged-in tutor + their student. Multi-tenant gate.
 *   - We refuse to issue tokens for sessions that have already ended
 *     (`endedAt != null`). Live collaboration only makes sense before
 *     Stop; after Stop the artifact is the recording, shared via the
 *     separate share-link surface.
 *   - We cap concurrent active tokens per session — see the constant
 *     comment above.
 *   - The token itself is opaque; the relay never sees it. The relay
 *     just sees the room id (= whiteboard session id) when the
 *     client connects.
 */
export async function issueJoinToken(
  whiteboardSessionId: string
): Promise<IssueJoinTokenResult> {
  const rid = createActionCorrelationId();
  const session = await assertOwnsWhiteboardSession(whiteboardSessionId);

  if (session.endedAt) {
    console.warn(
      `[issueJoinToken] rid=${rid} wbsid=${whiteboardSessionId} REJECTED: session ended ${session.endedAt.toISOString()}`
    );
    throw new Error(
      "This whiteboard session has already ended; a new session is required to invite a student."
    );
  }

  const now = new Date();
  const activeCount = await withDbRetry(
    () =>
      db.whiteboardJoinToken.count({
        where: {
          whiteboardSessionId,
          revokedAt: null,
          expiresAt: { gt: now },
        },
      }),
    { label: "issueJoinToken.activeCount" }
  );
  if (activeCount >= MAX_ACTIVE_JOIN_TOKENS_PER_SESSION) {
    console.warn(
      `[issueJoinToken] rid=${rid} wbsid=${whiteboardSessionId} REJECTED: ${activeCount} active tokens (cap=${MAX_ACTIVE_JOIN_TOKENS_PER_SESSION})`
    );
    throw new Error(
      "Too many active join links for this session. End the session and start a new one to mint fresh links."
    );
  }

  // Loop on unique-constraint collision. base64url(32 bytes) is
  // ~256 bits of entropy so a real collision is astronomically
  // unlikely, but the loop is essentially free and saves us from a
  // production page in the one-in-2^128 case.
  let token = generateJoinToken();
  const expiresAt = new Date(Date.now() + JOIN_TOKEN_LIFETIME_MS);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await withDbRetry(
        () =>
          db.whiteboardJoinToken.create({
            data: {
              whiteboardSessionId,
              token,
              expiresAt,
            },
          }),
        { label: "issueJoinToken.create" }
      );
      break;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "P2002" && attempt < 4) {
        token = generateJoinToken();
        continue;
      }
      console.error(
        `[issueJoinToken] rid=${rid} wbsid=${whiteboardSessionId} db.create failed:`,
        err
      );
      throw new Error("Could not issue a join link. Please try again.");
    }
  }

  console.log(
    `[issueJoinToken] rid=${rid} wbsid=${whiteboardSessionId} issued token=${token.slice(0, 8)}... expiresAt=${expiresAt.toISOString()}`
  );

  return {
    token,
    joinPath: `/w/${token}`,
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * End the whiteboard session: persist the final events blob URL,
 * stamp `endedAt`, capture duration, and revoke every join token.
 *
 * The events.json upload happens client-side via `/api/upload/blob`
 * (kind="whiteboard-events"). The client then calls THIS action
 * with the resulting blob URL to atomically finalize the row.
 *
 * Trust posture:
 *   - `assertOwnsWhiteboardSession` re-checks ownership.
 *   - We refuse to end an already-ended session (idempotency check
 *     would let a stale tab clobber a fresh `endedAt`).
 *   - Token revocation is part of the same transaction so a
 *     successful end always invalidates outstanding links — the
 *     student can't keep drawing on a "finished" board.
 */
export async function endWhiteboardSession(
  whiteboardSessionId: string,
  finalEventsBlobUrl: string,
  opts?: { snapshotBlobUrl?: string | null }
): Promise<{ endedAt: string; durationSeconds: number }> {
  const rid = createActionCorrelationId();
  const session = await assertOwnsWhiteboardSession(whiteboardSessionId);

  if (session.endedAt) {
    console.warn(
      `[endWhiteboardSession] rid=${rid} wbsid=${whiteboardSessionId} REJECTED: already ended at ${session.endedAt.toISOString()}`
    );
    throw new Error("This whiteboard session has already ended.");
  }

  // Crude URL sanity — the recorder constructs blob URLs via the
  // `/api/upload/blob` route which only serves whitelisted hosts;
  // a malformed value here would break replay later, so reject it now.
  if (!/^https?:\/\//i.test(finalEventsBlobUrl)) {
    throw new Error("Final events URL must be an absolute http(s) URL.");
  }

  const now = new Date();
  let updated;
  try {
    updated = await withDbRetry(
      () =>
        db.$transaction(async (tx) => {
          // Read startedAt first so we can compute durationSeconds in
          // a single update. We can't compute it from `assertOwns…`
          // because that scope helper doesn't load `startedAt`.
          const existing = await tx.whiteboardSession.findUnique({
            where: { id: whiteboardSessionId },
            select: { startedAt: true },
          });
          const durationSeconds = existing
            ? Math.max(
                0,
                Math.floor((now.getTime() - existing.startedAt.getTime()) / 1000)
              )
            : 0;
          const row = await tx.whiteboardSession.update({
            where: { id: whiteboardSessionId },
            data: {
              endedAt: now,
              eventsBlobUrl: finalEventsBlobUrl,
              snapshotBlobUrl: opts?.snapshotBlobUrl ?? undefined,
              durationSeconds,
            },
            select: { id: true, endedAt: true, durationSeconds: true },
          });
          await tx.whiteboardJoinToken.updateMany({
            where: {
              whiteboardSessionId,
              revokedAt: null,
            },
            data: { revokedAt: now },
          });
          return row;
        }),
      { label: "endWhiteboardSession" }
    );
  } catch (err) {
    console.error(
      `[endWhiteboardSession] rid=${rid} wbsid=${whiteboardSessionId} db.transaction failed:`,
      err
    );
    throw new Error("Could not finalize the whiteboard session. Please try again.");
  }

  console.log(
    `[endWhiteboardSession] rid=${rid} wbsid=${whiteboardSessionId} endedAt=${updated.endedAt?.toISOString()} duration=${updated.durationSeconds}s`
  );

  return {
    endedAt: updated.endedAt!.toISOString(),
    durationSeconds: updated.durationSeconds ?? 0,
  };
}

/**
 * End a stale (re-opened) whiteboard session WITHOUT requiring a
 * finalized events.json blob URL.
 *
 * Why a separate action from `endWhiteboardSession`:
 *
 *   `endWhiteboardSession` is the "tutor pressed Stop in an active
 *   session" path — the recorder hook has just uploaded the final
 *   events.json and we atomically swap the placeholder URL for the
 *   real one. That path REQUIRES the new URL.
 *
 *   `endStaleWhiteboardSession` is the "tutor opened the workspace
 *   from a tab they forgot about, sees the Resume-or-End prompt, and
 *   picks End" path. There IS no fresh events.json — the recorder
 *   hook never mounted in this load. We just need to:
 *
 *     1. Stamp endedAt so the session row stops being treated as live.
 *     2. Revoke any still-live join tokens so a stale student tab
 *        gets a 404 the next time it tries to reconnect.
 *     3. Compute durationSeconds from startedAt (consistent with
 *        the active path).
 *
 *   We deliberately DO NOT clobber `eventsBlobUrl` — whatever was
 *   uploaded last (often the empty placeholder, sometimes a real
 *   final from the previous tab's Stop) stays so the read-only
 *   review surface keeps working.
 *
 * Trust posture mirrors `endWhiteboardSession`:
 *   - `assertOwnsWhiteboardSession` is the multi-tenant gate.
 *   - Refuses to act on an already-ended session (idempotency:
 *     two tabs both clicking End must not race).
 */
export async function endStaleWhiteboardSession(
  whiteboardSessionId: string
): Promise<{ endedAt: string; durationSeconds: number }> {
  const rid = createActionCorrelationId();
  const session = await assertOwnsWhiteboardSession(whiteboardSessionId);

  if (session.endedAt) {
    console.warn(
      `[endStaleWhiteboardSession] rid=${rid} wbsid=${whiteboardSessionId} REJECTED: already ended at ${session.endedAt.toISOString()}`
    );
    throw new Error("This whiteboard session has already ended.");
  }

  const now = new Date();
  let updated;
  try {
    updated = await withDbRetry(
      () =>
        db.$transaction(async (tx) => {
          const existing = await tx.whiteboardSession.findUnique({
            where: { id: whiteboardSessionId },
            select: { startedAt: true },
          });
          const durationSeconds = existing
            ? Math.max(
                0,
                Math.floor((now.getTime() - existing.startedAt.getTime()) / 1000)
              )
            : 0;
          const row = await tx.whiteboardSession.update({
            where: { id: whiteboardSessionId },
            data: {
              endedAt: now,
              durationSeconds,
            },
            select: { id: true, endedAt: true, durationSeconds: true },
          });
          await tx.whiteboardJoinToken.updateMany({
            where: {
              whiteboardSessionId,
              revokedAt: null,
            },
            data: { revokedAt: now },
          });
          return row;
        }),
      { label: "endStaleWhiteboardSession" }
    );
  } catch (err) {
    console.error(
      `[endStaleWhiteboardSession] rid=${rid} wbsid=${whiteboardSessionId} db.transaction failed:`,
      err
    );
    throw new Error("Could not end the whiteboard session. Please try again.");
  }

  console.log(
    `[endStaleWhiteboardSession] rid=${rid} wbsid=${whiteboardSessionId} endedAt=${updated.endedAt?.toISOString()} duration=${updated.durationSeconds}s`
  );

  return {
    endedAt: updated.endedAt!.toISOString(),
    durationSeconds: updated.durationSeconds ?? 0,
  };
}

/**
 * Revoke every still-live join token for a session. Called from the
 * Stop button (separate todo) so a tutor's "End session" click
 * immediately invalidates any links the student might still have
 * pinned in a tab.
 *
 * Idempotent — re-runs after Stop are no-ops.
 */
export async function revokeJoinTokensForSession(
  whiteboardSessionId: string
): Promise<{ revoked: number }> {
  const rid = createActionCorrelationId();
  await assertOwnsWhiteboardSession(whiteboardSessionId);

  const now = new Date();
  const result = await withDbRetry(
    () =>
      db.whiteboardJoinToken.updateMany({
        where: {
          whiteboardSessionId,
          revokedAt: null,
        },
        data: { revokedAt: now },
      }),
    { label: "revokeJoinTokensForSession" }
  );
  console.log(
    `[revokeJoinTokensForSession] rid=${rid} wbsid=${whiteboardSessionId} revoked=${result.count}`
  );
  return { revoked: result.count };
}

// -------------------------------------------------------------------
// AI wedge: generate notes from a whiteboard session's audio
// -------------------------------------------------------------------

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

/**
 * Transcribe the audio recording(s) captured during a whiteboard
 * session and run `generateSessionNote` on the combined transcript.
 *
 * Returns the same `TranscribeAndGenerateResult` shape as the regular
 * `transcribeAndGenerateAction` so callers can use the same client
 * logic — the only difference is the source of truth (whiteboard
 * audio vs upload-tab audio).
 *
 * Trust posture:
 *   - `assertOwnsWhiteboardSession` gates ownership.
 *   - We only read audio recordings linked to THIS session via the
 *     `audioRecordings` relation — cannot access cross-student blobs.
 *   - Blob fetches use the server-side BLOB_READ_WRITE_TOKEN.
 *
 * wbsid= logging: mirrors the regular transcription pipeline.
 */
export async function generateNotesFromWhiteboardSessionAction(
  whiteboardSessionId: string
): Promise<TranscribeAndGenerateResult> {
  const rid = createActionCorrelationId();
  console.log(
    `[generateNotesFromWB] rid=${rid} wbsid=${whiteboardSessionId} begin`
  );

  const scope = await requireStudentScope();
  if (scope.kind === "env") {
    return {
      ok: false,
      error: "Audio transcription requires a DB-backed tutor account.",
      debugId: rid,
    };
  }

  const session = await assertOwnsWhiteboardSession(whiteboardSessionId);
  const studentId = session.studentId;

  // Load all audio recordings for this whiteboard session.
  const audioRows = await withDbRetry(
    () =>
      db.sessionRecording.findMany({
        where: { whiteboardSessionId },
        select: { id: true, blobUrl: true, mimeType: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
    { label: "generateNotesFromWB.audioRows" }
  );

  if (audioRows.length === 0) {
    return {
      ok: false,
      error:
        "No audio was recorded for this whiteboard session. " +
        "Start a new session with audio recording enabled, or use the " +
        "'Paste notes' tab to generate from text.",
      debugId: rid,
    };
  }

  const student = await withDbRetry(
    () =>
      db.student.findUniqueOrThrow({
        where: { id: studentId },
        select: { name: true },
      }),
    { label: "generateNotesFromWB.student" }
  );

  const template = await withDbRetry(
    () =>
      db.sessionNote
        .findFirst({
          where: { studentId },
          orderBy: { date: "desc" },
          select: { template: true },
        })
        .then((n) => n?.template ?? null),
    { label: "generateNotesFromWB.template" }
  );

  // Transcribe each segment.
  const transcriptParts: string[] = [];
  const keptTimings: Array<{ createdAt: Date; durationSeconds: number }> = [];
  let skippedHallucinationSegments = 0;

  for (let i = 0; i < audioRows.length; i++) {
    const row = audioRows[i];
    let audioBuffer: Buffer;
    try {
      const res = await fetch(row.blobUrl, {
        headers: {
          Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN ?? ""}`,
        },
      });
      if (!res.ok) throw new Error(`Blob fetch failed: ${res.status}`);
      audioBuffer = Buffer.from(await res.arrayBuffer());
    } catch (err) {
      console.error(
        `[generateNotesFromWB] rid=${rid} wbsid=${whiteboardSessionId} download failed for segment ${i + 1}:`,
        err
      );
      return {
        ok: false,
        error: `Could not download audio segment ${i + 1}. Please try again.`,
        debugId: rid,
      };
    }

    const baseMime = row.mimeType.split(";")[0].trim().toLowerCase();
    const ext =
      MIME_TO_EXT[baseMime] ?? baseMime.split("/")[1]?.split(";")[0] ?? "webm";
    const filename = `wb-${whiteboardSessionId}-part${i + 1}.${ext}`;
    const result = await transcribeAudio(audioBuffer, filename, row.mimeType);

    if ("error" in result) {
      if (result.error === "not configured") {
        return {
          ok: false,
          error: "AI transcription is not configured on this server.",
          debugId: rid,
        };
      }
      return { ok: false, error: result.error, debugId: rid };
    }

    if (looksLikeSilenceHallucination(result.transcript, result.durationSeconds)) {
      console.warn(
        `[generateNotesFromWB] rid=${rid} wbsid=${whiteboardSessionId} segment ${i + 1} likely silence — skipping`
      );
      skippedHallucinationSegments += 1;
      continue;
    }

    // Persist transcript + duration on the recording row for future reference.
    await withDbRetry(
      () =>
        db.sessionRecording.update({
          where: { id: row.id },
          data: {
            transcript: result.transcript,
            durationSeconds: result.durationSeconds,
          },
        }),
      { label: "generateNotesFromWB.updateTranscript" }
    );

    transcriptParts.push(result.transcript);
    keptTimings.push({
      createdAt: row.createdAt,
      durationSeconds: result.durationSeconds ?? 0,
    });
  }

  let sessionStartedAt: string | undefined;
  let sessionEndedAt: string | undefined;
  if (keptTimings.length > 0) {
    const first = keptTimings[0];
    const last = keptTimings[keptTimings.length - 1];
    sessionStartedAt = new Date(
      first.createdAt.getTime() - first.durationSeconds * 1000
    ).toISOString();
    sessionEndedAt = last.createdAt.toISOString();
  }

  if (transcriptParts.length === 0) {
    return {
      ok: false,
      error:
        "We couldn't detect clear speech in any of the whiteboard session recordings. " +
        "Check that the microphone was enabled, or use the Paste tab to enter notes manually.",
      debugId: rid,
    };
  }

  const rawTranscript =
    transcriptParts.length === 1
      ? transcriptParts[0]
      : transcriptParts
          .map((t, i) => `[Part ${i + 1} of ${transcriptParts.length}]\n${t}`)
          .join("\n\n");
  const trimmed = rawTranscript.trim();

  const TRANSCRIPT_AI_MAX_CHARS = MAX_INPUT_TOKENS * 4;
  if (trimmed.length > TRANSCRIPT_AI_MAX_CHARS) {
    return {
      ok: false,
      error: `This session's transcript is exceptionally long (~${Math.round(trimmed.length / 1000)}k chars). Split into shorter sessions or paste a portion into the text input to generate notes.`,
      debugId: rid,
    };
  }

  const genResult = await generateSessionNote({
    studentName: student.name,
    sessionText: trimmed,
    template,
  });

  if ("error" in genResult) {
    console.warn(
      `[generateNotesFromWB] rid=${rid} wbsid=${whiteboardSessionId} AI gen error:`,
      genResult.error
    );
  }

  return buildTranscribeAndGenerateResult({
    recordingIds: audioRows.map((r) => r.id),
    trimmedTranscript: trimmed,
    rawTranscript,
    genResult: "error" in genResult ? { error: genResult.error } : genResult,
    skippedHallucinationSegments,
    sessionStartedAt,
    sessionEndedAt,
    debugId: rid,
  });
}

/**
 * Attach a whiteboard session to a session note (or detach by passing
 * null). Creates the note if `newNoteFromDate` is provided.
 *
 * Two sub-flows:
 *
 *   A. Tutor supplies an existing noteId: link it.
 *   B. Tutor supplies `newNoteFromDate` (ISO date string "YYYY-MM-DD"):
 *      create a minimal draft note and link that.
 *
 * Trust posture:
 *   - `assertOwnsWhiteboardSession` gates the session.
 *   - When linking an existing note, we verify the note belongs to
 *     the same student as the session.
 *   - `revalidatePath` for the student page ensures the UI picks up
 *     the new note link.
 */
export type AttachWhiteboardToNoteResult =
  | { ok: true; noteId: string }
  | { ok: false; error: string };

export async function attachWhiteboardToNoteAction(
  whiteboardSessionId: string,
  opts:
    | { mode: "existing"; noteId: string }
    | { mode: "new"; newNoteFromDate: string }
    | { mode: "detach" }
): Promise<AttachWhiteboardToNoteResult> {
  const rid = createActionCorrelationId();
  const session = await assertOwnsWhiteboardSession(whiteboardSessionId);

  let targetNoteId: string | null = null;

  if (opts.mode === "detach") {
    await withDbRetry(
      () =>
        db.whiteboardSession.update({
          where: { id: whiteboardSessionId },
          data: { noteId: null },
        }),
      { label: "attachWhiteboardToNote.detach" }
    );
    console.log(
      `[attachWhiteboardToNote] rid=${rid} wbsid=${whiteboardSessionId} detached`
    );
    revalidatePath(`/admin/students/${session.studentId}`);
    return { ok: true, noteId: "" };
  }

  if (opts.mode === "existing") {
    // Validate the note belongs to this session's student.
    const note = await withDbRetry(
      () =>
        db.sessionNote.findUnique({
          where: { id: opts.noteId },
          select: { id: true, studentId: true },
        }),
      { label: "attachWhiteboardToNote.findNote" }
    );
    if (!note || note.studentId !== session.studentId) {
      return {
        ok: false,
        error: "Note not found or does not belong to this student.",
      };
    }
    targetNoteId = note.id;
  }

  if (opts.mode === "new") {
    const date = parseDateOnlyInput(opts.newNoteFromDate);
    if (!date) {
      return { ok: false, error: "Invalid date for new note." };
    }
    const scope = await requireStudentScope();
    const note = await withDbRetry(
      () =>
        db.sessionNote.create({
          data: {
            studentId: session.studentId,
            date,
            topics: "",
            homework: "",
            assessment: "",
            nextSteps: "",
            linksJson: "[]",
            status: "DRAFT",
            aiGenerated: false,
            ...(scope.kind === "admin" ? { adminUserId: scope.adminId } : {}),
          },
          select: { id: true },
        }),
      { label: "attachWhiteboardToNote.createNote" }
    );
    targetNoteId = note.id;
    console.log(
      `[attachWhiteboardToNote] rid=${rid} wbsid=${whiteboardSessionId} created new note=${targetNoteId}`
    );
  }

  await withDbRetry(
    () =>
      db.whiteboardSession.update({
        where: { id: whiteboardSessionId },
        data: { noteId: targetNoteId },
      }),
    { label: "attachWhiteboardToNote.update" }
  );

  console.log(
    `[attachWhiteboardToNote] rid=${rid} wbsid=${whiteboardSessionId} linked to note=${targetNoteId}`
  );

  revalidatePath(`/admin/students/${session.studentId}`);
  revalidatePath(
    `/admin/students/${session.studentId}/whiteboard/${whiteboardSessionId}`
  );

  return { ok: true, noteId: targetNoteId! };
}
