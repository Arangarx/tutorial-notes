import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth-options";
import {
  getAdminSessionMode,
  realAdminHomePath,
  tutorExperienceLandingPath,
} from "@/lib/admin-routing";
import { AdminTestAccountsPanel } from "./AdminTestAccountsPanel";
import { QuickLinkCard } from "@/components/admin/QuickLinkCard";
import { PageShell } from "@/components/PageShell";
import { SectionCard } from "@/components/SectionCard";
import { Button } from "@/components/ui/button";
import { listWaitlistedTutors } from "@/lib/tutor-approval-scope";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  const session = await getServerSession(authOptions);
  const mode = getAdminSessionMode(
    session?.user
      ? {
          sub: session.user.id,
          isImpersonating: session.user.isImpersonating,
          isTestAccount: session.user.isTestAccount,
          role: session.user.role,
        }
      : null
  );

  if (mode === "unauthenticated") redirect("/login");

  if (mode === "tutor-experience") {
    console.log(
      `[imp] route=${tutorExperienceLandingPath()} mode=tutor-experience from=${realAdminHomePath()}`
    );
    redirect(tutorExperienceLandingPath());
  }

  const email = session?.user?.email ?? "admin";
  console.log(`[imp] route=${realAdminHomePath()} mode=real-admin-home admin=${email}`);

  const pendingApprovals = await listWaitlistedTutors();
  const pendingApprovalCount = pendingApprovals.length;
  const hasPendingApprovals = pendingApprovalCount > 0;

  return (
    <PageShell realm="admin"
      title="Admin dashboard"
      eyebrow={
        <p className="label-mono m-0 text-accent-text">Operator console</p>
      }
      description={
        <>
          Signed in as <span className="font-medium text-foreground">{email}</span>. Open a test
          account to use the tutor workspace, or manage credentials in settings.
        </>
      }
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="min-h-11">
            <Link href="/admin/tutor-approvals">Tutor approvals</Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11">
            <Link href="/admin/settings">Settings</Link>
          </Button>
        </div>
      }
    >
      <div className="mb-6 rounded-2xl bg-accent-soft px-4 py-5 sm:px-5">
        <p className="label-mono mb-3 text-accent-text">Quick links</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <QuickLinkCard
            href="/admin/tutor-approvals"
            eyebrow="Operator"
            title="Tutor approvals"
            emphasized={hasPendingApprovals}
            titleSuffix={
              hasPendingApprovals ? `(${pendingApprovalCount} pending)` : undefined
            }
          />
          <QuickLinkCard href="/admin/feedback" eyebrow="Operator" title="Feedback inbox" />
          <QuickLinkCard href="/admin/cost" eyebrow="Operator" title="Cost dashboard" />
        </div>
      </div>

      <SectionCard realm="admin"
        title="Test accounts"
        description="Log in as a test tutor without signing out your admin session. Use Exit impersonation to return here."
        className="border-l-[3px] border-l-accent"
      >
        <AdminTestAccountsPanel />
      </SectionCard>
    </PageShell>
  );
}
