import type { ReactNode } from "react";
import Link from "next/link";
import {
  ADMIN_TILE_LINK_HOVER_CLASS,
  ADMIN_TILE_SHELL_CLASS,
} from "@/components/admin/admin-tile-shell";
import { cn } from "@/lib/utils";

export type QuickLinkCardProps = {
  href: string;
  eyebrow: string;
  title: string;
  /** Shown inline after the title (e.g. pending count). */
  titleSuffix?: ReactNode;
  /** Brand emphasis for actionable alerts (e.g. pending tutor approvals). */
  emphasized?: boolean;
};

export function QuickLinkCard({
  href,
  eyebrow,
  title,
  titleSuffix,
  emphasized = false,
}: QuickLinkCardProps) {
  return (
    <Link
      href={href}
      className={cn(
        emphasized
          ? "rounded-[10px] bg-brand px-4 py-4 shadow-sm transition-opacity hover:opacity-95"
          : cn(ADMIN_TILE_SHELL_CLASS, ADMIN_TILE_LINK_HOVER_CLASS)
      )}
    >
      <p
        className={cn(
          "label-mono text-[10px]",
          emphasized ? "text-[color:var(--brand-eyebrow)]" : "text-accent-text"
        )}
      >
        {eyebrow}
      </p>
      <p
        className={cn(
          "mt-1 text-sm font-semibold",
          emphasized ? "text-[color:var(--brand-on)]" : "text-foreground"
        )}
      >
        {title}
        {titleSuffix ? (
          <span className="ml-1.5 font-mono text-xs font-normal opacity-90">{titleSuffix}</span>
        ) : null}
      </p>
    </Link>
  );
}
