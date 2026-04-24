import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { assertOwnsWhiteboardSession } from "@/lib/whiteboard-scope";
import { createActionCorrelationId } from "@/lib/action-correlation";

/**
 * Whiteboard session partial-checkpoint upload.
 *
 * Whiteboard plan blocker #1 (data durability): the recorder hook
 * flushes a full event-log JSON to IndexedDB every 30 s AND uploads
 * a partial checkpoint to Vercel Blob every 5 min. The Blob upload
 * is what protects against "tutor closes tab AND clears local data
 * AND can't resume from this device" — the next device that opens
 * the workspace can pull the partial down and continue.
 *
 * On Stop, the recorder writes a final `events.json` to the session's
 * canonical `eventsBlobUrl` (via the generalized
 * `/api/upload/blob` route, kind=`whiteboard-events`). The
 * checkpoints uploaded here are intentionally separate URLs — they
 * are NOT the canonical artifact, so we don't overwrite the slot
 * that replay reads from until Stop.
 *
 * This route accepts a JSON body (small: < 500 KB worst-case for
 * the checkpoint blob since the diff log is bounded), so we use the
 * server-action shape, not handleUpload — checkpoints fit comfortably
 * under the 4.5 MB serverless body cap and avoiding a second
 * client-direct round-trip simplifies the recorder hook.
 */

type CheckpointBody = {
  /** Schema version of the canonical event log on disk. */
  schemaVersion: number;
  /** Wall-clock when this snapshot was taken (informational, for log lines). */
  takenAt: string;
  /** Stringified WBEventLog JSON. */
  eventsJson: string;
};

function parseBody(raw: unknown): CheckpointBody | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Partial<CheckpointBody>;
  if (typeof r.schemaVersion !== "number") return null;
  if (typeof r.takenAt !== "string") return null;
  if (typeof r.eventsJson !== "string") return null;
  return r as CheckpointBody;
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ sessionId: string }> }
): Promise<Response> {
  const rid = createActionCorrelationId();
  const { sessionId } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    console.warn(`[wbCheckpoint.route] rid=${rid} wbsid=${sessionId} invalid JSON body`);
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = parseBody(body);
  if (!parsed) {
    console.warn(`[wbCheckpoint.route] rid=${rid} wbsid=${sessionId} body shape invalid`);
    return NextResponse.json({ error: "Invalid checkpoint payload." }, { status: 400 });
  }

  let session;
  try {
    session = await assertOwnsWhiteboardSession(sessionId);
  } catch (err) {
    // assertOwnsWhiteboardSession calls notFound() which throws a
    // NEXT_NOT_FOUND error; let Next handle it consistently.
    throw err;
  }

  if (session.endedAt) {
    console.log(
      `[wbCheckpoint.route] rid=${rid} wbsid=${sessionId} ignoring checkpoint for ended session`
    );
    return NextResponse.json(
      { error: "Session already ended." },
      { status: 409 }
    );
  }

  // Path scheme keeps checkpoints scoped under the session id so a
  // future cleanup sweep can list-and-delete by prefix.
  const pathname = `whiteboard-checkpoints/${sessionId}/${Date.now()}-${parsed.takenAt.replace(/[^a-zA-Z0-9._-]/g, "_")}.json`;

  try {
    const result = await put(pathname, parsed.eventsJson, {
      // The Vercel Blob store is configured for PRIVATE access. Even
      // though checkpoints are tutor-only and route-gated, we MUST use
      // "private" here because public against a private store is a
      // hard 400 from Vercel's edge ("Cannot use public access on a
      // private store"). When/if cross-device resume is built it'll
      // need to fetch through a tutor-gated proxy route the same way
      // /api/whiteboard/[id]/events does — see lib/blob.ts header.
      access: "private",
      contentType: "application/json",
      addRandomSuffix: true,
    });
    console.log(
      `[wbCheckpoint.route] rid=${rid} wbsid=${sessionId} schemaVersion=${parsed.schemaVersion} bytes=${parsed.eventsJson.length} url=${result.url}`
    );
    // Note: we deliberately don't write the checkpoint URL back to the
    // WhiteboardSession row. The session's `eventsBlobUrl` is the
    // canonical artifact written on Stop and replay reads from there.
    // Mid-session checkpoints are recovery-only — adding a tracking
    // column is a follow-up if/when cross-device resume is built (see
    // WHITEBOARD-STATUS.md follow-ups).
    return NextResponse.json({ ok: true, url: result.url, debugId: rid });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[wbCheckpoint.route] rid=${rid} wbsid=${sessionId} put failed:`, msg);
    return NextResponse.json(
      { error: "Could not save checkpoint.", debugId: rid },
      { status: 500 }
    );
  }
}
