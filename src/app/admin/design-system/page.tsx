import Link from "next/link";

import { PageShell } from "@/components/PageShell";
import { SectionCard } from "@/components/SectionCard";
import { SubNav } from "@/components/SubNav";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { requireOperator } from "@/lib/operator";

import {
  DesignSystemDialogSample,
  DesignSystemSelectSample,
} from "./DesignSystemInteractivePrimitives";
import { GallerySpecimen } from "./GallerySpecimen";

export const dynamic = "force-dynamic";

/**
 * Platform maintainer gallery — site operator / platform only (`OPERATOR_EMAILS` ∪ `ADMIN_EMAIL`).
 * NOT future school/org admins; do not expand with org-scoped roles.
 */
export default async function AdminDesignSystemPage() {
  await requireOperator();

  return (
    <PageShell
      realm="admin"
      title="Design system"
      description={
        <>
          Organized specimens for eyeballing shared primitives and compositions. Use the theme
          toggle to check light and dark. <strong>Gallery PASS ≠ surface PASS</strong> — page-local
          CSS and live-only chrome can still diverge.
        </>
      }
      actions={<ThemeToggle />}
    >
      <div className="flex flex-col gap-10" data-testid="design-system-gallery">
        <SectionCard
          realm="admin"
          title="How to use this gallery"
          data-testid="design-system-intro"
        >
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            <li>
              Specimens are grouped by composition tier: primitives → patterns → compositions →
              in-context links → fenced (not represented here).
            </li>
            <li>
              Confidence badges: <Badge variant="outline">isolated</Badge> (single primitive),{" "}
              <Badge variant="outline">composed</Badge> (library composition),{" "}
              <Badge variant="outline">live-route-only</Badge> (open the real route).
            </li>
            <li>Toggle theme via the control in the page header (or admin nav theme control).</li>
          </ul>
        </SectionCard>

        <section className="flex flex-col gap-4" data-testid="design-system-primitives">
          <h2 className="text-xl font-semibold text-foreground">1. Primitives</h2>
          <p className="text-sm text-muted-foreground">
            High-traffic <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">ui/*</code>{" "}
            specimens — not every obscure file.
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            <GallerySpecimen
              name="Button"
              canonicalPath="src/components/ui/button.tsx"
              confidence="isolated"
              data-testid="specimen-button"
            >
              <div className="flex flex-wrap gap-2">
                <Button type="button">Default</Button>
                <Button type="button" variant="accent">
                  Accent
                </Button>
                <Button type="button" variant="secondary">
                  Secondary
                </Button>
                <Button type="button" variant="outline">
                  Outline
                </Button>
                <Button type="button" variant="ghost">
                  Ghost
                </Button>
                <Button type="button" variant="destructive">
                  Destructive
                </Button>
                <Button type="button" variant="link">
                  Link
                </Button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button type="button" size="xs">
                  XS
                </Button>
                <Button type="button" size="sm">
                  SM
                </Button>
                <Button type="button" size="default">
                  Default
                </Button>
                <Button type="button" size="lg">
                  LG
                </Button>
              </div>
            </GallerySpecimen>

            <GallerySpecimen
              name="Input"
              canonicalPath="src/components/ui/input.tsx"
              confidence="isolated"
              data-testid="specimen-input"
            >
              <Input type="text" placeholder="Text input" aria-label="Gallery input sample" />
            </GallerySpecimen>

            <GallerySpecimen
              name="Textarea"
              canonicalPath="src/components/ui/textarea.tsx"
              confidence="isolated"
              data-testid="specimen-textarea"
            >
              <Textarea placeholder="Multi-line text" aria-label="Gallery textarea sample" rows={3} />
            </GallerySpecimen>

            <GallerySpecimen
              name="Badge"
              canonicalPath="src/components/ui/badge.tsx"
              confidence="isolated"
              data-testid="specimen-badge"
            >
              <div className="flex flex-wrap gap-2">
                <Badge>Default</Badge>
                <Badge variant="secondary">Secondary</Badge>
                <Badge variant="outline">Outline</Badge>
                <Badge variant="destructive">Destructive</Badge>
              </div>
            </GallerySpecimen>

            <GallerySpecimen
              name="Card"
              canonicalPath="src/components/ui/card.tsx"
              confidence="isolated"
              data-testid="specimen-card"
            >
              <Card className="gap-3 py-4 shadow-none">
                <CardHeader className="px-4 pb-0">
                  <CardTitle className="text-sm">Card title</CardTitle>
                  <CardDescription>Optional description slot.</CardDescription>
                </CardHeader>
                <CardContent className="px-4 pt-0 text-sm text-muted-foreground">
                  Card primitives wrap content; prefer SectionCard for page sections.
                </CardContent>
              </Card>
            </GallerySpecimen>

            <GallerySpecimen
              name="Dialog"
              canonicalPath="src/components/ui/dialog.tsx"
              confidence="isolated"
              data-testid="specimen-dialog"
            >
              <DesignSystemDialogSample />
            </GallerySpecimen>

            <GallerySpecimen
              name="Select"
              canonicalPath="src/components/ui/select.tsx"
              confidence="isolated"
              data-testid="specimen-select"
            >
              <DesignSystemSelectSample />
            </GallerySpecimen>
          </div>
        </section>

        <section className="flex flex-col gap-4" data-testid="design-system-patterns">
          <h2 className="text-xl font-semibold text-foreground">2. Patterns</h2>
          <p className="text-sm text-muted-foreground">
            §1A-style compositions — SectionCard realms side by side.
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard
              realm="admin"
              title="SectionCard — admin realm"
              description="Representative admin section grouping."
              data-testid="pattern-section-card-admin"
            >
              <p className="text-sm text-muted-foreground">
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">data-realm=&quot;admin&quot;</code>
              </p>
            </SectionCard>
            <SectionCard
              realm="account"
              title="SectionCard — account realm"
              description="Representative account section grouping."
              data-testid="pattern-section-card-account"
            >
              <p className="text-sm text-muted-foreground">
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">data-realm=&quot;account&quot;</code>
              </p>
            </SectionCard>
          </div>
        </section>

        <section className="flex flex-col gap-4" data-testid="design-system-compositions">
          <h2 className="text-xl font-semibold text-foreground">3. Compositions</h2>
          <div className="grid gap-4">
            <GallerySpecimen
              name="SubNav — admin settings"
              canonicalPath="src/components/SubNav.tsx"
              confidence="composed"
              data-testid="composition-subnav-admin"
            >
              <div className="max-w-[220px] rounded-md border border-border bg-card p-2">
                <SubNav realm="admin-settings" />
              </div>
            </GallerySpecimen>

            <GallerySpecimen
              name="SubNav — account child tabs"
              canonicalPath="src/components/SubNav.tsx"
              confidence="composed"
              data-testid="composition-subnav-account"
            >
              <p className="mb-3 text-xs text-muted-foreground">
                Demo learner id — links navigate to real account routes if the id exists.
              </p>
              <SubNav realm="account-child" learnerId="gallery-demo-learner" />
            </GallerySpecimen>

            <GallerySpecimen
              name="PageShell"
              canonicalPath="src/components/PageShell.tsx"
              confidence="live-route-only"
              data-testid="composition-pageshell"
            >
              <p className="text-sm text-muted-foreground">
                This page uses <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">PageShell realm=&quot;admin&quot;</code>{" "}
                for the title block only (admin nav comes from{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">admin/layout.tsx</code>
                ). Other realms need live routes:
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                <li>
                  <Link href="/account/dashboard" className="font-medium underline-offset-4 hover:underline">
                    Account realm
                  </Link>{" "}
                  — <code className="font-mono text-xs">/account/dashboard</code>
                </li>
                <li>
                  <Link href="/join" className="font-medium underline-offset-4 hover:underline">
                    Student realm
                  </Link>{" "}
                  — <code className="font-mono text-xs">/join</code>
                </li>
                <li>
                  Share realm — open a real share link from a student record (
                  <code className="font-mono text-xs">/s/&lt;token&gt;</code>).
                </li>
              </ul>
            </GallerySpecimen>
          </div>
        </section>

        <section className="flex flex-col gap-4" data-testid="design-system-live-links">
          <h2 className="text-xl font-semibold text-foreground">4. In-context links</h2>
          <p className="text-sm text-muted-foreground">
            Deep links to live routes Andrew eyeballs often — open in a new tab as needed.
          </p>
          <SectionCard realm="admin" title="Live routes" contentClassName="p-0">
            <ul className="divide-y divide-border" role="list">
              {[
                { href: "/login", label: "Login", note: "Marketing/auth shell" },
                { href: "/admin/settings/profile", label: "Admin settings", note: "PageShell + SubNav" },
                { href: "/admin/students", label: "Students roster", note: "Admin list surface" },
                { href: "/privacy", label: "Privacy", note: "LegalDocumentShell" },
                { href: "/feedback", label: "Public feedback form", note: "Marketing form" },
              ].map((item) => (
                <li key={item.href} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
                  <Link
                    href={item.href}
                    className="font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    {item.label}
                  </Link>
                  <span className="font-mono text-xs text-muted-foreground">
                    {item.href} · {item.note}
                  </span>
                </li>
              ))}
            </ul>
          </SectionCard>
        </section>

        <section className="flex flex-col gap-4" data-testid="design-system-fenced">
          <h2 className="text-xl font-semibold text-foreground">5. Fenced — not in gallery</h2>
          <SectionCard realm="admin" title="Live session chrome">
            <p className="text-sm text-muted-foreground">
              Whiteboard chrome, recording UI, and live A/V are <strong>not</strong> represented in
              this gallery — they depend on session state, relay peers, and device hardware. Eyeball
              those on a real whiteboard workspace only.
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              Start a session from{" "}
              <Link href="/admin/students" className="font-medium underline-offset-4 hover:underline">
                Students
              </Link>{" "}
              when you need to review WB chrome, recording banners, or A/V controls.
            </p>
          </SectionCard>
        </section>
      </div>
    </PageShell>
  );
}
