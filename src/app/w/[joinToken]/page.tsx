import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { StudentWhiteboardClient } from "./StudentWhiteboardClient";
/**
 * Student-facing live whiteboard (Excalidraw + E2E sync, same room + key
 * as the tutor workspace).
 *
 * URL shape: `/w/<joinToken>#k=<encryptionKey>`
 *
 *   - `joinToken` (path) — opaque, server-known. Issued by the tutor's
 *     `issueJoinToken` server action; persisted on `WhiteboardJoinToken`.
 *     Server resolves it to a `WhiteboardSession`, validates the
 *     not-revoked + not-expired + session-still-live invariants.
 *
 *   - `encryptionKey` (URL fragment) — the AES-GCM key for E2E
 *     encryption against the relay. Fragments are NEVER sent to the
 *     server (HTTP spec). The client extracts it in
 *     `StudentWhiteboardClient` and feeds it to `sync-client`.
 *
 * Server posture:
 *   - We do NOT run `requireStudentScope` here — the student is not
 *     a logged-in user. The token IS the auth.
 *   - We expose the bare minimum to the page: room id (= session id),
 *     tutor display name (so the student knows whose session this is),
 *     and the sync host URL. We do NOT leak adminUserId / studentId /
 *     anything else server-internal.
 *   - `noindex` so search engines don't archive the page (token leak risk).
 */

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Whiteboard session",
    robots: { index: false, follow: false, noarchive: true, nosnippet: true },
  };
}

type RouteParams = { joinToken: string };

export default async function StudentWhiteboardPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { joinToken } = await params;

  const tokenRow = await db.whiteboardJoinToken.findUnique({
    where: { token: joinToken },
    select: {
      id: true,
      whiteboardSessionId: true,
      expiresAt: true,
      revokedAt: true,
      whiteboardSession: {
        select: {
          id: true,
          endedAt: true,
          adminUser: {
            select: { displayName: true, email: true },
          },
        },
      },
    },
  });

  // Token-not-found and token-revoked-or-expired collapse to the same
  // 404 deliberately — we don't want to leak which case it is to a
  // probing visitor. The tutor-side admin UI surfaces token state
  // explicitly so the tutor can re-issue.
  if (!tokenRow) notFound();
  const now = new Date();
  if (tokenRow.revokedAt) notFound();
  if (tokenRow.expiresAt.getTime() <= now.getTime()) notFound();
  if (!tokenRow.whiteboardSession) notFound();
  if (tokenRow.whiteboardSession.endedAt) notFound();

  const tutorName =
    tokenRow.whiteboardSession.adminUser?.displayName?.trim() ||
    tokenRow.whiteboardSession.adminUser?.email?.split("@")[0] ||
    "your tutor";

  // Stamp bothConnectedAt on the session the first time the student
  // opens the link. Idempotent — updateMany with null guard means
  // a page refresh or second open never moves the anchor forward.
  // This is the canonical source of truth the tutor's live timer
  // counts from ("session timer starts when both are connected").
  await db.whiteboardSession.updateMany({
    where: {
      id: tokenRow.whiteboardSessionId,
      bothConnectedAt: null,
    },
    data: { bothConnectedAt: now },
  });

  // If WHITEBOARD_SYNC_URL isn't configured the live-collab feature is
  // off in this environment. Show a friendly explanation rather than a
  // broken silent "connecting…" UI.
  if (!env.WHITEBOARD_SYNC_URL) {
    return (
      <div className="container" style={{ maxWidth: 720 }}>
        <div className="card">
          <h1 style={{ marginTop: 0 }}>Whiteboard not available</h1>
          <p>
            Live whiteboard collaboration is not enabled in this environment.
            Please ask {tutorName} to share a recording link instead.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <StudentWhiteboardClient
        whiteboardSessionId={tokenRow.whiteboardSession.id}
        syncUrl={env.WHITEBOARD_SYNC_URL}
        tutorName={tutorName}
      />
    </div>
  );
}
