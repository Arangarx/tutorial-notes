"use client";

import Link from "next/link";
import { AuthMortensenNotice } from "@/components/auth/AuthMortensenNotice";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SectionCard } from "@/components/SectionCard";
import { disconnectGoogleCalendar } from "@/app/admin/settings/integrations/actions";
import type { MockCalendarConnection } from "@/lib/schedule/mock-data";
import { CalendarIcon, CheckIcon, PlusIcon } from "lucide-react";

type CalendarIntegrationsPanelProps = {
  connections: MockCalendarConnection[];
  googleOAuthAvailable: boolean;
  googleCalendarCount?: number | null;
  connectError?: string;
  connectSuccess?: string;
  /** When true, show compact summary suitable for schedule page sidebar. */
  compact?: boolean;
  showSettingsLink?: boolean;
  /** Override Manage link target (e.g. include `?from=schedule` for back-nav). */
  settingsHref?: string;
};

function ProviderIcon({ provider }: { provider: MockCalendarConnection["provider"] }) {
  if (provider === "google") {
    return (
      <span
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-border bg-card text-sm font-semibold text-foreground"
        aria-hidden
      >
        G
      </span>
    );
  }
  if (provider === "apple") {
    return (
      <span
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-border bg-card text-lg text-foreground"
        aria-hidden
      >
        
      </span>
    );
  }
  return (
    <span
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-dashed border-border bg-muted/40 text-muted-foreground"
      aria-hidden
    >
      <PlusIcon className="size-4" />
    </span>
  );
}

export function CalendarIntegrationsPanel({
  connections,
  googleOAuthAvailable,
  googleCalendarCount = null,
  connectError,
  connectSuccess,
  compact = false,
  showSettingsLink = true,
  settingsHref = "/admin/settings/integrations",
}: CalendarIntegrationsPanelProps) {
  const connectedCount = connections.filter((c) => c.connected).length;
  const googleConnected = connections.some((c) => c.provider === "google" && c.connected);

  return (
    <SectionCard realm="admin"
      title={compact ? "Connected calendars" : "Calendar integrations"}
      description={
        compact
          ? "Connect Google Calendar so we can mirror sessions when scheduling ships."
          : "Connect Google Calendar to prepare for upcoming scheduling. Calendar sync is not live yet — connecting saves your account for the next release."
      }
      actions={
        showSettingsLink && compact ? (
          <Button asChild variant="ghost" size="sm" className="min-h-9">
            <Link href={settingsHref}>Manage</Link>
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-4">
        {!compact && googleConnected ? (
          <p className="rounded-[10px] border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground" role="status">
            Calendar sync is not live yet — connection saved for upcoming scheduling.
            {typeof googleCalendarCount === "number" ? (
              <>
                {" "}
                <span className="text-foreground">
                  {googleCalendarCount} calendar{googleCalendarCount === 1 ? "" : "s"} found on this
                  Google account.
                </span>
              </>
            ) : null}
          </p>
        ) : null}

        <ul className="space-y-3" role="list">
          {connections.map((connection) => (
            <li
              key={connection.provider}
              className="flex items-center justify-between gap-3 rounded-[10px] border border-border bg-card px-3 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <ProviderIcon provider={connection.provider} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{connection.label}</p>
                  {connection.connected && connection.accountLabel ? (
                    <p className="truncate text-xs text-muted-foreground">
                      {connection.accountLabel}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Not connected</p>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {connection.connected ? (
                  <>
                    <Badge
                      variant="outline"
                      className="gap-1 border-success/30 bg-success/10 font-normal text-success"
                    >
                      <CheckIcon className="size-3" aria-hidden />
                      Connected
                    </Badge>
                    {!compact && connection.provider === "google" ? (
                      <form action={disconnectGoogleCalendar}>
                        <Button type="submit" variant="ghost" size="sm" className="min-h-9">
                          Disconnect
                        </Button>
                      </form>
                    ) : null}
                  </>
                ) : connection.provider === "other" ? (
                  <Button type="button" variant="outline" size="sm" className="min-h-9" disabled>
                    Coming soon
                  </Button>
                ) : connection.provider === "google" ? (
                  googleOAuthAvailable ? (
                    <div className="flex flex-col items-end gap-2">
                      {!compact ? (
                        <AuthMortensenNotice
                          variant="connect"
                          className="max-w-xs text-xs text-muted-foreground leading-relaxed"
                        />
                      ) : null}
                      <Button variant="default" size="sm" className="min-h-9" asChild>
                        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                        <a href="/api/auth/calendar/connect">
                          <CalendarIcon aria-hidden />
                          Connect
                        </a>
                      </Button>
                    </div>
                  ) : (
                    <Button type="button" variant="outline" size="sm" className="min-h-9" disabled>
                      OAuth not configured
                    </Button>
                  )
                ) : (
                  <Button type="button" variant="outline" size="sm" className="min-h-9" disabled>
                    Coming soon
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>

        {!compact ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {connectedCount === 0
                ? "No calendars connected yet — scheduling in Mynk works without an external calendar."
                : `${connectedCount} calendar${connectedCount === 1 ? "" : "s"} connected. Sync is not live yet.`}
            </p>
            {connectSuccess === "google_calendar" ? (
              <p className="text-sm text-success" role="status">
                Google Calendar connected. Sync is not live yet — your connection is saved for upcoming
                scheduling.
              </p>
            ) : null}
            {connectError === "google_oauth_not_configured" ? (
              <p className="text-sm text-warning" role="alert">
                Google OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to the
                server environment.
              </p>
            ) : null}
            {connectError === "calendar_denied" ? (
              <p className="text-sm text-destructive" role="alert">
                You declined access. You can try connecting again when ready.
              </p>
            ) : null}
            {connectError === "no_refresh_token" ? (
              <p className="text-sm text-destructive" role="alert">
                Google didn&apos;t return a refresh token. Try disconnecting and connecting again.
              </p>
            ) : null}
            {connectError === "db_not_ready" ? (
              <p className="text-sm text-warning" role="alert">
                Run{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">npx prisma generate</code>{" "}
                and{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">npx prisma db push</code>
                , then try again.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}
