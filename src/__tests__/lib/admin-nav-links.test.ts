import {
  adminNavLinkOpts,
  adminSidebarNavLinkOpts,
  buildAdminNavLinks,
  type AdminNavLink,
  type BuildAdminNavLinksOpts,
} from "@/lib/admin-nav-links";
import type { AdminSessionMode } from "@/lib/admin-routing";

/**
 * Locks pre-dedupe nav output per consumer.
 *
 * Spec source: the two drifted local `buildNavLinks` copies that lived in
 * `AdminNav.tsx` and `AdminSidebarNav.tsx` before Wave A consolidation.
 * Asserts exact href + label + order under every input that affects the list.
 * `isImpersonating` never affected either builder — omitted from opts on purpose.
 */

type FlagSet = {
  showOperatorLinks: boolean;
  showCostDashboard: boolean;
  showDevTools: boolean;
};

const SESSION_MODES: AdminSessionMode[] = [
  "tutor-experience",
  "real-admin-home",
  "unauthenticated",
];

const FLAG_COMBOS: Array<{ name: string; flags: FlagSet }> = [
  {
    name: "all flags off",
    flags: { showOperatorLinks: false, showCostDashboard: false, showDevTools: false },
  },
  {
    name: "operator only",
    flags: { showOperatorLinks: true, showCostDashboard: false, showDevTools: false },
  },
  {
    name: "cost only",
    flags: { showOperatorLinks: false, showCostDashboard: true, showDevTools: false },
  },
  {
    name: "devtools only",
    flags: { showOperatorLinks: false, showCostDashboard: false, showDevTools: true },
  },
  {
    name: "operator + cost",
    flags: { showOperatorLinks: true, showCostDashboard: true, showDevTools: false },
  },
  {
    name: "operator + cost + devtools",
    flags: { showOperatorLinks: true, showCostDashboard: true, showDevTools: true },
  },
  {
    name: "cost + devtools",
    flags: { showOperatorLinks: false, showCostDashboard: true, showDevTools: true },
  },
];

/** Independent oracle mirroring pre-dedupe AdminNav.buildNavLinks. */
function oracleAdminNav(
  sessionMode: AdminSessionMode | undefined,
  flags: FlagSet
): AdminNavLink[] {
  const tutorLinks = [
    { href: "/admin/students", label: "Students" },
    { href: "/admin/schedule", label: "Schedule" },
    { href: "/admin/outbox", label: "Outbox" },
  ];
  return [
    { href: "/admin", label: "Dashboard" },
    ...(sessionMode === "tutor-experience" ? tutorLinks : []),
    ...(flags.showOperatorLinks
      ? [
          { href: "/admin/feedback", label: "Feedback inbox" },
          { href: "/admin/tutor-approvals", label: "Tutor approvals" },
          { href: "/admin/design-system", label: "Design system" },
        ]
      : []),
    ...(flags.showCostDashboard ? [{ href: "/admin/cost", label: "Cost" }] : []),
    ...(flags.showCostDashboard ? [{ href: "/admin/erasure", label: "Erasure" }] : []),
    { href: "/feedback", label: "Send feedback" },
    { href: "/admin/settings", label: "Settings" },
    ...(flags.showDevTools ? [{ href: "/admin/dev-tools", label: "Dev tools" }] : []),
  ];
}

/** Independent oracle mirroring pre-dedupe AdminSidebarNav.buildNavLinks. */
function oracleSidebarNav(
  sessionMode: AdminSessionMode | undefined,
  flags: FlagSet
): AdminNavLink[] {
  const tutorLinks = [
    { href: "/admin/students", label: "Students" },
    { href: "/admin/schedule", label: "Schedule" },
    { href: "/admin/outbox", label: "Outbox" },
  ];
  return [
    ...(sessionMode === "real-admin-home"
      ? [{ href: "/admin", label: "Dashboard" }]
      : []),
    ...(sessionMode === "tutor-experience" ? tutorLinks : []),
    ...(flags.showOperatorLinks
      ? [
          { href: "/admin/feedback", label: "Feedback inbox" },
          { href: "/admin/tutor-approvals", label: "Tutor approvals" },
          { href: "/admin/design-system", label: "Design system" },
        ]
      : []),
    ...(flags.showCostDashboard ? [{ href: "/admin/cost", label: "Cost" }] : []),
    ...(flags.showCostDashboard ? [{ href: "/admin/erasure", label: "Erasure" }] : []),
    { href: "/admin/settings", label: "Settings" },
    ...(flags.showDevTools ? [{ href: "/admin/dev-tools", label: "Dev tools" }] : []),
  ];
}

describe("buildAdminNavLinks — AdminNav consumer (always Dashboard + Send feedback)", () => {
  for (const sessionMode of SESSION_MODES) {
    for (const { name, flags } of FLAG_COMBOS) {
      it(`sessionMode=${sessionMode}, ${name}`, () => {
        const opts = adminNavLinkOpts({ sessionMode, ...flags });
        expect(buildAdminNavLinks(opts)).toEqual(oracleAdminNav(sessionMode, flags));
      });
    }
  }

  it("defaults: undefined sessionMode still always includes Dashboard + Send feedback", () => {
    const opts = adminNavLinkOpts({});
    expect(buildAdminNavLinks(opts)).toEqual([
      { href: "/admin", label: "Dashboard" },
      { href: "/feedback", label: "Send feedback" },
      { href: "/admin/settings", label: "Settings" },
    ]);
  });
});

