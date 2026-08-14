"use client";

import { useMemo, useState, type ComponentProps } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Calendar, CalendarDayButton } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SectionCard } from "@/components/SectionCard";
import { StudentAvatar } from "@/components/admin/StudentAvatar";
import { CalendarIntegrationsPanel } from "@/components/admin/schedule/CalendarIntegrationsPanel";
import { CreateSessionDialog } from "@/components/admin/schedule/CreateSessionDialog";
import { SessionSyncBadge } from "@/components/admin/schedule/SessionSyncBadge";
import {
  datesWithSessions,
  localDateToInputValue,
  parseSessionDate,
  sessionsOnDate,
  todayLocalDate,
  type CalendarConnectionView,
  type ScheduledSessionView,
  type ScheduleStudentOption,
} from "@/lib/schedule/mock-data";
import { SCHEDULE_INTEGRATIONS_SETTINGS_HREF } from "@/lib/schedule/navigation";
import { cn } from "@/lib/utils";
import { CalendarDaysIcon, ListIcon, PlayIcon, Settings2Icon } from "lucide-react";

function ScheduleDayButton({
  modifiers,
  children,
  className,
  ...props
}: ComponentProps<typeof CalendarDayButton>) {
  return (
    <CalendarDayButton
      modifiers={modifiers}
      className={cn(
        modifiers.today &&
          "bg-accent-soft font-semibold text-accent-text ring-2 ring-accent-text/45 ring-inset",
        className
      )}
      {...props}
    >
      <span className="inline-flex flex-col items-center gap-0.5 leading-none">
        <span>{children}</span>
        {modifiers.hasSession ? (
          <span
            className="size-2.5 shrink-0 rounded-full bg-[color:var(--calendar-event-dot)] shadow-[0_0_0_1px_color-mix(in_srgb,var(--calendar-event-dot)_55%,transparent)]"
            aria-hidden
            data-testid="schedule-day-dot"
          />
        ) : null}
      </span>
    </CalendarDayButton>
  );
}

type SessionItemProps = {
  session: ScheduledSessionView;
  studentOptions: ScheduleStudentOption[];
  googleConnected: boolean;
  onSaved: () => void;
};

