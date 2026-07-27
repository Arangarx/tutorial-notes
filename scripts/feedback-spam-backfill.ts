/**
 * Reclassify existing FeedbackItem rows using the same heuristics as live submit.
 *
 * Usage:
 *   npx tsx scripts/feedback-spam-backfill.ts           # dry run (default)
 *   npx tsx scripts/feedback-spam-backfill.ts --apply    # write SPAM status
 *
 * Requires DATABASE_URL. Does not touch rows already marked SPAM.
 */

import { PrismaClient } from "@prisma/client";
import { scoreFeedbackSubmission } from "@/lib/feedback-spam";

const apply = process.argv.includes("--apply");

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const prisma = new PrismaClient();

  try {
    const rows = await prisma.feedbackItem.findMany({
      where: { status: "INBOX" },
      select: { id: true, message: true, contactEmail: true },
      orderBy: { createdAt: "asc" },
    });

    let wouldSpam = 0;
    let updated = 0;

    for (const row of rows) {
      const scored = scoreFeedbackSubmission({
        message: row.message,
        contactEmail: row.contactEmail,
      });
      if (!scored.isSpam) continue;

      wouldSpam++;
      console.log(
        `[spam] ${row.id} reasons=${scored.reasons.join(",")} preview=${JSON.stringify(row.message.slice(0, 80))}`
      );

      if (apply) {
        await prisma.feedbackItem.update({
          where: { id: row.id },
          data: {
            status: "SPAM",
            spamReason: scored.reasons.join(", "),
          },
        });
        updated++;
      }
    }

    console.log(
      apply
        ? `Backfill complete: ${updated} row(s) marked SPAM of ${rows.length} INBOX scanned (${wouldSpam} matched).`
        : `Dry run: ${wouldSpam} of ${rows.length} INBOX row(s) would be marked SPAM. Re-run with --apply to write.`
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
