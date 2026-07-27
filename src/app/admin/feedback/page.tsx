import Link from "next/link";
import { db } from "@/lib/db";
import { requireOperator } from "@/lib/operator";
import { PageShell } from "@/components/PageShell";
import { SectionCard } from "@/components/SectionCard";
import { LocalDateTimeText } from "@/components/LocalDateTimeText";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ spam?: string }>;
};

export default async function AdminFeedbackPage({ searchParams }: PageProps) {
  await requireOperator();
  const { spam } = await searchParams;
  const showSpam = spam === "1";

  const items = await db.feedbackItem.findMany({
    where: { status: showSpam ? "SPAM" : "INBOX" },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <PageShell realm="admin"
      title="Feedback inbox"
      description={
        <>
          <strong>This page only lists submissions.</strong> To send feedback yourself (even while
          signed in), use{" "}
          <Link
            href="/feedback"
            className="font-semibold text-foreground underline-offset-4 hover:underline"
          >
            Send feedback
          </Link>{" "}
          in the top nav — that opens the public <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">/feedback</code> form.
          {!showSpam ? (
            <>
              {" "}
              Obvious spam is filtered automatically and does not appear here.
            </>
          ) : null}
        </>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {showSpam ? (
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/feedback">Back to inbox</Link>
          </Button>
        ) : (
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/feedback?spam=1">Show spam</Link>
          </Button>
        )}
        <p className="text-sm text-muted-foreground">
          {showSpam
            ? "Auto-filtered spam submissions (heuristic scoring)."
            : "Clean submissions only (status INBOX)."}
        </p>
      </div>

      <SectionCard realm="admin"
        title={showSpam ? "Spam" : "Submissions"}
        contentClassName="p-0"
      >
        {items.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">
            {showSpam ? (
              "No spam submissions yet."
            ) : (
              <>
                No submissions yet.{" "}
                <Link
                  href="/feedback"
                  className="font-semibold text-foreground underline-offset-4 hover:underline"
                >
                  Open the public form (/feedback)
                </Link>{" "}
                to send a test — not this URL.
              </>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-border" role="list">
            {items.map((f) => (
              <li key={f.id} className="px-4 py-4 space-y-2">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <p className="text-sm font-semibold text-foreground">{f.kind}</p>
                  <p className="text-xs font-mono text-muted-foreground">
                    <LocalDateTimeText dateTime={f.createdAt.toISOString()} />
                    {f.contactEmail ? ` · ${f.contactEmail}` : ""}
                    {f.page ? ` · ${f.page}` : ""}
                    {showSpam && f.spamReason ? ` · spam: ${f.spamReason}` : ""}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{f.message}</p>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </PageShell>
  );
}