function DayDetailSessionItem({
  session,
  studentOptions,
  googleConnected,
  onSaved,
}: SessionItemProps) {
  return (
    <li className="rounded-[10px] border border-border bg-card p-4" data-testid="schedule-session-item">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <StudentAvatar name={session.studentName} size="md" />
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-foreground">{session.studentName}</p>
              {session.showSyncBadge ? <SessionSyncBadge state={session.syncState} /> : null}
            </div>
            <p className="text-sm text-muted-foreground" data-testid="schedule-session-subject">
              {session.subject}
            </p>
            <p className="text-sm text-foreground">
              <span className="whitespace-nowrap">
                {session.startTime}&ndash;{session.endTime}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              {session.durationLabel}
              {session.location ? ` · ${session.location}` : ""}
            </p>
            {session.notes ? (
              <p className="text-xs leading-relaxed text-muted-foreground">{session.notes}</p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-stretch lg:flex-row lg:items-center">
          <CreateSessionDialog
            studentOptions={studentOptions}
            googleConnected={googleConnected}
            session={session}
            defaultDate={session.date}
            onSaved={onSaved}
            trigger={
              <Button type="button" variant="outline" size="sm" className="min-h-9" data-testid="schedule-edit-session">
                Edit
              </Button>
            }
          />
          <Button type="button" variant="accent" size="sm" className="min-h-9" asChild>
            <Link href={`/admin/students/${session.studentId}`} data-testid="schedule-start-session">
              <PlayIcon aria-hidden />
              Start session
            </Link>
          </Button>
        </div>
      </div>
    </li>
  );
}

function SessionRow({ session, studentOptions, googleConnected, onSaved }: SessionItemProps) {
  const sessionDate = parseSessionDate(session.date);
  const dateLabel = sessionDate.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return (
    <li
      className="flex flex-col gap-3 rounded-[10px] border border-border bg-card px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
      data-testid="schedule-agenda-row"
    >
      <div className="flex min-w-0 items-start gap-3">
        <StudentAvatar name={session.studentName} size="md" />
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-foreground">{session.studentName}</p>
            {session.showSyncBadge ? <SessionSyncBadge state={session.syncState} /> : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {session.subject} · {dateLabel} ·{" "}
            <span className="whitespace-nowrap">
              {session.startTime}&ndash;{session.endTime}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            {session.durationLabel}
            {session.location ? ` · ${session.location}` : ""}
          </p>
          {session.notes ? (
            <p className="text-xs text-muted-foreground">{session.notes}</p>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
        <CreateSessionDialog
          studentOptions={studentOptions}
          googleConnected={googleConnected}
          session={session}
          defaultDate={session.date}
          onSaved={onSaved}
          trigger={
            <Button type="button" variant="outline" size="sm" className="min-h-9">
              Edit
            </Button>
          }
        />
        <Button type="button" variant="accent" size="sm" className="min-h-9" asChild>
          <Link href={`/admin/students/${session.studentId}`}>
            <PlayIcon aria-hidden />
            Start session
          </Link>
        </Button>
      </div>
    </li>
  );
}

function DaySessionsPanel({
  selectedDate,
  sessions,
  studentOptions,
  googleConnected,
  onSaved,
}: {
  selectedDate: Date | undefined;
  sessions: ScheduledSessionView[];
  studentOptions: ScheduleStudentOption[];
  googleConnected: boolean;
  onSaved: () => void;
}) {
  if (!selectedDate) {
    return (
      <p className="text-sm text-muted-foreground">Select a day to see scheduled sessions.</p>
    );
  }

  const daySessions = sessionsOnDate(sessions, selectedDate);
  const label = selectedDate.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  if (daySessions.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-sm text-muted-foreground">No sessions on this day.</p>
        <CreateSessionDialog
          studentOptions={studentOptions}
          googleConnected={googleConnected}
          defaultDate={localDateToInputValue(selectedDate)}
          onSaved={onSaved}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <ul className="space-y-4" role="list">
        {daySessions.map((s) => (
          <DayDetailSessionItem
            key={s.id}
            session={s}
            studentOptions={studentOptions}
            googleConnected={googleConnected}
            onSaved={onSaved}
          />
        ))}
      </ul>
    </div>
  );
}

export function SchedulePageClient({
  sessions,
  studentOptions,
  calendarConnections,
  googleOAuthAvailable,
  googleCalendarCount = null,
  googleConnected,
}: {
  sessions: ScheduledSessionView[];
  studentOptions: ScheduleStudentOption[];
  calendarConnections: CalendarConnectionView[];
  googleOAuthAvailable: boolean;
  googleCalendarCount?: number | null;
  googleConnected: boolean;
}) {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(todayLocalDate());

  const sessionDates = useMemo(() => datesWithSessions(sessions), [sessions]);

  const upcomingSessions = useMemo(() => {
    return [...sessions].sort((a, b) => {
      const dateCmp = a.date.localeCompare(b.date);
      if (dateCmp !== 0) return dateCmp;
      return a.startTimeInput.localeCompare(b.startTimeInput);
    });
  }, [sessions]);

  const modifiers = useMemo(
    () => ({
      hasSession: sessionDates,
    }),
    [sessionDates]
  );

  const calendarClassNames = useMemo(
    () => ({
      today:
        "rounded-md bg-accent-soft font-semibold text-accent-text ring-2 ring-accent-text/40",
    }),
    []
  );

  function refreshSchedule() {
    router.refresh();
  }

  return (
    <div className="space-y-6" data-testid="schedule-page">
      <div className="flex flex-col gap-3 rounded-[10px] border border-border bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Sessions are saved in Mynk. Connect Google Calendar in settings when you want external
          sync — calendar write is not live yet.
        </p>
        <Button asChild variant="outline" size="sm" className="min-h-9 shrink-0">
          <Link href={SCHEDULE_INTEGRATIONS_SETTINGS_HREF}>
            <Settings2Icon aria-hidden />
            Calendar settings
          </Link>
        </Button>
      </div>

      <Tabs defaultValue="month" className="gap-6">
        <TabsList className="w-full justify-start sm:w-auto">
          <TabsTrigger value="month" className="gap-1.5">
            <CalendarDaysIcon className="size-4" aria-hidden />
            Month
          </TabsTrigger>
          <TabsTrigger value="agenda" className="gap-1.5" data-testid="schedule-agenda-tab">
            <ListIcon className="size-4" aria-hidden />
            Agenda
          </TabsTrigger>
        </TabsList>

        <TabsContent value="month" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.35fr)]">
            <SectionCard realm="admin"
              title="Calendar"
              description="Native Mynk scheduling — external calendars are optional."
              actions={
                <CreateSessionDialog
                  studentOptions={studentOptions}
                  googleConnected={googleConnected}
                  defaultDate={
                    selectedDate ? localDateToInputValue(selectedDate) : undefined
                  }
                  onSaved={refreshSchedule}
                />
              }
              contentClassName="flex justify-center pt-2"
            >
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                defaultMonth={selectedDate}
                modifiers={modifiers}
                classNames={calendarClassNames}
                components={{ DayButton: ScheduleDayButton }}
                className="rounded-[10px] border border-border bg-card p-2 [--cell-size:--spacing(9)]"
              />
            </SectionCard>

            <SectionCard realm="admin" title="Day detail" contentClassName="pt-2 min-w-0">
              <DaySessionsPanel
                selectedDate={selectedDate}
                sessions={sessions}
                studentOptions={studentOptions}
                googleConnected={googleConnected}
                onSaved={refreshSchedule}
              />
            </SectionCard>
          </div>
        </TabsContent>

        <TabsContent value="agenda" className="space-y-6">
          <SectionCard realm="admin"
            title="Upcoming sessions"
            description="Soft duration is planning metadata — start and end recording remain tutor-controlled."
            actions={
              <CreateSessionDialog
                studentOptions={studentOptions}
                googleConnected={googleConnected}
                onSaved={refreshSchedule}
              />
            }
          >
            {upcomingSessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No upcoming sessions scheduled.</p>
            ) : (
              <ul className="space-y-3" role="list">
                {upcomingSessions.map((session) => (
                  <SessionRow
                    key={session.id}
                    session={session}
                    studentOptions={studentOptions}
                    googleConnected={googleConnected}
                    onSaved={refreshSchedule}
                  />
                ))}
              </ul>
            )}
          </SectionCard>
        </TabsContent>
      </Tabs>

      <CalendarIntegrationsPanel
        connections={calendarConnections}
        googleOAuthAvailable={googleOAuthAvailable}
        googleCalendarCount={googleCalendarCount}
        compact
        showSettingsLink
        settingsHref={SCHEDULE_INTEGRATIONS_SETTINGS_HREF}
      />
    </div>
  );
}
