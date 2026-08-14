"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { put } from "@vercel/blob";
import {
  harnessServerPut,
  isAllowedBlobUrl,
  isBlobHarnessActive,
} from "@/lib/blob-harness";
import { db, withDbRetry } from "@/lib/db";
import { assertOwnsStudent, requireStudentScope } from "@/lib/student-scope";
import { assertOwnsWhiteboardSession } from "@/lib/whiteboard-scope";
import { createActionCorrelationId } from "@/lib/action-correlation";
import { mapWithConcurrency, transcribeAudio } from "@/lib/transcribe";
import { generateSessionNote, estimateTokens, MAX_INPUT_TOKENS } from "@/lib/ai";
import {
  buildTranscribeAndGenerateResult,
  FRIENDLY_TRANSCRIPTION_TIMEOUT_MESSAGE,
  shouldTreatAsTranscriptionTimeout,
  type TranscribeAndGenerateResult,
} from "@/app/admin/students/[id]/transcribe-result";
import { looksLikeSilenceHallucination } from "@/lib/whisper-guardrails";
import { parseDateOnlyInput } from "@/lib/date-only";
import { revalidateStudentSharePages } from "@/lib/revalidateStudentSharePages";
import { enqueueChunkTranscribe } from "@/lib/recording/chunk-transcribe-enqueue";
import { TUTOR_MIC_STREAM_ID } from "@/lib/recording/lifecycle-machine";
import { assertTutorApproved } from "@/lib/tutor-approval-scope";
import {
  assertEffectiveConsent,
  assertConsentRecordExists,
  createSessionConsentSnapshot,
  ConsentError,
  resolveModeAwareAudioRecordingConsent,
} from "@/lib/consent-scope";
import { shouldShortCircuitEndSessionForErasure } from "@/lib/erasure/assert-student-not-erased";
import {
  ErasureAccessSuspendedError,
  isWhiteboardSessionBlockedByErasure,
} from "@/lib/erasure/active-erasure-scope";
import {
  assembleBackendEventLog,
  countEventsInBlobUrl,
} from "@/lib/whiteboard/assemble-persisted-state";
import {
  kickSessionChunksAction,
  triggerNotesGenerationAction,
} from "@/app/admin/students/[id]/whiteboard/notes-actions";
import { enqueueReplayConcatAfterFinalize } from "@/lib/recording/concat-audio-enqueue";
import {
  DEFAULT_ROUNDING_INCREMENT_MIN,
  DEFAULT_ROUNDING_MODE,
} from "@/lib/billing/defaults";
import { computeBillingFreezeFields } from "@/lib/billing/freeze-at-close";
import { logProductEvent } from "@/lib/observability/product-events";

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
  studentId: string
): Promise<void> {
  const rid = createActionCorrelationId();

  // Order:
  //   1. ownership (cheap DB call)
  //   2. tutor approval check
  //   3. CC-1 consent record existence
  //   4. expensive Blob write
  //   5. row insert
  // If step 4 succeeds but step 5 fails, we leave behind one orphaned
  // empty events.json — non-fatal cost, kept this way for code
  // simplicity (a try/catch + Blob.delete would still race).
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

  const erasureBlock = await isWhiteboardSessionBlockedByErasure(studentId);
  if (erasureBlock.blocked) {
    const jobSuffix = erasureBlock.activeJobId
      ? ` ers=${erasureBlock.activeJobId}`
      : "";
    console.warn(
      `[ers] action=session_create_denied studentId=${studentId} rid=${rid}${jobSuffix}`
    );
    throw new ErasureAccessSuspendedError();
  }

  // B1 cost gate: WAITLISTED tutors cannot start whiteboard sessions.
  // Runs BEFORE B2 consent check and BEFORE Blob write — no cost incurred
  // until the tutor is confirmed approved to operate.
  await assertTutorApproved(scope.adminId);

  // CC-1: consent record must exist before Blob write (fail fast, no orphan Blob).
  const studentForConsent = await withDbRetry(
    () =>
      db.student.findUnique({
        where: { id: studentId },
        select: { learnerProfileId: true },
      }),
    { label: "createWhiteboardSession.studentForConsent" }
  );
  const learnerProfileId = studentForConsent?.learnerProfileId ?? null;

  try {
    await assertConsentRecordExists(learnerProfileId, scope.adminId, {
      studentId,
    });
  } catch (err) {
    if (err instanceof ConsentError && err.permission === "consentRecord") {
      console.warn(
        `[createWhiteboardSession] rid=${rid} studentId=${studentId} REJECTED: no_consent_record`
      );
    }
    throw err;
  }

  const startedAtIso = new Date().toISOString();
  let eventsBlobUrl: string;
  try {
    // The pathname is intentionally unguessable + scoped under the
    // tutor + student so a future cleanup sweep can list-and-delete
    // by prefix. Random suffix to avoid collisions if a tutor starts
    // two sessions in the same millisecond (impossible in practice
    // but cheap insurance).
    const eventsPath = `whiteboard-sessions/${scope.adminId}/${studentId}/${Date.now()}-events.json`;
    const result = isBlobHarnessActive()
      ? await harnessServerPut(
          eventsPath,
          emptyEventsJson(startedAtIso),
          {
            contentType: "application/json",
            addRandomSuffix: true,
          },
          harnessRequestOrigin()
        )
      : await put(
      eventsPath,
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
    // B2: session row + consent snapshot in the same transaction (atomic).
    // The snapshot freeze is NOT flag-gated — we always record what consent
    // was authorized at session start, even when enforcement is off.
    session = await withDbRetry(
      () =>
        db.$transaction(async (tx) => {
          const row = await tx.whiteboardSession.create({
            data: {
              adminUserId: scope.adminId,
              studentId,
              consentAcknowledged: true,
              eventsBlobUrl,
              eventsSchemaVersion: PHASE1_SCHEMA_VERSION,
              // startedAt + createdAt default to now() in the schema.
            },
            select: { id: true, studentId: true },
          });
          // createSessionConsentSnapshot is a no-op for unclaimed/no-record
          // sessions; it never throws.
          await createSessionConsentSnapshot(
            tx,
            row.id,
            learnerProfileId,
            scope.adminId
          );
          if (learnerProfileId) {
            await tx.sessionParticipant.createMany({
              data: [
                {
                  whiteboardSessionId: row.id,
                  learnerProfileId,
                },
              ],
              skipDuplicates: true,
            });
          }
          return row;
        }),
      { label: "createWhiteboardSession" }
    );
  } catch (err) {
    console.error(
      `[createWhiteboardSession] rid=${rid} studentId=${studentId} db.transaction failed:`,
      err
    );
    throw new Error(
      "Could not create the whiteboard session. Please try again."
    );
  }

  console.info(
    `[slc] wbsid=${session.id} action=session_created phase=pending claimed=${learnerProfileId ? "yes" : "no"}`
  );
  console.log(
    `[createWhiteboardSession] rid=${rid} wbsid=${session.id} studentId=${studentId} adminUserId=${scope.adminId} created`
  );

  await logProductEvent({
    kind: "SESSION_CREATED",
    adminUserId: scope.adminId,
    studentId,
    whiteboardSessionId: session.id,
    metadata: { claimed: Boolean(learnerProfileId) },
  });

  // redirect() throws a NEXT_REDIRECT internally; the calling form
  // path treats that as "navigate" rather than as an error. Place it
  // last so the row is durable before navigation.
  redirect(
    `/admin/students/${studentId}/whiteboard/${session.id}/workspace`
  );
}

export type StartWhiteboardSessionResult = {
  ok: true;
  phase: "active";
};

/**
 * Transition a whiteboard session from PENDING → ACTIVE when the tutor
 * clicks Start. Idempotent: already-active or ended sessions are no-ops.
 *
 * @param sessionMode Optional mode to persist at activation time (LIVE or
 *   IN_PERSON). When provided, it is written to the DB alongside the phase
 *   flip so the server-truth mode reflects the tutor's choice at Start time.
 *   Omitting leaves the DB default (LIVE) unchanged — safe for callers that
 *   predate this parameter.
 */
export async function startWhiteboardSession(
  whiteboardSessionId: string,
  sessionMode?: "LIVE" | "IN_PERSON"
): Promise<StartWhiteboardSessionResult> {
  const session = await assertOwnsWhiteboardSession(whiteboardSessionId);

  const erasureBlock = await isWhiteboardSessionBlockedByErasure(session.studentId);
  if (erasureBlock.blocked) {
    const jobSuffix = erasureBlock.activeJobId
      ? ` ers=${erasureBlock.activeJobId}`
      : "";
    console.warn(
      `[ers] action=session_start_denied wbsid=${whiteboardSessionId} studentId=${session.studentId}${jobSuffix}`
    );
    throw new ErasureAccessSuspendedError();
  }

  const studentForConsent = await withDbRetry(
    () =>
      db.student.findUnique({
        where: { id: session.studentId },
        select: { learnerProfileId: true },
      }),
    { label: "startWhiteboardSession.studentForConsent" }
  );
  const learnerProfileId = studentForConsent?.learnerProfileId ?? null;

  try {
    await assertConsentRecordExists(learnerProfileId, session.adminUserId, {
      studentId: session.studentId,
    });
  } catch (err) {
    if (err instanceof ConsentError && err.permission === "consentRecord") {
      console.warn(
        `[startWhiteboardSession] wbsid=${whiteboardSessionId} REJECTED: no_consent_record`
      );
    }
    throw err;
  }

  const adminBillingDefaults = await withDbRetry(
    () =>
      db.adminUser.findUnique({
        where: { id: session.adminUserId },
        select: {
          defaultRoundingIncrementMin: true,
          defaultRoundingMode: true,
          tutorTimezone: true,
        },
      }),
    { label: "startWhiteboardSession.adminBillingDefaults" }
  );

  const result = await withDbRetry(
    () =>
      db.whiteboardSession.updateMany({
        where: {
          id: whiteboardSessionId,
          adminUserId: session.adminUserId,
          sessionPhase: "PENDING",
          endedAt: null,
        },
        data: {
          sessionPhase: "ACTIVE",
          activatedAt: new Date(),
          ...(sessionMode ? { sessionMode } : {}),
          roundingIncrementMin:
            adminBillingDefaults?.defaultRoundingIncrementMin ??
            DEFAULT_ROUNDING_INCREMENT_MIN,
          roundingMode:
            adminBillingDefaults?.defaultRoundingMode ?? DEFAULT_ROUNDING_MODE,
          tutorTimezone: adminBillingDefaults?.tutorTimezone ?? null,
        },
      }),
    { label: "startWhiteboardSession" }
  );

  if (result.count > 0) {
    console.info(
      `[slc] wbsid=${whiteboardSessionId} action=session_started phase=active`
    );
  } else {
    console.info(
      `[slc] wbsid=${whiteboardSessionId} action=session_start_noop`
    );
  }

  await logProductEvent({
    kind: "SESSION_STARTED",
    adminUserId: session.adminUserId,
    studentId: session.studentId,
    whiteboardSessionId,
    metadata: {
      mode: sessionMode ?? "LIVE",
      noop: result.count === 0,
    },
  });

  return { ok: true, phase: "active" };
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
 * Return a stable, reusable join token for the given whiteboard
 * session. Same token for repeat calls during the same session —
 * see the idempotency contract below. The caller's encryption key
 * is NOT passed to this action — the key lives only in the tutor's
 * URL fragment, and the tutor's client appends it to the returned
 * `joinPath` before copying to clipboard.
 *
 * Idempotency contract (added May 15 after pilot smoke):
 *   Calling `issueJoinToken(s)` repeatedly during the same live
 *   session returns the SAME token. The original design minted a
 *   fresh row every call, which meant a tutor who clicked "Copy
 *   link" twice handed out two different URLs — neither was wrong
 *   server-side (both pointed at the same session), but the
 *   accumulation muddied debugging and tempted us to revoke an
 *   earlier link prematurely. Stability is the right default; if
 *   the tutor ever wants to rotate (e.g. compromised link), that
 *   gets its own explicit affordance — not implemented yet, see
 *   BACKLOG.md "Tutor-initiated join-link rotation".
 *
 *   Concretely: we look up the most-recent non-revoked, non-expired
 *   token for the session and return it. Only when none exists do
 *   we mint a new one. The token's lifetime is NOT extended on
 *   reuse — the original 24h budget from first mint stays, which
 *   keeps the "links auto-expire" invariant honest (otherwise a
 *   tutor copying every hour would keep a link alive forever).
 *
 * Trust posture (re-read before changing):
 *   - `assertOwnsWhiteboardSession` re-checks the session belongs to
 *     the logged-in tutor + their student. Multi-tenant gate.
 *   - We refuse to issue tokens for sessions that have already ended
 *     (`endedAt != null`). Live collaboration only makes sense before
 *     Stop; after Stop the artifact is the recording, shared via the
 *     separate share-link surface.
 *   - We cap concurrent active tokens per session — see the constant
 *     comment above. After idempotency lands the cap is effectively
 *     unreachable on the happy path (one active token per session at
 *     a time), but the check stays as defense-in-depth against
 *     future code paths that might insert tokens directly.
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

  const studentForConsent = await withDbRetry(
    () =>
      db.student.findUnique({
        where: { id: session.studentId },
        select: { learnerProfileId: true },
      }),
    { label: "issueJoinToken.studentForConsent" }
  );
  const learnerProfileId = studentForConsent?.learnerProfileId ?? null;

  try {
    await assertConsentRecordExists(learnerProfileId, session.adminUserId, {
      studentId: session.studentId,
    });
  } catch (err) {
    if (err instanceof ConsentError && err.permission === "consentRecord") {
      console.log(
        `[wjg] wbsid=${whiteboardSessionId} action=join_token_blocked reason=no_consent_record`
      );
    }
    throw err;
  }

  const now = new Date();

  // Idempotency lookup — if there's already an active token for this
  // session, reuse it. `orderBy createdAt desc` so the freshest one
  // wins in the unlikely-but-possible "multiple active tokens" case
  // (e.g. row written by an older client before idempotency landed,
  // a forthcoming rotateJoinToken admin tool, etc.). The cap check
  // below is still reached only when this lookup returns null.
  const existing = await withDbRetry(
    () =>
      db.whiteboardJoinToken.findFirst({
        where: {
          whiteboardSessionId,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        orderBy: { createdAt: "desc" },
        select: { token: true, expiresAt: true },
      }),
    { label: "issueJoinToken.findExisting" }
  );
  if (existing) {
    console.log(
      `[issueJoinToken] rid=${rid} wbsid=${whiteboardSessionId} reused token=${existing.token.slice(0, 8)}... expiresAt=${existing.expiresAt.toISOString()}`
    );
    return {
      token: existing.token,
      joinPath: `/w/${existing.token}`,
      expiresAt: existing.expiresAt.toISOString(),
    };
  }

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
 * One audio segment about to be registered as a `SessionRecording`
 * row by the atomic end-session action.
 *
 * Mirrors the outbox row schema (`src/lib/recording/upload-outbox.ts`)
 * with two intentional reductions:
 *   - We don't pass `blobLocalRef` — by the time end-session fires,
 *     the bytes are already in Vercel Blob and `blobUrl` is the
 *     canonical pointer.
 *   - We don't pass `attempts`/`lastError` — those are outbox
 *     diagnostics, not persisted state.
 *
 * `segmentId` is forwarded purely for log correlation (we log it
 * with `wbsid=` + `obx=` so a prod debug session can tie a server
 * insert to one outbox row). Server-side dedupe keys on `blobUrl`
 * because the Vercel Blob namespace already guarantees a unique URL
 * per successful upload; adding a `segmentId` column would be a
 * separate (non-additive) Prisma migration.
 */
export type EndSessionSegment = {
  blobUrl: string;
  mimeType: string;
  sizeBytes: number;
  audioStartedAtMs: number;
  streamId: string;
  segmentId: string;
  /** Pause-aware segment duration in whole seconds at cut/stop time. */
  durationSeconds?: number;
};

/**
 * Vercel Blob hostname guard — same shape `registerWhiteboardSessionAudioSegmentAction`
 * uses today (`blobUrl.includes("blob.vercel-storage.com")`). Folded
 * into a regex so the validator below is one branch per segment.
 * Harness URLs accepted only when `isBlobHarnessActive()`.
 */
function blobUrlAllowedForEndSession(blobUrl: string): boolean {
  return isAllowedBlobUrl(blobUrl);
}

function harnessRequestOrigin(): string {
  return process.env.NEXTAUTH_URL ?? "http://localhost:3100";
}

function validateEndSessionSegments(
  segments: ReadonlyArray<EndSessionSegment>
): { ok: true } | { ok: false; error: string } {
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    if (typeof s.blobUrl !== "string" || !s.blobUrl) {
      return { ok: false, error: `Segment ${i} is missing blobUrl.` };
    }
    if (!blobUrlAllowedForEndSession(s.blobUrl)) {
      return {
        ok: false,
        error: `Segment ${i} blobUrl is not in the whiteboard Blob namespace.`,
      };
    }
    if (typeof s.streamId !== "string" || s.streamId.length === 0) {
      return { ok: false, error: `Segment ${i} has empty streamId.` };
    }
    if (typeof s.mimeType !== "string" || s.mimeType.length === 0) {
      return { ok: false, error: `Segment ${i} has empty mimeType.` };
    }
    if (
      typeof s.sizeBytes !== "number" ||
      !Number.isFinite(s.sizeBytes) ||
      s.sizeBytes < 0
    ) {
      return { ok: false, error: `Segment ${i} has invalid sizeBytes.` };
    }
    if (
      typeof s.audioStartedAtMs !== "number" ||
      !Number.isFinite(s.audioStartedAtMs)
    ) {
      return { ok: false, error: `Segment ${i} has invalid audioStartedAtMs.` };
    }
  }
  return { ok: true };
}

export type FinalizeWhiteboardSessionFromBackendResult =
  | { ok: true; idempotent: true }
  | {
      ok: true;
      idempotent: false;
      endedAt: string;
      durationSeconds: number;
      registeredSegments: number;
    }
  | { ok: false; error: string };

/**
 * WS-C — Server-side finalize assembly layer (BLOCKER-5).
 *
 * Assembles events + audio from backend-persisted state, then delegates
 * the atomic commit to `endWhiteboardSession`. Does NOT duplicate
 * transaction / consent / erasure / token-revoke logic.
 */
export async function finalizeWhiteboardSessionFromBackend(
  whiteboardSessionId: string,
  opts?: {
    /** Client-uploaded events.json when server batches may lag the live log. */
    finalEventsBlobUrl?: string;
    snapshotBlobUrl?: string | null;
    /** Outbox segments not yet visible in SessionRecording (in-live End). */
    extraSegments?: ReadonlyArray<EndSessionSegment>;
  }
): Promise<FinalizeWhiteboardSessionFromBackendResult> {
  const session = await assertOwnsWhiteboardSession(whiteboardSessionId);

  if (session.endedAt) {
    console.log(
      `[fzb] fzb=${whiteboardSessionId} action=idempotent_skip batches=0 segments=0`
    );
    return { ok: true, idempotent: true };
  }

  const startedAtRow = await withDbRetry(
    () =>
      db.whiteboardSession.findUnique({
        where: { id: whiteboardSessionId },
        select: { startedAt: true },
      }),
    { label: "finalizeFromBackend.startedAt" }
  );
  const startedAtIso =
    startedAtRow?.startedAt.toISOString() ?? new Date().toISOString();

  const assembled = await assembleBackendEventLog(
    whiteboardSessionId,
    startedAtIso
  );

  const recordingRows = await withDbRetry(
    () =>
      db.sessionRecording.findMany({
        where: { whiteboardSessionId },
        orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          blobUrl: true,
          mimeType: true,
          sizeBytes: true,
          streamId: true,
          createdAt: true,
        },
      }),
    { label: "finalizeFromBackend.recordings" }
  );

  const segmentByUrl = new Map<string, EndSessionSegment>();
  for (const row of recordingRows) {
    segmentByUrl.set(row.blobUrl, {
      blobUrl: row.blobUrl,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      streamId: row.streamId,
      segmentId: row.id,
      audioStartedAtMs: row.createdAt.getTime(),
    });
  }
  for (const extra of opts?.extraSegments ?? []) {
    if (!segmentByUrl.has(extra.blobUrl)) {
      segmentByUrl.set(extra.blobUrl, extra);
    }
  }
  const segments = [...segmentByUrl.values()];

  console.log(
    `[fzb] fzb=${whiteboardSessionId} action=assemble batches=${assembled.batchCount} segments=${segments.length}`
  );

  const candidateScores: Array<{ url: string; score: number }> = [];
  const assembledScore = assembled.log.events.length;
  if (assembledScore > 0) {
    candidateScores.push({ url: "__assembled__", score: assembledScore });
  }
  if (session.eventsBlobUrl) {
    const existingScore = await countEventsInBlobUrl(session.eventsBlobUrl);
    candidateScores.push({ url: session.eventsBlobUrl, score: existingScore });
  }
  if (opts?.finalEventsBlobUrl) {
    const clientScore = await countEventsInBlobUrl(opts.finalEventsBlobUrl);
    candidateScores.push({ url: opts.finalEventsBlobUrl, score: clientScore });
  }

  let finalEventsBlobUrl = session.eventsBlobUrl;
  const best = candidateScores.reduce(
    (acc, cur) => (cur.score > acc.score ? cur : acc),
    { url: session.eventsBlobUrl, score: 0 }
  );

  if (best.url === "__assembled__" && assembledScore > 0) {
    try {
      const eventsBody = JSON.stringify(assembled.log);
      const assembledPath = `whiteboard-sessions/${session.adminUserId}/${session.studentId}/${Date.now()}-events.json`;
      const putResult = isBlobHarnessActive()
        ? await harnessServerPut(
            assembledPath,
            eventsBody,
            { contentType: "application/json", addRandomSuffix: true },
            harnessRequestOrigin()
          )
        : await put(assembledPath, eventsBody, {
          access: "private",
          contentType: "application/json",
          addRandomSuffix: true,
        });
      finalEventsBlobUrl = putResult.url;
    } catch (err) {
      console.error(
        `[fzb] fzb=${whiteboardSessionId} action=assemble_blob_put_failed`,
        err
      );
      return {
        ok: false,
        error: "Could not upload final whiteboard events. Please try again.",
      };
    }
  } else if (best.url !== "__assembled__" && best.score > 0) {
    finalEventsBlobUrl = best.url;
  }

  if (!finalEventsBlobUrl || !/^https?:\/\//i.test(finalEventsBlobUrl)) {
    return {
      ok: false,
      error: "No final events URL available for this session.",
    };
  }

  if (segments.length > 0) {
    const valid = validateEndSessionSegments(segments);
    if (!valid.ok) {
      return { ok: false, error: valid.error };
    }
  }

  let endResult: {
    endedAt: string;
    durationSeconds: number;
    registeredSegments: number;
  };
  try {
    endResult = await endWhiteboardSession(whiteboardSessionId, finalEventsBlobUrl, {
      snapshotBlobUrl: opts?.snapshotBlobUrl ?? undefined,
      segments,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }

  console.log(
    `[fzb] fzb=${whiteboardSessionId} action=end batches=${assembled.batchCount} segments=${segments.length} newSegments=${endResult.registeredSegments}`
  );

  void kickSessionChunksAction(whiteboardSessionId).catch((sweepErr: unknown) => {
    console.warn(
      `[fzb] fzb=${whiteboardSessionId} action=session_sweep_fire_error err=${(sweepErr as Error)?.message ?? sweepErr}`
    );
  });
  const notesResult = await triggerNotesGenerationAction(whiteboardSessionId);
  if (!notesResult.ok) {
    console.warn(
      `[fzb] fzb=${whiteboardSessionId} action=notes_trigger_failed err=${notesResult.error}`
    );
  }

  // WS-G: best-effort seamless replay concat — runs in after(), concurrent
  // with notes-reduce; failure leaves multi-segment replay unchanged.
  enqueueReplayConcatAfterFinalize(whiteboardSessionId);

  return {
    ok: true,
    idempotent: false,
    endedAt: endResult.endedAt,
    durationSeconds: endResult.durationSeconds,
    registeredSegments: endResult.registeredSegments,
  };
}

/**
 * End the whiteboard session: persist the final events blob URL,
 * stamp `endedAt`, register every passed audio segment, and revoke
 * every join token — all in one transaction.
 *
 * Phase 1b — Pillar 3: the action now accepts an optional `segments`
 * payload from the client outbox. Inside the same transaction we
 * upsert `SessionRecording` rows for any segments not already present
 * (deduped by `(whiteboardSessionId, blobUrl)`). Segments missing
 * from the payload are NOT touched — the per-segment legacy
 * `registerWhiteboardSessionAudioSegmentAction` path keeps working
 * for sessions that already wrote rows before End.
 *
 * The events.json upload happens client-side via `/api/upload/blob`
 * (kind="whiteboard-events"). The client then calls THIS action
 * with the resulting blob URL + outbox-derived segments to atomically
 * finalize the row.
 *
 * Trust posture:
 *   - `assertOwnsWhiteboardSession` re-checks ownership.
 *   - We refuse to end an already-ended session (idempotency check
 *     would let a stale tab clobber a fresh `endedAt`).
 *   - Token revocation is part of the same transaction so a
 *     successful end always invalidates outstanding links — the
 *     student can't keep drawing on a "finished" board.
 *   - Every segment's `blobUrl` is validated against our Vercel
 *     Blob namespace before any DB write so a hand-rolled payload
 *     can't sneak an attacker-controlled URL into a SessionRecording
 *     row.
 */
export async function endWhiteboardSession(
  whiteboardSessionId: string,
  finalEventsBlobUrl: string,
  opts?: {
    snapshotBlobUrl?: string | null;
    segments?: ReadonlyArray<EndSessionSegment>;
  }
): Promise<{
  endedAt: string;
  durationSeconds: number;
  /** Count of segments newly-inserted by this call (excludes existing). */
  registeredSegments: number;
}> {
  const rid = createActionCorrelationId();
  const session = await assertOwnsWhiteboardSession(whiteboardSessionId);

  if (session.endedAt) {
    console.warn(
      `[endWhiteboardSession] rid=${rid} wbsid=${whiteboardSessionId} REJECTED: already ended at ${session.endedAt.toISOString()}`
    );
    throw new Error("This whiteboard session has already ended.");
  }

  const phaseRow = await withDbRetry(
    () =>
      db.whiteboardSession.findUnique({
        where: { id: whiteboardSessionId },
        select: { sessionPhase: true },
      }),
    { label: "endWhiteboardSession.phase" }
  );
  const priorPhase = phaseRow?.sessionPhase ?? "PENDING";

  // Pending cleanup: recorder may never have mounted — keep the placeholder
  // events.json URL when the client passes no final blob URL.
  const resolvedEventsBlobUrl =
    priorPhase === "PENDING" &&
    (typeof finalEventsBlobUrl !== "string" || !finalEventsBlobUrl.trim())
      ? session.eventsBlobUrl
      : finalEventsBlobUrl;

  // Crude URL sanity — the recorder constructs blob URLs via the
  // `/api/upload/blob` route which only serves whitelisted hosts;
  // a malformed value here would break replay later, so reject it now.
  if (!/^https?:\/\//i.test(resolvedEventsBlobUrl)) {
    throw new Error("Final events URL must be an absolute http(s) URL.");
  }

  const segments: ReadonlyArray<EndSessionSegment> = opts?.segments ?? [];
  if (segments.length > 0) {
    const valid = validateEndSessionSegments(segments);
    if (!valid.ok) {
      console.warn(
        `[endWhiteboardSession] rid=${rid} wbsid=${whiteboardSessionId} REJECTED segments: ${valid.error}`
      );
      throw new Error(`Could not finalize the whiteboard session: ${valid.error}`);
    }
  }

  // B2 + Block B: mode-aware audio consent BEFORE the transaction.
  // IN_PERSON+denied or no-snapshot claimed minor → skip segment registration.
  // LIVE+denied → register tutor-only mixdown (client already excluded student).
  // Session ALWAYS closes successfully — no lost sessions (reliability invariant).
  let audioConsentGranted = true;
  if (segments.length > 0) {
    const audioConsent = await resolveModeAwareAudioRecordingConsent(
      whiteboardSessionId
    );
    if (!audioConsent.allow) {
      audioConsentGranted = false;
      console.warn(
        `[endWhiteboardSession] rid=${rid} wbsid=${whiteboardSessionId} audio_consent_denied reason=${audioConsent.reason} — segments will NOT be registered; session close proceeds`
      );
    }
  }

  // E6 / H-2: skip segment registration + content blob persist when erasure
  // is in-flight or the student is already erased — session still closes.
  const erasureShortCircuit = await shouldShortCircuitEndSessionForErasure(
    session.studentId
  );
  if (erasureShortCircuit) {
    console.warn(
      `[endWhiteboardSession] rid=${rid} wbsid=${whiteboardSessionId} erasure_short_circuit studentId=${session.studentId} — segments and content persist skipped; session close proceeds`
    );
  }

  const now = new Date();
  const adminTutorTimezone = await withDbRetry(
    () =>
      db.adminUser.findUnique({
        where: { id: session.adminUserId },
        select: { tutorTimezone: true },
      }),
    { label: "endWhiteboardSession.adminTimezone" }
  );
  let updated: { id: string; endedAt: Date | null; durationSeconds: number | null };
  let registeredSegments = 0;
  let billingFreeze: ReturnType<typeof computeBillingFreezeFields> = null;
  try {
    const txResult = await withDbRetry(
      () =>
        db.$transaction(async (tx) => {
          const existing = await tx.whiteboardSession.findUnique({
            where: { id: whiteboardSessionId },
            select: {
              startedAt: true,
              activatedAt: true,
              sessionMode: true,
              activeMs: true,
              lastActiveAt: true,
              bothConnectedAt: true,
              roundingIncrementMin: true,
              roundingMode: true,
              tutorTimezone: true,
              billedDurationMin: true,
            },
          });
          const durationSeconds = existing
            ? Math.max(
                0,
                Math.floor((now.getTime() - existing.startedAt.getTime()) / 1000)
              )
            : 0;

          let billingFreeze: ReturnType<typeof computeBillingFreezeFields> = null;
          if (existing) {
            try {
              billingFreeze = computeBillingFreezeFields({
                sessionMode:
                  existing.sessionMode === "IN_PERSON" ? "IN_PERSON" : "LIVE",
                activeMs: existing.activeMs,
                lastActiveAtMs: existing.lastActiveAt?.getTime() ?? null,
                endedAtMs: now.getTime(),
                bothConnectedAtMs: existing.bothConnectedAt?.getTime() ?? null,
                activatedAtMs: existing.activatedAt?.getTime() ?? null,
                startedAtMs: existing.startedAt.getTime(),
                roundingIncrementMin: existing.roundingIncrementMin,
                roundingMode: existing.roundingMode,
                tutorTimezone: existing.tutorTimezone,
                adminTutorTimezone: adminTutorTimezone?.tutorTimezone ?? null,
                existingBilledDurationMin: existing.billedDurationMin,
              });
            } catch (err) {
              console.error(
                `[endWhiteboardSession] rid=${rid} wbsid=${whiteboardSessionId} billing_freeze_failed:`,
                err
              );
            }
          }

          const row = await tx.whiteboardSession.update({
            where: { id: whiteboardSessionId },
            data: {
              endedAt: now,
              eventsBlobUrl: erasureShortCircuit
                ? session.eventsBlobUrl
                : resolvedEventsBlobUrl,
              ...(erasureShortCircuit
                ? {}
                : { snapshotBlobUrl: opts?.snapshotBlobUrl ?? undefined }),
              durationSeconds,
              ...(billingFreeze
                ? {
                    billedDurationMin: billingFreeze.billedDurationMin,
                    billedStartLocal: billingFreeze.billedStartLocal,
                    billedEndLocal: billingFreeze.billedEndLocal,
                    sessionDateLocal: billingFreeze.sessionDateLocal,
                    tutorTimezone: billingFreeze.tutorTimezone,
                    roundingIncrementMin: billingFreeze.roundingIncrementMin,
                    roundingMode: billingFreeze.roundingMode,
                  }
                : {}),
            },
            select: { id: true, endedAt: true, durationSeconds: true },
          });

          await tx.sessionParticipant.updateMany({
            where: { whiteboardSessionId, leftAt: null },
            data: { leftAt: now },
          });

          // Atomic multi-track segment registration. Order matters:
          //   1. read existing segment URLs for this session (so we
          //      dedupe against any rows the legacy per-segment action
          //      or a previous failed end attempt already wrote).
          //   2. compute orderIndex deterministically by
          //      audioStartedAtMs ASC, then streamId ASC. Two passes
          //      that share an audioStartedAtMs tie-break the same
          //      way, so a retried end-session call assigns the same
          //      indices.
          //   3. createMany the new rows (skipDuplicates guards
          //      the in-flight race where two tabs both reach end
          //      with overlapping payloads — extremely unlikely in
          //      practice but cheap to defend).
          // B2: audioConsentGranted=false skips registration entirely;
          // E6: erasureShortCircuit skips registration + content persist;
          // session close + token revocation still proceed.
          let newSegments = 0;
          if (segments.length > 0 && audioConsentGranted && !erasureShortCircuit) {
            const existingRows = await tx.sessionRecording.findMany({
              where: {
                whiteboardSessionId,
                blobUrl: { in: segments.map((s) => s.blobUrl) },
              },
              select: { blobUrl: true, orderIndex: true },
            });
            const seen = new Set(existingRows.map((r) => r.blobUrl));
            const maxOrder = await tx.sessionRecording.aggregate({
              where: { whiteboardSessionId },
              _max: { orderIndex: true },
            });
            let nextOrder = (maxOrder._max.orderIndex ?? -1) + 1;
            const toInsert = segments
              .filter((s) => !seen.has(s.blobUrl))
              .slice() // copy so we don't mutate caller's array
              .sort((a, b) => {
                if (a.audioStartedAtMs !== b.audioStartedAtMs) {
                  return a.audioStartedAtMs - b.audioStartedAtMs;
                }
                return a.streamId < b.streamId ? -1 : a.streamId > b.streamId ? 1 : 0;
              });
            if (toInsert.length > 0) {
              await tx.sessionRecording.createMany({
                data: toInsert.map((s) => ({
                  adminUserId: session.adminUserId,
                  studentId: session.studentId,
                  whiteboardSessionId,
                  blobUrl: s.blobUrl,
                  mimeType: s.mimeType.split(";")[0].trim(),
                  sizeBytes: s.sizeBytes,
                  streamId: s.streamId,
                  orderIndex: nextOrder++,
                  ...(typeof s.durationSeconds === "number" &&
                    s.durationSeconds > 0 && {
                      durationSeconds: s.durationSeconds,
                    }),
                })),
                skipDuplicates: true,
              });
              newSegments = toInsert.length;
            }
          }

          await tx.whiteboardJoinToken.updateMany({
            where: {
              whiteboardSessionId,
              revokedAt: null,
            },
            data: { revokedAt: now },
          });
          return { row, newSegments, billingFreeze };
        }),
      { label: "endWhiteboardSession" }
    );
    updated = txResult.row;
    registeredSegments = txResult.newSegments;
    billingFreeze = txResult.billingFreeze;
  } catch (err) {
    console.error(
      `[endWhiteboardSession] rid=${rid} wbsid=${whiteboardSessionId} db.transaction failed:`,
      err
    );
    throw new Error("Could not finalize the whiteboard session. Please try again.");
  }

  console.info(
    `[slc] wbsid=${whiteboardSessionId} action=session_ended phase=${priorPhase.toLowerCase()}`
  );
  console.log(
    `[endWhiteboardSession] rid=${rid} wbsid=${whiteboardSessionId} endedAt=${updated.endedAt?.toISOString()} duration=${updated.durationSeconds}s segmentsInPayload=${segments.length} newSegments=${registeredSegments}`
  );

  await logProductEvent({
    kind: "SESSION_ENDED",
    adminUserId: session.adminUserId,
    studentId: session.studentId,
    whiteboardSessionId,
    metadata: {
      priorPhase,
      path: "normal",
    },
  });

  if (billingFreeze) {
    console.log(
      `[endWhiteboardSession] rid=${rid} wbsid=${whiteboardSessionId} billing_frozen billedDurationMin=${billingFreeze.billedDurationMin} mode=${billingFreeze.roundingMode} increment=${billingFreeze.roundingIncrementMin} tz=${billingFreeze.tutorTimezone} sessionDateLocal=${billingFreeze.sessionDateLocal}`
    );
  }
  // Per-segment log line so a future ops grep can correlate an outbox
  // segmentId to its persisted SessionRecording by blobUrl.
  for (const s of segments) {
    console.log(
      `[endWhiteboardSession] rid=${rid} wbsid=${whiteboardSessionId} segmentId=${s.segmentId} streamId=${s.streamId} sizeBytes=${s.sizeBytes} blobUrlSuffix=${s.blobUrl.slice(-24)}`
    );
  }

  revalidatePath(`/admin/students/${session.studentId}`);
  revalidatePath(
    `/admin/students/${session.studentId}/whiteboard/${whiteboardSessionId}`
  );
  // NOTE: do NOT revalidatePath for the /workspace route here.
  // The A3 in-shell mode flip (WhiteboardSessionShell) handles the
  // live→review transition client-side via onSessionEnded(). If we
  // revalidate /workspace, Next.js App Router re-renders page.tsx
  // server-side (which now sees endedAt=set and returns
  // WorkspacePreviousSessionPreview), replacing the client's
  // WhiteboardSessionShell tree before SessionReviewMode can mount.
  // The workspace page is force-dynamic so there is no server-side
  // cache to warm; revalidating it is a no-op for caching and only
  // triggers the unwanted RSC replacement. On the next manual
  // navigation to /workspace (new tab, refresh, link click) the
  // page correctly serves WorkspacePreviousSessionPreview because
  // endedAt is durably stamped in the DB.

  return {
    endedAt: updated.endedAt!.toISOString(),
    durationSeconds: updated.durationSeconds ?? 0,
    registeredSegments,
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

  const phaseRow = await withDbRetry(
    () =>
      db.whiteboardSession.findUnique({
        where: { id: whiteboardSessionId },
        select: { sessionPhase: true },
      }),
    { label: "endStaleWhiteboardSession.phase" }
  );
  const priorPhase = phaseRow?.sessionPhase ?? "PENDING";

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
          await tx.sessionParticipant.updateMany({
            where: { whiteboardSessionId, leftAt: null },
            data: { leftAt: now },
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

  console.info(
    `[slc] wbsid=${whiteboardSessionId} action=session_ended phase=${priorPhase.toLowerCase()}`
  );
  console.log(
    `[endStaleWhiteboardSession] rid=${rid} wbsid=${whiteboardSessionId} endedAt=${updated.endedAt?.toISOString()} duration=${updated.durationSeconds}s`
  );

  await logProductEvent({
    kind: "SESSION_ENDED",
    adminUserId: session.adminUserId,
    studentId: session.studentId,
    whiteboardSessionId,
    metadata: {
      priorPhase,
      path: "stale",
    },
  });

  // Student detail lists open sessions + the resume-gate "End" path
  // should both see the list update without a full router refresh;
  // closing the room also means the workspace RSC re-reads endedAt.
  revalidatePath(`/admin/students/${session.studentId}`);
  revalidatePath(
    `/admin/students/${session.studentId}/whiteboard/${whiteboardSessionId}/workspace`
  );

  return {
    endedAt: updated.endedAt!.toISOString(),
    durationSeconds: updated.durationSeconds ?? 0,
  };
}

const WBSID_FIELD = "whiteboardSessionId";

/**
 * Form POST handler: end a still-open whiteboard from the student
 * detail "Open whiteboard sessions" list. `endStaleWhiteboardSession`
 * is the right primitive — no final events.json (tutor is cleaning up
 * from the roster, not pressing Stop in the live workspace).
 */
export async function endOpenWhiteboardFromStudentPage(
  formData: FormData
): Promise<void> {
  const raw = formData.get(WBSID_FIELD);
  if (typeof raw !== "string" || !raw) {
    throw new Error("Missing whiteboard session.");
  }
  await endStaleWhiteboardSession(raw);
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

const WB_TRANSCRIPT_OUTER_CONCURRENCY = 3;

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
  console.log(`[generateNotesFromWB] rid=${rid} wbsid=${whiteboardSessionId} begin`);

  const actionStartedMs = performance.now();

  try {
    const scope = await requireStudentScope();
    if (scope.kind !== "admin") {
      return {
        ok: false,
        error: "Audio transcription requires a DB-backed tutor account.",
        debugId: rid,
      };
    }
    const tutorAdminId = scope.adminId;

  // B1 cost gate: WAITLISTED tutors cannot trigger notes generation (OpenAI spend).
  await assertTutorApproved(tutorAdminId);

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

  console.log(
    `[transcribe-parallel] rid=${rid} outer-cap=${WB_TRANSCRIPT_OUTER_CONCURRENCY} segments=${audioRows.length} mode=parallel`
  );

  type SegmentOutcome =
    | { kind: "fatal"; index: number; result: TranscribeAndGenerateResult }
    | { kind: "skipped"; index: number }
    | {
        kind: "kept";
        index: number;
        transcript: string;
        durationSeconds: number | null;
        createdAt: Date;
      };

  async function processSegment(i: number): Promise<SegmentOutcome> {
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
        kind: "fatal",
        index: i,
        result: {
          ok: false,
          error: `Could not download audio segment ${i + 1}. Please try again.`,
          debugId: rid,
        },
      };
    }

    const baseMime = row.mimeType.split(";")[0].trim().toLowerCase();
    const ext =
      MIME_TO_EXT[baseMime] ?? baseMime.split("/")[1]?.split(";")[0] ?? "webm";
    const filename = `wb-${whiteboardSessionId}-part${i + 1}.${ext}`;
    const result = await transcribeAudio(audioBuffer, filename, row.mimeType, {
      adminUserId: tutorAdminId,
      studentId,
      sessionRecordingId: row.id,
      whiteboardSessionId,
    }, { rid });

    if ("error" in result) {
      if (result.error === "not configured") {
        return {
          kind: "fatal",
          index: i,
          result: {
            ok: false,
            error: "AI transcription is not configured on this server.",
            debugId: rid,
          },
        };
      }
      return {
        kind: "fatal",
        index: i,
        result: { ok: false, error: result.error, debugId: rid },
      };
    }

    if (looksLikeSilenceHallucination(result.transcript, result.durationSeconds)) {
      console.warn(
        `[generateNotesFromWB] rid=${rid} wbsid=${whiteboardSessionId} segment ${i + 1} likely silence — skipping`
      );
      return { kind: "skipped", index: i };
    }

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

    return {
      kind: "kept",
      index: i,
      transcript: result.transcript,
      durationSeconds: result.durationSeconds,
      createdAt: row.createdAt,
    };
  }

  const outcomes = await mapWithConcurrency(
    audioRows.map((_, i) => i),
    WB_TRANSCRIPT_OUTER_CONCURRENCY,
    async (i) => processSegment(i)
  );

  const transcriptParts: string[] = [];
  const keptTimings: Array<{ createdAt: Date; durationSeconds: number }> = [];
  let skippedHallucinationSegments = 0;

  for (const o of outcomes) {
    if (o.kind === "fatal") return o.result;
    if (o.kind === "skipped") {
      skippedHallucinationSegments += 1;
      continue;
    }
    transcriptParts.push(o.transcript);
    keptTimings.push({
      createdAt: o.createdAt,
      durationSeconds: o.durationSeconds ?? 0,
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
    costProvenance: {
      adminUserId: tutorAdminId,
      studentId,
      whiteboardSessionId,
    },
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
  } catch (err: unknown) {
    const elapsedMs = performance.now() - actionStartedMs;
    if (shouldTreatAsTranscriptionTimeout(err, elapsedMs)) {
      console.error(
        `[generateNotesFromWB] rid=${rid} wbsid=${whiteboardSessionId} invocation budget exceeded (elapsedMs=${Math.round(elapsedMs)})`
      );
      return {
        ok: false,
        error: FRIENDLY_TRANSCRIPTION_TIMEOUT_MESSAGE,
        debugId: rid,
      };
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[generateNotesFromWB] rid=${rid} wbsid=${whiteboardSessionId} thrown:`, msg);
    return {
      ok: false,
      error: `Server error during transcription: ${msg}. Please try again.`,
      debugId: rid,
    };
  }
}

export type RegisterWhiteboardSessionAudioSegmentResult =
  | { ok: true; recordingId: string; orderIndex: number; deduped?: boolean }
  | { ok: false; error: string; debugId?: string; sessionEnded?: true };

/**
 * After `uploadAudioDirect` stores a segment in Blob, the workspace calls this
 * to attach the row to the whiteboard session for transcription / replay.
 *
 * Trust: `assertOwnsWhiteboardSession`; blob URL must look like our Vercel
 * Blob host (same defence as the regular session transcription path).
 */
export async function registerWhiteboardSessionAudioSegmentAction(
  whiteboardSessionId: string,
  segment: {
    blobUrl: string;
    mimeType: string;
    sizeBytes: number;
    streamId?: string;
    speakerId?: string;
    audioStartedAtMs?: number;
    durationSeconds?: number;
  }
): Promise<RegisterWhiteboardSessionAudioSegmentResult> {
  const rid = createActionCorrelationId();
  try {
    const scope = await requireStudentScope();
    if (scope.kind === "env") {
      return {
        ok: false,
        error: "Audio features require a DB-backed tutor account.",
        debugId: rid,
      };
    }

    if (!blobUrlAllowedForEndSession(segment.blobUrl)) {
      return { ok: false, error: "Invalid audio URL.", debugId: rid };
    }

    const session = await assertOwnsWhiteboardSession(whiteboardSessionId);
    if (session.endedAt) {
      return {
        ok: false,
        error: "This whiteboard session has already ended.",
        debugId: rid,
        sessionEnded: true,
      };
    }

    // Phase check — audio segments must only be registered during ACTIVE sessions.
    // Reject quietly during PENDING so a stale client doesn't create orphaned rows.
    const phaseRow = await withDbRetry(
      () =>
        db.whiteboardSession.findUnique({
          where: { id: whiteboardSessionId },
          select: { sessionPhase: true },
        }),
      { label: "registerWbAudio.phase" }
    );
    if (phaseRow?.sessionPhase !== "ACTIVE") {
      console.log(
        `[registerWhiteboardSessionAudioSegment] rid=${rid} wbsid=${whiteboardSessionId} skipped: sessionPhase=${phaseRow?.sessionPhase ?? "unknown"}`
      );
      return {
        ok: false,
        error: "Session is not yet active — audio cannot be registered.",
        debugId: rid,
      };
    }

    // B2 + Block B: mode-aware consent gate (same semantics as end-session).
    const audioConsent = await resolveModeAwareAudioRecordingConsent(
      whiteboardSessionId
    );
    if (!audioConsent.allow) {
      console.log(
        `[registerWhiteboardSessionAudioSegment] rid=${rid} wbsid=${whiteboardSessionId} rejected: consent reason=${audioConsent.reason}`
      );
      return {
        ok: false,
        error: "Audio recording consent is not granted for this session.",
        debugId: rid,
      };
    }

    const existing = await withDbRetry(
      () =>
        db.sessionRecording.findFirst({
          where: { whiteboardSessionId, blobUrl: segment.blobUrl },
          select: { id: true, orderIndex: true },
        }),
      { label: "registerWbAudio.dedupe" }
    );
    if (existing) {
      console.log(
        `[obx] obx action=register_mid_session rid=${rid} wbsid=${whiteboardSessionId} deduped blobUrl recordingId=${existing.id} orderIndex=${existing.orderIndex}`
      );
      return {
        ok: true,
        recordingId: existing.id,
        orderIndex: existing.orderIndex,
        deduped: true,
      };
    }

    const streamId = segment.streamId ?? TUTOR_MIC_STREAM_ID;

    let row: { id: string; orderIndex: number } | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        row = await withDbRetry(
          () =>
            db.$transaction(async (tx) => {
              const last = await tx.sessionRecording.findFirst({
                where: { whiteboardSessionId },
                orderBy: { orderIndex: "desc" },
                select: { orderIndex: true },
              });
              const orderIndex = (last?.orderIndex ?? -1) + 1;
              return tx.sessionRecording.create({
                data: {
                  adminUserId: session.adminUserId,
                  studentId: session.studentId,
                  whiteboardSessionId,
                  blobUrl: segment.blobUrl,
                  mimeType: segment.mimeType.split(";")[0].trim(),
                  sizeBytes: segment.sizeBytes,
                  orderIndex,
                  streamId,
                  ...(typeof segment.durationSeconds === "number" &&
                    segment.durationSeconds > 0 && {
                      durationSeconds: segment.durationSeconds,
                    }),
                },
                select: { id: true, orderIndex: true },
              });
            }),
          { label: "registerWbAudio.create" }
        );
        break;
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === "P2002") {
          const raced = await withDbRetry(
            () =>
              db.sessionRecording.findFirst({
                where: { whiteboardSessionId, blobUrl: segment.blobUrl },
                select: { id: true, orderIndex: true },
              }),
            { label: "registerWbAudio.p2002Dedupe" }
          );
          if (raced) {
            console.log(
              `[obx] obx action=register_mid_session rid=${rid} wbsid=${whiteboardSessionId} deduped=p2002 blobUrl recordingId=${raced.id} orderIndex=${raced.orderIndex}`
            );
            return {
              ok: true,
              recordingId: raced.id,
              orderIndex: raced.orderIndex,
              deduped: true,
            };
          }
          if (attempt < 1) continue;
        }
        throw err;
      }
    }

    if (!row) {
      return {
        ok: false,
        error: "Could not save recording metadata after retry.",
        debugId: rid,
      };
    }

    console.log(
      `[obx] obx action=register_mid_session rid=${rid} wbsid=${whiteboardSessionId} recordingId=${row.id} orderIndex=${row.orderIndex} streamId=${streamId}`
    );

    return { ok: true, recordingId: row.id, orderIndex: row.orderIndex };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[registerWhiteboardSessionAudioSegment] rid=${rid} wbsid=${whiteboardSessionId} thrown:`,
      msg
    );
    return {
      ok: false,
      error: `Could not save recording metadata: ${msg}`,
      debugId: rid,
    };
  }
}

// -------------------------------------------------------------------
// Recording re-arch Phase 1, Slice 2b — producer wedge
// -------------------------------------------------------------------

/**
 * Server-side entry point for the slice 2b producer wedge.
 *
 * Called by the workspace client AFTER a segment blob is confirmed
 * uploaded (outbox.enqueue succeeded). Validates session ownership
 * and blob host, then hands off to the slice 2a `enqueueChunkTranscribe`
 * helper — which either publishes to Vercel Queues (when provisioned)
 * or invokes the worker directly via the queue-stub seam.
 *
 * Trust posture:
 *   - `assertOwnsWhiteboardSession` re-checks that the logged-in
 *     tutor owns this session before touching any transcription infra.
 *   - `chunkBlobUrl` is validated against `ALLOWED_BLOB_HOST_RE`
 *     (the same regex used by `endWhiteboardSession` and
 *     `registerWhiteboardSessionAudioSegmentAction`) so a hand-rolled
 *     payload cannot inject an attacker-controlled URL into the
 *     transcription pipeline.
 *
 * This action THROWS on auth/validation failures (the client wraps
 * the call in a fire-and-forget so the exception is swallowed on
 * the upload-confirm path — it never disrupts recording or upload).
 * The `enqueueChunkTranscribe` call itself never throws (it logs +
 * swallows failures to preserve the non-blocking guarantee).
 *
 * Log prefix: [txc]  Mirrors the worker.
 */
export async function enqueueChunkTranscriptionAction(
  whiteboardSessionId: string,
  payload: {
    chunkBlobUrl: string;
    recordingTimeOffsetMs: number;
    streamId?: string;
    speakerId?: string | null;
  }
): Promise<void> {
  const { chunkBlobUrl, recordingTimeOffsetMs, speakerId = null } = payload;
  const streamId = payload.streamId ?? TUTOR_MIC_STREAM_ID;

  // 1. Ownership check — multi-tenant gate, must be first.
  const enqueueSession = await assertOwnsWhiteboardSession(whiteboardSessionId);

  // B1 cost gate: WAITLISTED tutors cannot enqueue transcription jobs.
  await assertTutorApproved(enqueueSession.adminUserId);

  // 2. Phase check — transcription chunks are only valid during ACTIVE sessions.
  // A PENDING-phase ping from a stale client must not enqueue a transcription job.
  const phaseRow = await withDbRetry(
    () =>
      db.whiteboardSession.findUnique({
        where: { id: whiteboardSessionId },
        select: { sessionPhase: true },
      }),
    { label: "enqueueChunkTranscription.phase" }
  );
  if (phaseRow?.sessionPhase !== "ACTIVE") {
    console.log(
      `[txc] wbsid=${whiteboardSessionId} action=enqueue_action_skipped reason=not_active_phase phase=${phaseRow?.sessionPhase ?? "unknown"}`
    );
    return;
  }

  // Block B: mode-aware consent — IN_PERSON+denied or no-snapshot claimed minor
  // fail-closed; LIVE+denied allows tutor-only mixdown transcription.
  const audioConsent = await resolveModeAwareAudioRecordingConsent(
    whiteboardSessionId
  );
  if (!audioConsent.allow) {
    console.log(
      `[txc] wbsid=${whiteboardSessionId} action=enqueue_rejected reason=${audioConsent.reason}`
    );
    return;
  }

  // 3. Blob host validation — reuse the same regex used by endWhiteboardSession.
  if (
    typeof chunkBlobUrl !== "string" ||
    !blobUrlAllowedForEndSession(chunkBlobUrl)
  ) {
    console.warn(
      `[txc] wbsid=${whiteboardSessionId} action=enqueue_action_rejected reason=invalid_blob_host chunkBlobUrl=${chunkBlobUrl}`
    );
    throw new Error("Invalid chunk blob URL: host not in the allowed Blob namespace.");
  }

  console.log(
    `[txc] wbsid=${whiteboardSessionId} action=enqueue_action_start offsetMs=${recordingTimeOffsetMs} streamId=${streamId} chunkBlobUrlSuffix=${chunkBlobUrl.slice(-24)}`
  );

  // 4. Enqueue — never throws (errors are logged and swallowed by enqueueChunkTranscribe).
  await enqueueChunkTranscribe({
    sessionId: whiteboardSessionId,
    chunkBlobUrl,
    recordingTimeOffsetMs,
    streamId,
    speakerId,
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
    await revalidateStudentSharePages(session.studentId);
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

  const noteIdForAudio = targetNoteId!;
  const maxOrder = await withDbRetry(
    () =>
      db.sessionRecording.aggregate({
        where: { noteId: noteIdForAudio },
        _max: { orderIndex: true },
      }),
    { label: "attachWhiteboardToNote.maxOrder" }
  );
  let nextOrder = (maxOrder._max.orderIndex ?? -1) + 1;
  const orphanSegments = await withDbRetry(
    () =>
      db.sessionRecording.findMany({
        where: { whiteboardSessionId, noteId: null },
        orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
        select: { id: true },
      }),
    { label: "attachWhiteboardToNote.listOrphanSegments" }
  );
  for (const row of orphanSegments) {
    await withDbRetry(
      () =>
        db.sessionRecording.update({
          where: { id: row.id },
          data: { noteId: noteIdForAudio, orderIndex: nextOrder++ },
        }),
      { label: "attachWhiteboardToNote.linkOrphanSegment" }
    );
  }

  console.log(
    `[attachWhiteboardToNote] rid=${rid} wbsid=${whiteboardSessionId} linked to note=${targetNoteId}`
  );

  revalidatePath(`/admin/students/${session.studentId}`);
  revalidatePath(
    `/admin/students/${session.studentId}/whiteboard/${whiteboardSessionId}`
  );
  await revalidateStudentSharePages(session.studentId);

  return { ok: true, noteId: targetNoteId! };
}
