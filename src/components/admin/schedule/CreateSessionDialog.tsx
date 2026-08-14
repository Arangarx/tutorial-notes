"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  createScheduledSession,
  deleteScheduledSession,
  updateScheduledSession,
  type ScheduledSessionInput,
} from "@/app/admin/schedule/actions";
import { localDateToInputValue } from "@/lib/schedule/mock-data";
import type { ScheduleStudentOption, ScheduledSessionView } from "@/lib/schedule/types";
import { CalendarPlusIcon } from "lucide-react";

type CreateSessionDialogProps = {
  studentOptions: ScheduleStudentOption[];
  googleConnected: boolean;
  /** Pre-fill date when opened from calendar day click */
  defaultDate?: string;
  /** When set, dialog edits an existing session. */
  session?: ScheduledSessionView;
  trigger?: React.ReactNode;
  onSaved?: () => void;
};

function buildDefaultDate(defaultDate?: string): string {
  if (defaultDate) return defaultDate;
  return localDateToInputValue(new Date());
}

export function CreateSessionDialog({
  studentOptions,
  googleConnected,
  defaultDate,
  session,
  trigger,
  onSaved,
}: CreateSessionDialogProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const isEdit = !!session;

  const initialStudentId = session?.studentId ?? studentOptions[0]?.id ?? "";
  const initialDate = session?.date ?? buildDefaultDate(defaultDate);
  const initialDuration = String(session?.plannedDurationMinutes ?? 60);
  const initialStart = session?.startTimeInput ?? "16:00";
  const initialEnd = session?.endTimeInput ?? "17:00";
  const initialSubject = session?.subject ?? "";
  const initialNotes = session?.notes ?? "";

  const [studentId, setStudentId] = useState(initialStudentId);
  const [plannedDurationMinutes, setPlannedDurationMinutes] = useState(initialDuration);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    const input: ScheduledSessionInput = {
      studentId,
      subject: String(formData.get("subject") ?? ""),
      date: String(formData.get("date") ?? ""),
      plannedDurationMinutes: Number(plannedDurationMinutes),
      startTime: String(formData.get("startTime") ?? ""),
      endTime: String(formData.get("endTime") ?? ""),
      notes: String(formData.get("notes") ?? ""),
    };

    startTransition(async () => {
      try {
        if (isEdit && session) {
          await updateScheduledSession(session.id, input);
        } else {
          await createScheduledSession(input);
        }
        setOpen(false);
        router.refresh();
        onSaved?.();
      } catch {
        setError("Could not save session. Check the form and try again.");
      }
    });
  }

  function handleDelete() {
    if (!session) return;
    setError(null);
    startTransition(async () => {
      try {
        await deleteScheduledSession(session.id);
        setOpen(false);
        router.refresh();
        onSaved?.();
      } catch {
        setError("Could not cancel session. Try again.");
      }
    });
  }

  if (studentOptions.length === 0) {
    return (
      trigger ?? (
        <Button type="button" variant="accent" className="min-h-11" disabled>
          <CalendarPlusIcon aria-hidden />
          New session
        </Button>
      )
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button" variant="accent" className="min-h-11" data-testid="schedule-new-session">
            <CalendarPlusIcon aria-hidden />
            New session
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md rounded-[10px]">
        <DialogHeader>
          <DialogTitle className="heading text-xl font-normal">
            {isEdit ? "Edit session" : "Schedule session"}
          </DialogTitle>
          <DialogDescription>
            Session length is soft planning metadata; recording ends when you end the session.
            {googleConnected
              ? " Google Calendar is connected — events will show as not synced until calendar write ships."
              : " Sessions are saved in Mynk only until you connect Google Calendar."}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={handleSubmit}
          data-testid={isEdit ? "schedule-edit-form" : "schedule-create-form"}
        >
          <div className="space-y-2">
            <Label htmlFor="schedule-student">Student</Label>
            <Select value={studentId} onValueChange={setStudentId} required>
              <SelectTrigger id="schedule-student" className="min-h-11 w-full">
                <SelectValue placeholder="Select student" />
              </SelectTrigger>
              <SelectContent>
                {studentOptions.map((student) => (
                  <SelectItem key={student.id} value={student.id}>
                    {student.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="schedule-subject">Subject</Label>
            <Input
              id="schedule-subject"
              name="subject"
              placeholder="e.g. Algebra II"
              className="min-h-11"
              defaultValue={initialSubject}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="schedule-date">Date</Label>
              <Input
                id="schedule-date"
                name="date"
                type="date"
                defaultValue={initialDate}
                className="min-h-11"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="schedule-duration">Planned length</Label>
              <Select
                value={plannedDurationMinutes}
                onValueChange={setPlannedDurationMinutes}
              >
                <SelectTrigger id="schedule-duration" className="min-h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="45">~45 min (soft)</SelectItem>
                  <SelectItem value="60">~60 min (soft)</SelectItem>
                  <SelectItem value="90">~90 min (soft)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="schedule-start">Start time</Label>
              <Input
                id="schedule-start"
                name="startTime"
                type="time"
                defaultValue={initialStart}
                className="min-h-11"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="schedule-end">End time</Label>
              <Input
                id="schedule-end"
                name="endTime"
                type="time"
                defaultValue={initialEnd}
                className="min-h-11"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="schedule-notes">Notes (optional)</Label>
            <Textarea
              id="schedule-notes"
              name="notes"
              placeholder="Homework to review, topics to cover…"
              rows={3}
              defaultValue={initialNotes}
            />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <DialogFooter className="gap-2 sm:gap-0">
            {isEdit ? (
              <Button
                type="button"
                variant="outline"
                className="mr-auto text-destructive"
                onClick={handleDelete}
                disabled={pending}
                data-testid="schedule-cancel-session"
              >
                Cancel session
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Close
            </Button>
            <Button type="submit" disabled={pending} data-testid="schedule-save-session">
              {pending ? "Saving…" : isEdit ? "Save changes" : "Save session"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