describe("buildAdminNavLinks — AdminSidebarNav consumer (gated Dashboard, no Send feedback)", () => {
  for (const sessionMode of SESSION_MODES) {
    for (const { name, flags } of FLAG_COMBOS) {
      it(`sessionMode=${sessionMode}, ${name}`, () => {
        const opts = adminSidebarNavLinkOpts({ sessionMode, ...flags });
        expect(buildAdminNavLinks(opts)).toEqual(oracleSidebarNav(sessionMode, flags));
      });
    }
  }

  it("defaults: undefined sessionMode → no Dashboard, no Send feedback, Settings only", () => {
    const opts = adminSidebarNavLinkOpts({});
    expect(buildAdminNavLinks(opts)).toEqual([
      { href: "/admin/settings", label: "Settings" },
    ]);
  });
});

describe("buildAdminNavLinks — drift locks (consumers must not converge)", () => {
  const sharedFlags: FlagSet = {
    showOperatorLinks: true,
    showCostDashboard: true,
    showDevTools: true,
  };

  it("AdminNav always has Dashboard even when sessionMode is tutor-experience", () => {
    const links = buildAdminNavLinks(
      adminNavLinkOpts({ sessionMode: "tutor-experience", ...sharedFlags })
    );
    expect(links[0]).toEqual({ href: "/admin", label: "Dashboard" });
    expect(links.some((l) => l.href === "/feedback" && l.label === "Send feedback")).toBe(
      true
    );
  });

  it("AdminSidebarNav omits Dashboard when sessionMode is tutor-experience", () => {
    const links = buildAdminNavLinks(
      adminSidebarNavLinkOpts({ sessionMode: "tutor-experience", ...sharedFlags })
    );
    expect(links.find((l) => l.href === "/admin" && l.label === "Dashboard")).toBeUndefined();
    expect(links.find((l) => l.href === "/feedback")).toBeUndefined();
    expect(links[0]).toEqual({ href: "/admin/students", label: "Students" });
  });

  it("AdminSidebarNav includes Dashboard only for real-admin-home", () => {
    const home = buildAdminNavLinks(
      adminSidebarNavLinkOpts({ sessionMode: "real-admin-home" })
    );
    const tutor = buildAdminNavLinks(
      adminSidebarNavLinkOpts({ sessionMode: "tutor-experience" })
    );
    const unauth = buildAdminNavLinks(
      adminSidebarNavLinkOpts({ sessionMode: "unauthenticated" })
    );
    expect(home[0]).toEqual({ href: "/admin", label: "Dashboard" });
    expect(tutor.find((l) => l.label === "Dashboard")).toBeUndefined();
    expect(unauth.find((l) => l.label === "Dashboard")).toBeUndefined();
  });

  it("full operator tutor-experience lists differ only by Dashboard + Send feedback placement", () => {
    const top = buildAdminNavLinks(
      adminNavLinkOpts({ sessionMode: "tutor-experience", ...sharedFlags })
    );
    const side = buildAdminNavLinks(
      adminSidebarNavLinkOpts({ sessionMode: "tutor-experience", ...sharedFlags })
    );
    expect(top).toEqual([
      { href: "/admin", label: "Dashboard" },
      { href: "/admin/students", label: "Students" },
      { href: "/admin/schedule", label: "Schedule" },
      { href: "/admin/outbox", label: "Outbox" },
      { href: "/admin/feedback", label: "Feedback inbox" },
      { href: "/admin/tutor-approvals", label: "Tutor approvals" },
      { href: "/admin/design-system", label: "Design system" },
      { href: "/admin/cost", label: "Cost" },
      { href: "/admin/erasure", label: "Erasure" },
      { href: "/feedback", label: "Send feedback" },
      { href: "/admin/settings", label: "Settings" },
      { href: "/admin/dev-tools", label: "Dev tools" },
    ]);
    expect(side).toEqual([
      { href: "/admin/students", label: "Students" },
      { href: "/admin/schedule", label: "Schedule" },
      { href: "/admin/outbox", label: "Outbox" },
      { href: "/admin/feedback", label: "Feedback inbox" },
      { href: "/admin/tutor-approvals", label: "Tutor approvals" },
      { href: "/admin/design-system", label: "Design system" },
      { href: "/admin/cost", label: "Cost" },
      { href: "/admin/erasure", label: "Erasure" },
      { href: "/admin/settings", label: "Settings" },
      { href: "/admin/dev-tools", label: "Dev tools" },
    ]);
  });
});

describe("consumer option helpers", () => {
  it("adminNavLinkOpts forces always-dashboard + send-feedback", () => {
    const opts: BuildAdminNavLinksOpts = adminNavLinkOpts({
      sessionMode: "tutor-experience",
      showOperatorLinks: true,
    });
    expect(opts.dashboard).toBe("always");
    expect(opts.includeSendFeedback).toBe(true);
  });

  it("adminSidebarNavLinkOpts forces gated-dashboard + no send-feedback", () => {
    const opts: BuildAdminNavLinksOpts = adminSidebarNavLinkOpts({
      sessionMode: "real-admin-home",
      showCostDashboard: true,
    });
    expect(opts.dashboard).toBe("when-real-admin-home");
    expect(opts.includeSendFeedback).toBe(false);
  });
});
