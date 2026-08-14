import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { CalendarIntegrationsPanel } from "@/components/admin/schedule/CalendarIntegrationsPanel";
import { env } from "@/lib/env";
import {
  buildCalendarPanelConnections,
  getGoogleCalendarConnectionForTutor,
} from "@/lib/calendar-oauth";
import { getStudentScope } from "@/lib/student-scope";

export const dynamic = "force-dynamic";

type IntegrationsSettingsPageProps = {
  searchParams: Promise<{ from?: string; connected?: string; error?: string }>;
};

export default async function IntegrationsSettingsPage({
  searchParams,
}: IntegrationsSettingsPageProps) {
  const scope = await getStudentScope();
  if (scope.kind === "none") redirect("/login");

  const adminUserId = scope.kind === "admin" ? scope.adminId : null;
  const googleConnection = await getGoogleCalendarConnectionForTutor(adminUserId);
  const connections = buildCalendarPanelConnections(
    googleConnection ? { email: googleConnection.email } : null
  );
  const googleOAuthAvailable = !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

  const { from, connected, error } = await searchParams;
  const fromSchedule = from === "schedule";
  const backHref = fromSchedule ? "/admin/schedule" : "/admin/settings";
  const backLabel = fromSchedule ? "← Schedule" : "← Settings";

  return (
    <PageShell realm="admin"
      title="Calendar integrations"
      description="Connect Google Calendar to prepare for upcoming scheduling. Calendar sync is not live yet — connecting saves your account for the next release."
      eyebrow={
        <Link
          href={backHref}
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          {backLabel}
        </Link>
      }
    >
      <CalendarIntegrationsPanel
        connections={connections}
        googleOAuthAvailable={googleOAuthAvailable}
        googleCalendarCount={googleConnection?.calendarCount ?? null}
        connectError={error}
        connectSuccess={connected}
        compact={false}
        showSettingsLink={false}
      />
    </PageShell>
  );
}
