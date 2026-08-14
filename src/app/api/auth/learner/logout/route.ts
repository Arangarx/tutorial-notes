/**
 * POST /api/auth/learner/logout
 *
 * Revokes the current learner device session and clears the cookie.
 * SMOKE-PRIV-1: when a parent AH session cookie is also present (shared device),
 * revoke and clear that session too so the next user cannot reach /account/*.
 */

import { NextRequest, NextResponse } from "next/server";
import { getLearnerSession, clearLearnerSessionCookie } from "@/lib/learner-session";
import {
  getAccountHolderSession,
  revokeAccountHolderSession,
  clearAhSessionCookie,
} from "@/lib/account-holder-session";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  const session = await getLearnerSession(req);

  if (session) {
    await db.learnerDeviceSession.update({
      where: { id: session.sessionId },
      data: { revokedAt: new Date() },
    });
    console.log(
      `[lpr] lpr=${session.learnerProfileId} action=device_revoked session=${session.sessionId} revokedBy=self`
    );
  }

  const ahSession = await getAccountHolderSession(req);
  if (ahSession) {
    await revokeAccountHolderSession(ahSession.sessionId);
    console.log(
      `[ahx] ahx=${ahSession.accountHolderId} action=logout session=${ahSession.sessionId} revokedBy=learner_logout`
    );
  }

  const response = NextResponse.json({ ok: true });
  response.headers.append("Set-Cookie", clearLearnerSessionCookie());
  if (ahSession) {
    response.headers.append("Set-Cookie", clearAhSessionCookie());
  }
  return response;
}
