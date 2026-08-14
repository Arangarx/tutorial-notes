import "server-only";

/**
 * B1 tutor signup-waitlist — approval gate library.
 *
 * COST-GATING: WAITLISTED tutors MUST NOT incur any external cost
 * (Blob uploads, OpenAI/Whisper calls, whiteboard sessions).
 *
 * Log prefix: [tap] (tutor approval)
 *
 * Usage pattern on every cost chokepoint:
 *   await assertTutorApproved(adminUserId);
 *
 * The assertion runs AFTER the ownership check (assertOwnsStudent /
 * assertOwnsWhiteboardSession) so the ownership error surfaces first
 * and the approval error only fires for the session owner.
 *
 * Deferred: REJECTED status, email notifications, self-service revocation.
 * See feat/signup-waitlist smokebook for full TODO list.
 */

import { db } from "@/lib/db";
import type { TutorApprovalStatus } from "@prisma/client";

// ---------------------------------------------------------------------------
// Typed error so callers can distinguish approval failures from other errors
// ---------------------------------------------------------------------------

export class TutorNotApprovedError extends Error {
  readonly code = "TUTOR_NOT_APPROVED" as const;
  readonly adminUserId: string;
  readonly status: TutorApprovalStatus;

  constructor(adminUserId: string, status: TutorApprovalStatus) {
    super(
      `Tutor account is not yet approved (status=${status}). ` +
        `Please wait for an operator to approve your account.`
    );
    this.name = "TutorNotApprovedError";
    this.adminUserId = adminUserId;
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

/**
 * Returns the current approvalStatus for an AdminUser row.
 * Returns null if the row does not exist.
 */
export async function getTutorApprovalStatus(
  adminUserId: string
): Promise<TutorApprovalStatus | null> {
  const row = await db.adminUser.findUnique({
    where: { id: adminUserId },
    select: { approvalStatus: true },
  });
  return row?.approvalStatus ?? null;
}

/**
 * Returns true iff the tutor's approvalStatus is APPROVED.
 * Returns false for WAITLISTED or non-existent rows.
 */
export async function isTutorApproved(adminUserId: string): Promise<boolean> {
  const status = await getTutorApprovalStatus(adminUserId);
  return status === "APPROVED";
}

/**
 * Asserts the tutor is APPROVED.
 * Throws TutorNotApprovedError if WAITLISTED (or row missing).
 *
 * MUST be called on every external-cost chokepoint, after ownership assertion.
 *
 * @param adminUserId - AdminUser.id of the tutor initiating the cost
 */
export async function assertTutorApproved(
  adminUserId: string,
  options?: { surface?: string }
): Promise<void> {
  const status = await getTutorApprovalStatus(adminUserId);

  if (status === "APPROVED") return;

  const effectiveStatus: TutorApprovalStatus = status ?? "WAITLISTED";

  console.log(
    `[tap] tap=${adminUserId} action=assert_rejected status=${effectiveStatus}`
  );

  const { logProductEvent } = await import("@/lib/observability/product-events");
  await logProductEvent({
    kind: "TUTOR_WAITLIST_BLOCKED",
    adminUserId,
    metadata: { surface: options?.surface ?? "tutor_approval_gate" },
  });

  throw new TutorNotApprovedError(adminUserId, effectiveStatus);
}

// ---------------------------------------------------------------------------
// Operator action: approve a tutor
// ---------------------------------------------------------------------------

/**
 * Approve a WAITLISTED tutor.
 * Sets approvalStatus=APPROVED, approvedAt=now(), approvedByAdminId=operatorId.
 *
 * Caller MUST run requireOperator() before calling this.
 *
 * @param adminUserId  - AdminUser.id of the tutor to approve
 * @param operatorId   - AdminUser.id of the operator performing the approval
 */
export async function approveTutor(
  adminUserId: string,
  operatorId: string
): Promise<void> {
  await db.adminUser.update({
    where: { id: adminUserId },
    data: {
      approvalStatus: "APPROVED",
      approvedAt: new Date(),
      approvedByAdminId: operatorId,
    },
  });

  console.log(
    `[tap] tap=${adminUserId} action=approved byOperator=${operatorId}`
  );

  const { logProductEvent } = await import("@/lib/observability/product-events");
  await logProductEvent({
    kind: "TUTOR_APPROVED",
    adminUserId,
    metadata: { operatorId },
  });
}

// ---------------------------------------------------------------------------
// Operator query: list WAITLISTED tutors
// ---------------------------------------------------------------------------

export type WaitlistedTutor = {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: Date;
};

export async function listWaitlistedTutors(): Promise<WaitlistedTutor[]> {
  return db.adminUser.findMany({
    where: { approvalStatus: "WAITLISTED", isTestAccount: false },
    select: {
      id: true,
      email: true,
      displayName: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });
}
