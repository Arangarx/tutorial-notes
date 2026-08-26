import { Prisma, type ProductEventKind, type TutorApprovalStatus } from "@prisma/client";
import { db } from "@/lib/db";

export type TutorSignupMetadata = {
  method: "credentials" | "google";
};

export type TutorLoginMetadata = {
  method: "credentials" | "google";
  approvalStatus: TutorApprovalStatus;
};

export type TutorApprovedMetadata = {
  operatorId: string;
};

export type TutorWaitlistBlockedMetadata = {
  surface: string;
};

export type SessionCreatedMetadata = {
  claimed: boolean;
};

export type SessionStartedMetadata = {
  mode: "LIVE" | "IN_PERSON";
  noop: boolean;
};

export type SessionEndedMetadata = {
  priorPhase: string;
  path: "normal" | "stale";
};

export type ProductEventMetadata =
  | TutorSignupMetadata
  | TutorLoginMetadata
  | TutorApprovedMetadata
  | TutorWaitlistBlockedMetadata
  | SessionCreatedMetadata
  | SessionStartedMetadata
  | SessionEndedMetadata;

export interface LogProductEventInput {
  kind: ProductEventKind;
  adminUserId?: string | null;
  studentId?: string | null;
  whiteboardSessionId?: string | null;
  metadata?: ProductEventMetadata;
}

async function shouldSkipProductEvent(adminUserId: string | null | undefined): Promise<boolean> {
  if (!adminUserId || adminUserId === "admin") return true;

  const row = await db.adminUser.findUnique({
    where: { id: adminUserId },
    select: { isTestAccount: true, isTestFixture: true },
  });

  if (!row) return false;
  return row.isTestAccount || row.isTestFixture;
}

/**
 * Log a first-party product funnel event. Best-effort; failures are caught + logged
 * but NEVER throw, so the calling path is not affected by observability issues.
 *
 * Skips env-only admin (`adminUserId === "admin"`), missing adminUserId, and
 * test accounts/fixtures. Never logs email, displayName, IP, or UA — UUIDs only.
 *
 * Success: `[product-events] pev=<uuid> kind=... admin=... wbsid=...`
 * Failure: `[product-events] pev=FAIL kind=... error=...`
 */
export async function logProductEvent(input: LogProductEventInput): Promise<void> {
  try {
    if (await shouldSkipProductEvent(input.adminUserId)) {
      return;
    }

    const created = await db.productEvent.create({
      data: {
        kind: input.kind,
        adminUserId: input.adminUserId,
        studentId: input.studentId,
        whiteboardSessionId: input.whiteboardSessionId,
        metadata:
          input.metadata === undefined
            ? undefined
            : (input.metadata as Prisma.InputJsonValue),
      },
    });

    console.log(
      `[product-events] pev=${created.id} kind=${input.kind} admin=${input.adminUserId ?? "n/a"} wbsid=${input.whiteboardSessionId ?? "n/a"}`
    );
  } catch (err) {
    console.error(
      `[product-events] pev=FAIL kind=${input.kind} error=${err instanceof Error ? err.message : String(err)}`
    );
  }
}
