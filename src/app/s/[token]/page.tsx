import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatDateOnlyDisplay } from "@/lib/date-only";
import { SeenTracker } from "./SeenTracker";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Session notes",
    robots: { index: false, follow: false },
  };
}

function safeJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatTimeDisplay(d: Date | null): string {
  if (!d) return "";
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

const SEEN_NOTES_SHOWN = 5;

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const link = await db.shareLink.findUnique({
    where: { token },
    include: {
      student: {
        include: {
          notes: {
            orderBy: [{ date: "desc" }, { createdAt: "desc" }],
            include: {
              recordings: {
                where: { note: { shareRecordingInEmail: true } },
                orderBy: { orderIndex: "asc" },
                select: {
                  id: true,
                  mimeType: true,
                  durationSeconds: true,
                  orderIndex: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!link || link.revokedAt) notFound();

  const student = link.student;
  const totalNotes = student.notes.length;

  // Which notes has this visitor already seen?
  const viewedRows = await db.noteView.findMany({
    where: { shareToken: token },
    select: { noteId: true },
  });
  const seenNoteIds = new Set(viewedRows.map((v) => v.noteId));

  // Bootstrap fix: on first visit (no view history for this token), immediately
  // seed all existing notes as "seen" so future visits only highlight genuinely
  // new notes. Without this, notes created before the seen-tracking feature was
  // deployed (or before this share link was ever opened) would all appear as "NEW"
  // on the second visit, which is misleading.
  if (seenNoteIds.size === 0 && student.notes.length > 0) {
    await db.noteView.createMany({
      data: student.notes.map((n) => ({
        shareToken: token,
        noteId: n.id,
      })),
      skipDuplicates: true,
    });
    student.notes.forEach((n) => seenNoteIds.add(n.id));
  }

  const isReturningVisitor = seenNoteIds.size > 0;

  const tutor = await db.adminUser.findFirst({ select: { displayName: true, email: true } });
  const tutorName = tutor?.displayName?.trim() || tutor?.email?.split("@")[0] || null;

  // Split notes into unseen and seen for layout purposes.
  // On first visit, treat everything as "seen" (no NEW labels — nothing to compare against).
  const unseenNotes = isReturningVisitor
    ? student.notes.filter((n) => !seenNoteIds.has(n.id))
    : [];
  const seenNotes = isReturningVisitor
    ? student.notes.filter((n) => seenNoteIds.has(n.id))
    : student.notes;

  // Seen notes: show first SEEN_NOTES_SHOWN expanded, rest inside <details>.
  const seenTop = seenNotes.slice(0, SEEN_NOTES_SHOWN);
  const seenOlder = seenNotes.slice(SEEN_NOTES_SHOWN);

  function NoteCard({
    note,
    isNew,
  }: {
    note: (typeof student.notes)[number];
    isNew: boolean;
  }) {
    const links = safeJsonArray(note.linksJson);
    const audioUrls = note.shareRecordingInEmail
      ? note.recordings.map((r) => `/api/audio/${r.id}?token=${token}`)
      : [];

    return (
      <div
        className="card"
        style={{ position: "relative" }}
        data-note-id={note.id}
      >
        {/* SeenTracker fires a POST when this card enters the viewport */}
        <SeenTracker noteId={note.id} token={token} />

        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontWeight: 800 }}>
              {formatDateOnlyDisplay(note.date)}
            </div>
            {(note.startTime || note.endTime) && (
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                {formatTimeDisplay(note.startTime)}
                {note.startTime && note.endTime && " – "}
                {formatTimeDisplay(note.endTime)}
              </div>
            )}
          </div>
          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            {note.template && (
              <span className="muted" style={{ fontSize: 12 }}>{note.template}</span>
            )}
            {isNew && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: 12,
                  background: "var(--color-primary, #2563eb)",
                  color: "#fff",
                  letterSpacing: "0.04em",
                }}
              >
                NEW
              </span>
            )}
          </div>
        </div>

        <div className="divider" />

        <div style={{ display: "grid", gap: 12 }}>
          <section>
            <div className="muted" style={{ fontSize: 12 }}>Topics covered</div>
            <div style={{ whiteSpace: "pre-wrap" }}>{note.topics || "—"}</div>
          </section>
          <section>
            <div className="muted" style={{ fontSize: 12 }}>Homework</div>
            <div style={{ whiteSpace: "pre-wrap" }}>{note.homework || "—"}</div>
          </section>
          <section>
            <div className="muted" style={{ fontSize: 12 }}>Assessment</div>
            <div style={{ whiteSpace: "pre-wrap" }}>{note.assessment || "—"}</div>
          </section>
          <section>
            <div className="muted" style={{ fontSize: 12 }}>Plan</div>
            <div style={{ whiteSpace: "pre-wrap" }}>{note.nextSteps || "—"}</div>
          </section>

          {links.length > 0 && (
            <section>
              <div className="muted" style={{ fontSize: 12 }}>Links</div>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {links.map((u) => (
                  <li key={u}>
                    <a href={u} target="_blank" rel="noreferrer">{u}</a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {audioUrls.length > 0 && (
            <section data-testid="share-page-audio">
              <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                Session recording{audioUrls.length > 1 ? "s" : ""}
              </div>
              {audioUrls.map((audioUrl, idx) => {
                const rec = note.recordings[idx];
                const durationLabel = rec?.durationSeconds
                  ? ` · ${formatDuration(rec.durationSeconds)}`
                  : "";
                return (
                  <div key={audioUrl} style={{ marginBottom: idx < audioUrls.length - 1 ? 10 : 0 }}>
                    {audioUrls.length > 1 && (
                      <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>
                        Part {idx + 1} of {audioUrls.length}{durationLabel}
                      </div>
                    )}
                    {audioUrls.length === 1 && durationLabel && (
                      <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>
                        {durationLabel.trim()}
                      </div>
                    )}
                    <audio
                      controls
                      src={audioUrl}
                      aria-label={
                        audioUrls.length > 1
                          ? `Session recording part ${idx + 1} of ${audioUrls.length}`
                          : "Session recording shared by your tutor"
                      }
                      style={{ width: "100%", maxWidth: 480, display: "block" }}
                    />
                  </div>
                );
              })}
              <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--color-muted, #6b7280)" }}>
                Recording shared by your tutor for your review.
              </p>
            </section>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ maxWidth: 860 }}>
      <div className="card" style={{ background: "rgba(255,255,255,0.04)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
          <div>
            <h1 style={{ marginTop: 0, marginBottom: 4 }}>{student.name}</h1>
            <p className="muted" style={{ margin: 0 }}>
              {tutorName ? `Notes shared by ${tutorName}` : "Session notes"}
              {totalNotes > 0 && (
                <> · {totalNotes} note{totalNotes !== 1 ? "s" : ""}</>
              )}
            </p>
          </div>
          {totalNotes > SEEN_NOTES_SHOWN && (
            <Link
              className="btn"
              href={`/s/${token}/all`}
              style={{ flexShrink: 0 }}
            >
              Browse all notes →
            </Link>
          )}
        </div>

        <div className="divider" />

        {totalNotes === 0 ? (
          <p className="muted">No notes yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {/* ── Unseen notes (returning visitors only) ── */}
            {unseenNotes.length > 0 && (
              <>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    margin: "4px 0",
                  }}
                >
                  <div style={{ flex: 1, height: 1, background: "var(--color-primary, #2563eb)", opacity: 0.5 }} />
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--color-primary, #2563eb)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    New since your last visit
                  </span>
                  <div style={{ flex: 1, height: 1, background: "var(--color-primary, #2563eb)", opacity: 0.5 }} />
                </div>

                {unseenNotes.map((n) => (
                  <NoteCard key={n.id} note={n} isNew={true} />
                ))}

                {seenNotes.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      margin: "4px 0",
                    }}
                  >
                    <div style={{ flex: 1, height: 1, background: "var(--color-border, #374151)" }} />
                    <span className="muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                      Previously seen
                    </span>
                    <div style={{ flex: 1, height: 1, background: "var(--color-border, #374151)" }} />
                  </div>
                )}
              </>
            )}

            {/* ── Seen / first-visit notes ── */}
            {seenTop.map((n) => (
              <NoteCard key={n.id} note={n} isNew={false} />
            ))}

            {/* ── Older seen notes collapsed ── */}
            {seenOlder.length > 0 && (
              <details style={{ marginTop: 4 }}>
                <summary
                  style={{
                    cursor: "pointer",
                    fontSize: 13,
                    color: "var(--color-muted, #6b7280)",
                    padding: "8px 0",
                    userSelect: "none",
                  }}
                >
                  {seenOlder.length} older note{seenOlder.length !== 1 ? "s" : ""} — click to expand
                </summary>
                <div style={{ display: "grid", gap: 12, marginTop: 8 }}>
                  {seenOlder.map((n) => (
                    <NoteCard key={n.id} note={n} isNew={false} />
                  ))}
                </div>
              </details>
            )}
          </div>
        )}

        {totalNotes > SEEN_NOTES_SHOWN && (
          <div style={{ marginTop: 20, textAlign: "center" }}>
            <Link className="btn" href={`/s/${token}/all`}>
              Browse all {totalNotes} notes →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
