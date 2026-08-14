import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CalendarSyncState } from "@/lib/schedule/types";
import { CheckIcon, CloudOffIcon, Loader2Icon } from "lucide-react";

const syncConfig: Record<
  CalendarSyncState,
  { label: string; className: string; icon: ReactNode }
> = {
  synced: {
    label: "Synced",
    className: "border-success/30 bg-success/10 text-success",
    icon: <CheckIcon aria-hidden />,
  },
  pending: {
    label: "Sync pending",
    className: "border-warning/30 bg-warning/10 text-warning",
    icon: <Loader2Icon className="animate-spin" aria-hidden />,
  },
  "not-connected": {
    label: "Not synced",
    className: "border-border bg-muted/60 text-muted-foreground",
    icon: <CloudOffIcon aria-hidden />,
  },
};

type SessionSyncBadgeProps = {
  state: CalendarSyncState;
  className?: string;
};

export function SessionSyncBadge({ state, className }: SessionSyncBadgeProps) {
  const config = syncConfig[state];
  return (
    <Badge
      variant="outline"
      className={cn("gap-1 font-normal", config.className, className)}
    >
      {config.icon}
      {config.label}
    </Badge>
  );
}
