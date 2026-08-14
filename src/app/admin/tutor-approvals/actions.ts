"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/auth-options";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isOperatorEmail } from "@/lib/operator";
import {
  approveTutor,
  rejectTutor,
  revokeTutorApproval,
} from "@/lib/tutor-approval-scope";
import { db } from "@/lib/db";

export type TutorApprovalActionResult =
  | { ok: true }
  | { ok: false; error: string };

async function requireOperatorSession(): Promise<
  { ok: true; operatorId: string } | { ok: false; error: string }
> {
  const session = await getServerSession(authOptions);

  if (!isOperatorEmail(session?.user?.email)) {
    notFound();
  }

  const operatorId = session!.user!.id;
  if (!operatorId) {
    return { ok: false, error: "Operator session has no user id." };
  }

  return { ok: true, operatorId };
}

/**
 * Approve a WAITLISTED tutor. Operator-only.
 * Logs [tap] on success.
 */
export async function approveTutorAction(
  adminUserId: string
): Promise<TutorApprovalActionResult> {
  const operator = await requireOperatorSession();
  if (!operator.ok) return operator;

  const target = await db.adminUser.findUnique({
    where: { id: adminUserId },
    select: { id: true, approvalStatus: true, email: true },
  });

  if (!target) {
    return { ok: false, error: "Tutor account not found." };
  }

  if (target.approvalStatus === "APPROVED") {
    return { ok: false, error: "Tutor is already approved." };
  }

  await approveTutor(adminUserId, operator.operatorId);

  revalidatePath("/admin/tutor-approvals");

  return { ok: true };
}

/**
 * Reject a WAITLISTED tutor. Operator-only.
 */
export async function rejectTutorAction(
  adminUserId: string
): Promise<TutorApprovalActionResult> {
  const operator = await requireOperatorSession();
  if (!operator.ok) return operator;

  const target = await db.adminUser.findUnique({
    where: { id: adminUserId },
    select: { id: true, approvalStatus: true },
  });

  if (!target) {
    return { ok: false, error: "Tutor account not found." };
  }

  if (target.approvalStatus === "APPROVED") {
    return { ok: false, error: "Approved tutors cannot be rejected. Revoke access first." };
  }

  if (target.approvalStatus === "REJECTED") {
    return { ok: true };
  }

  await rejectTutor(adminUserId, operator.operatorId);

  revalidatePath("/admin/tutor-approvals");

  return { ok: true };
}

/**
 * Revoke an APPROVED tutor's access (returns them to WAITLISTED). Operator-only.
 */
export async function revokeTutorApprovalAction(
  adminUserId: string
): Promise<TutorApprovalActionResult> {
  const operator = await requireOperatorSession();
  if (!operator.ok) return operator;

  const target = await db.adminUser.findUnique({
    where: { id: adminUserId },
    select: { id: true, approvalStatus: true },
  });

  if (!target) {
    return { ok: false, error: "Tutor account not found." };
  }

  if (target.approvalStatus !== "APPROVED") {
    return { ok: false, error: "Only approved tutors can have access revoked." };
  }

  await revokeTutorApproval(adminUserId, operator.operatorId);

  revalidatePath("/admin/tutor-approvals");

  return { ok: true };
}
