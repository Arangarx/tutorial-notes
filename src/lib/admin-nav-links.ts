/**
 * Shared admin nav-link builder.
 *
 * AdminNav (mobile/top) and AdminSidebarNav historically drifted:
 * - AdminNav always includes Dashboard + a public "/feedback" ("Send feedback") link.
 * - AdminSidebarNav gates Dashboard on sessionMode === "real-admin-home" and omits Send feedback.
 *
 * Those differences are intentional per-consumer behavior — express them via opts;
 * do not harmonize.
 */

import type { AdminSessionMode } from "@/lib/admin-routing";

export type AdminNavLink = {
  href: string;
  label: string;
};

export type BuildAdminNavLinksOpts = {
  sessionMode?: AdminSessionMode;
  showOperatorLinks?: boolean;
  showCostDashboard?: boolean;
  showDevTools?: boolean;
  /**
   * AdminNav: `"always"`.
   * AdminSidebarNav: `"when-real-admin-home"`.
   */
  dashboard: "always" | "when-real-admin-home";
  /**
   * AdminNav: true → insert { href: "/feedback", label: "Send feedback" } before Settings.
   * AdminSidebarNav: false / omitted.
   */
  includeSendFeedback?: boolean;
};

const TUTOR_LINKS: AdminNavLink[] = [
  { href: "/admin/students", label: "Students" },
  { href: "/admin/schedule", label: "Schedule" },
  { href: "/admin/outbox", label: "Outbox" },
];

/**
 * Build the admin nav link list for a given consumer's option set.
 * Output order and conditional inclusion must match the pre-dedupe consumers exactly.
 */
export function buildAdminNavLinks(opts: BuildAdminNavLinksOpts): AdminNavLink[] {
  const sessionMode = opts.sessionMode;
  const includeDashboard =
    opts.dashboard === "always" ||
    (opts.dashboard === "when-real-admin-home" && sessionMode === "real-admin-home");

  return [
    ...(includeDashboard ? [{ href: "/admin", label: "Dashboard" }] : []),
    ...(sessionMode === "tutor-experience" ? TUTOR_LINKS : []),
    ...(opts.showOperatorLinks
      ? [
          { href: "/admin/feedback", label: "Feedback inbox" },
          { href: "/admin/tutor-approvals", label: "Tutor approvals" },
          { href: "/admin/design-system", label: "Design system" },
        ]
      : []),
    ...(opts.showCostDashboard ? [{ href: "/admin/cost", label: "Cost" }] : []),
    ...(opts.showCostDashboard ? [{ href: "/admin/erasure", label: "Erasure" }] : []),
    ...(opts.includeSendFeedback
      ? [{ href: "/feedback", label: "Send feedback" }]
      : []),
    { href: "/admin/settings", label: "Settings" },
    ...(opts.showDevTools ? [{ href: "/admin/dev-tools", label: "Dev tools" }] : []),
  ];
}

/** Option set AdminNav passes today (preserves always-Dashboard + Send feedback). */
export function adminNavLinkOpts(
  props: Omit<BuildAdminNavLinksOpts, "dashboard" | "includeSendFeedback">
): BuildAdminNavLinksOpts {
  return {
    ...props,
    dashboard: "always",
    includeSendFeedback: true,
  };
}

/** Option set AdminSidebarNav passes today (gates Dashboard; no Send feedback). */
export function adminSidebarNavLinkOpts(
  props: Omit<BuildAdminNavLinksOpts, "dashboard" | "includeSendFeedback">
): BuildAdminNavLinksOpts {
  return {
    ...props,
    dashboard: "when-real-admin-home",
    includeSendFeedback: false,
  };
}
