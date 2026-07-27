import Link from "next/link";
import { StatTile } from "@/components/admin/StatTile";
import { assertAdminOrNotFound } from "@/lib/impersonation";
import { PageShell } from "@/components/PageShell";
import { SectionCard } from "@/components/SectionCard";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  daysSinceRateCardVerified,
  isRateCardStale,
  RATE_CARD_VERSION,
  RATE_CARD_VERIFIED_AT,
  WHISPER_1_USD_PER_AUDIO_MINUTE,
} from "@/lib/observability/rate-card";
import {
  formatUsd,
  getCostBySource,
  getCostByTutor,
  getCostDashboardSummary,
  getMonthlyCostBars,
  PRICING_FLOOR_60MIN_USD,
} from "@/lib/observability/cost-queries";

export const dynamic = "force-dynamic";

export default async function AdminCostPage() {
  await assertAdminOrNotFound();

  const stale = isRateCardStale();
  const daysSince = daysSinceRateCardVerified();
  const verifiedLabel = RATE_CARD_VERIFIED_AT.toISOString().slice(0, 10);

  const [summary, bySource, byTutor, monthlyBars] = await Promise.all([
    getCostDashboardSummary(),
    getCostBySource(),
    getCostByTutor(),
    getMonthlyCostBars(6),
  ]);

  const maxBarUsd = Math.max(...monthlyBars.map((b) => b.totalUsd), 0.001);

  return (
    <PageShell realm="admin"
      title="Cost observability"
      description={
        <>
          Estimated per-session and platform costs for pricing validation. Figures are{" "}
          <strong>estimates</strong> from API usage data × the verified rate-card — not exact
          provider invoices.
        </>
      }
    >
      {stale ? (
        <Alert className="mb-6 border-warning/30 bg-warning/10">
          <AlertDescription className="text-sm text-warning">
            Rate card last verified {verifiedLabel} ({daysSince} days ago) — review{" "}
            <a
              href="https://developers.openai.com/api/docs/pricing"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              OpenAI
            </a>
            ,{" "}
            <a href="https://vercel.com/pricing" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              Vercel
            </a>
            , and{" "}
            <a href="https://neon.com/pricing" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              Neon
            </a>{" "}
            pricing and update{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              src/lib/observability/rate-card.ts
            </code>
            .
          </AlertDescription>
        </Alert>
      ) : (
        <p className="mb-6 text-xs text-muted-foreground">
          Rate card {RATE_CARD_VERSION} · verified {verifiedLabel} ({daysSince} days ago)
        </p>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="This month (estimated)" value={formatUsd(summary.monthTotalUsd)} />
        <StatTile
          label="Avg / session (30d)"
          value={formatUsd(summary.avgCostPerSessionUsd)}
          sub={`${summary.sessionsLast30Days} sessions`}
        />
        <StatTile label="Sessions this month" value={String(summary.monthSessionCount)} />
        <StatTile
          label="Pricing floor (60 min)"
          value={formatUsd(PRICING_FLOOR_60MIN_USD)}
          sub={`Whisper @ $${WHISPER_1_USD_PER_AUDIO_MINUTE}/min dominates`}
        />
      </div>

      <SectionCard realm="admin" title="By cost source (this month)" contentClassName="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Source</TableHead>
              <TableHead>Usage</TableHead>
              <TableHead className="text-right">Est. cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bySource.map((row) => (
              <TableRow key={row.kindGroup}>
                <TableCell>{row.label}</TableCell>
                <TableCell className="text-muted-foreground">{row.detail}</TableCell>
                <TableCell className="text-right">{formatUsd(row.totalUsd)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>

      <SectionCard realm="admin" title="By tutor (this month)" className="mt-6" contentClassName="p-0">
        {byTutor.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            No cost events with tutor attribution yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tutor</TableHead>
                <TableHead className="text-right">Sessions</TableHead>
                <TableHead className="text-right">Whisper min</TableHead>
                <TableHead className="text-right">Est. cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byTutor.map((row) => (
                <TableRow key={row.adminUserId}>
                  <TableCell>{row.tutorName}</TableCell>
                  <TableCell className="text-right">{row.sessionCount}</TableCell>
                  <TableCell className="text-right">{row.whisperMinutes.toFixed(1)}</TableCell>
                  <TableCell className="text-right">{formatUsd(row.totalUsd)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>

      <SectionCard realm="admin" title="Monthly trend (6 months)" className="mt-6">
        <div className="flex min-h-[120px] items-end gap-2">
          {monthlyBars.map((bar) => (
            <div key={bar.month} className="flex flex-1 flex-col items-center gap-1">
              <div
                title={formatUsd(bar.totalUsd)}
                className="w-full max-w-12 rounded bg-accent"
                style={{
                  height: `${Math.max(4, (bar.totalUsd / maxBarUsd) * 100)}px`,
                }}
              />
              <span className="text-center text-[10px] text-muted-foreground">{bar.month}</span>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard realm="admin" title="Pricing-floor reference" className="mt-6">
        <p className="text-sm text-muted-foreground">
          60-minute whiteboard session variable cost anchor (design doc §1.3): Whisper ~$0.36,
          GPT + blob + compute rounding errors. Use per-session drill-down on{" "}
          <Link href="/admin/students" className="font-medium text-foreground underline-offset-2 hover:underline">
            student whiteboard review
          </Link>{" "}
          pages to validate against real sessions.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Tutor-facing cost UI is deferred until the pricing model is locked (session tokens).
        </p>
      </SectionCard>
    </PageShell>
  );
}
