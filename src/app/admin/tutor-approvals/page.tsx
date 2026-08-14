import { requireOperator } from "@/lib/operator";
import {
  listApprovedTutors,
  listWaitlistedTutors,
} from "@/lib/tutor-approval-scope";
import { PageShell } from "@/components/PageShell";
import { SectionCard } from "@/components/SectionCard";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import type { ReactNode } from "react";
import { TutorWaitlistActions } from "./TutorWaitlistActions";
import { RevokeTutorAccessButton } from "./RevokeTutorAccessButton";

export const dynamic = "force-dynamic";

function TutorApprovalListItem({
  tutor,
  actions,
}: {
  tutor: {
    id: string;
    email: string;
    displayName: string | null;
    createdAt: Date;
  };
  actions: ReactNode;
}) {
  return (
    <li
      className="flex items-start justify-between gap-3 px-4 py-3"
      data-testid={`tutor-approval-row-${tutor.id}`}
    >
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-semibold text-foreground">{tutor.email}</p>
        {tutor.displayName ? (
          <p className="text-sm text-muted-foreground">{tutor.displayName}</p>
        ) : null}
        <time
          dateTime={tutor.createdAt.toISOString()}
          className="text-xs font-mono text-muted-foreground"
        >
          Signed up {tutor.createdAt.toLocaleDateString()}
        </time>
      </div>
      {actions}
    </li>
  );
}

export default async function TutorApprovalsPage() {
  await requireOperator();
  const [waitlisted, approved] = await Promise.all([
    listWaitlistedTutors(),
    listApprovedTutors(),
  ]);

  return (
    <PageShell
      realm="admin"
      title="Tutor approvals"
      description="Review new tutor signups. WAITLISTED tutors cannot incur external cost until approved."
      actions={
        <Button asChild variant="outline" size="sm">
          <Link href="/admin">Dashboard</Link>
        </Button>
      }
    >
      <SectionCard
        realm="admin"
        title="Pending approval"
        contentClassName="p-0"
        data-testid="tutor-approvals-pending"
      >
        {waitlisted.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            No tutors awaiting approval.
          </p>
        ) : (
          <ul className="divide-y divide-border" role="list">
            {waitlisted.map((tutor) => (
              <TutorApprovalListItem
                key={tutor.id}
                tutor={tutor}
                actions={
                  <TutorWaitlistActions
                    adminUserId={tutor.id}
                    tutorEmail={tutor.email}
                  />
                }
              />
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        realm="admin"
        title="Approved tutors"
        contentClassName="p-0"
        data-testid="tutor-approvals-approved"
      >
        {approved.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            No approved tutors to manage.
          </p>
        ) : (
          <ul className="divide-y divide-border" role="list">
            {approved.map((tutor) => (
              <TutorApprovalListItem
                key={tutor.id}
                tutor={tutor}
                actions={
                  <RevokeTutorAccessButton
                    adminUserId={tutor.id}
                    tutorEmail={tutor.email}
                  />
                }
              />
            ))}
          </ul>
        )}
      </SectionCard>
    </PageShell>
  );
}
