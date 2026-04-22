import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { db } from "@/lib/db";
import { canAccessStudentRow, getStudentScope } from "@/lib/student-scope";
import { NoteCardActions } from "../NoteCardActions";
import { NotesSearchBar } from "@/components/notes/NotesSearchBar";
import { PageSizeSelect } from "@/components/notes/PageSizeSelect";

export const dynamic = "force-dynamic";

const DEFAULT_PAGE_SIZE = 20;

function formatDateInput(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Extract HH:MM (24-hour, UTC) for use in <input type="time"> defaultValue. */
function formatTimeInput(d: Date | null): string {
  if (!d) return "";
  return `${d.getUTCHours().toString().padStart(2, "0")}:${d.getUTCMinutes().toString().padStart(2, "0")}`;
}

/** Format a UTC DateTime as "3:00 PM" for display. */
function formatTimeDisplay(d: Date | null): string {
  if (!d) return "";
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function safeJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; page?: string; size?: string }>;
}

export default async function StudentNotesPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { q = "", page = "1", size = String(DEFAULT_PAGE_SIZE) } = await searchParams;

  const scope = await getStudentScope();
  if (scope.kind === "none") redirect("/login");

  const student = await db.student.findUnique({
    where: { id },
    select: { id: true, name: true, adminUserId: true },
  });

  if (!student) notFound();
  if (!canAccessStudentRow(scope, student)) notFound();

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = Math.min(50, Math.max(10, parseInt(size, 10) || DEFAULT_PAGE_SIZE));
  const skip = (pageNum - 1) * pageSize;

  const searchFilter = q.trim()
    ? {
        OR: [
          { topics: { contains: q.trim(), mode: "insensitive" as const } },
          { homework: { contains: q.trim(), mode: "insensitive" as const } },
          { assessment: { contains: q.trim(), mode: "insensitive" as const } },
          { nextSteps: { contains: q.trim(), mode: "insensitive" as const } },
        ],
      }
    : {};

  const [notes, totalCount] = await Promise.all([
    db.sessionNote.findMany({
      where: { studentId: id, ...searchFilter },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      skip,
      take: pageSize,
      select: {
        id: true,
        date: true,
        topics: true,
        homework: true,
        assessment: true,
        nextSteps: true,
        linksJson: true,
        template: true,
        status: true,
        sentAt: true,
        startTime: true,
        endTime: true,
        recordings: {
          orderBy: { orderIndex: "asc" },
          select: { id: true, mimeType: true, durationSeconds: true },
        },
      },
    }),
    db.sessionNote.count({ where: { studentId: id, ...searchFilter } }),
  ]);

  const totalPages = Math.ceil(totalCount / pageSize);

  function buildPageUrl(p: number) {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (pageSize !== DEFAULT_PAGE_SIZE) sp.set("size", String(pageSize));
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return `/admin/students/${id}/notes${qs ? `?${qs}` : ""}`;
  }

  function PaginationNav({ label }: { label: string }) {
    if (totalPages <= 1) return null;
    return (
      <nav
        aria-label={label}
        style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}
      >
        {pageNum > 1 && (
          <Link className="btn" href={buildPageUrl(pageNum - 1)}>
            ← Previous
          </Link>
        )}
        {Array.from({ length: totalPages }, (_, i) => i + 1)
          .filter((p) => Math.abs(p - pageNum) <= 2 || p === 1 || p === totalPages)
          .reduce<(number | "…")[]>((acc, p, idx, arr) => {
            if (idx > 0 && typeof arr[idx - 1] === "number" && (p as number) - (arr[idx - 1] as number) > 1) {
              acc.push("…");
            }
            acc.push(p);
            return acc;
          }, [])
          .map((p, idx) =>
            p === "…" ? (
              <span key={`ellipsis-${idx}`} style={{ alignSelf: "center", padding: "0 4px" }}>
                …
              </span>
            ) : (
              <Link
                key={p}
                className="btn"
                href={buildPageUrl(p as number)}
                aria-current={p === pageNum ? "page" : undefined}
                style={p === pageNum ? { opacity: 0.6, pointerEvents: "none" } : {}}
              >
                {p}
              </Link>
            )
          )}
        {pageNum < totalPages && (
          <Link className="btn" href={buildPageUrl(pageNum + 1)}>
            Next →
          </Link>
        )}
      </nav>
    );
  }

  return (
    <div className="card">
      {/* Breadcrumb */}
      <div className="muted" style={{ fontSize: 12 }}>
        <Link href="/admin/students">Students</Link>
        {" / "}
        <Link href={`/admin/students/${id}`}>{student.name}</Link>
        {" / "}Notes
      </div>
      <h1 style={{ margin: "6px 0 16px" }}>
        {student.name} — Session notes
      </h1>

      {/* Toolbar */}
      <Suspense>
        <div className="row" style={{ flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          <NotesSearchBar placeholder="Search topics, homework, assessment, plan…" />
          <PageSizeSelect defaultSize={DEFAULT_PAGE_SIZE} />
          <Link className="btn" href={`/admin/students/${id}`} style={{ flexShrink: 0 }}>
            ← Back to student
          </Link>
        </div>
      </Suspense>

      {/* Results count + top pagination */}
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>
          {q
            ? `${totalCount} note${totalCount !== 1 ? "s" : ""} matching "${q}"`
            : `${totalCount} note${totalCount !== 1 ? "s" : ""} total`}
          {totalPages > 1 && ` — page ${pageNum} of ${totalPages}`}
        </p>
        <PaginationNav label="Note pages (top)" />
      </div>

      {notes.length === 0 ? (
        <p className="muted">{q ? "No notes match your search." : "No notes yet."}</p>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {notes.map((n) => {
            const links = safeJsonArray(n.linksJson);
            const hasRecordings = n.recordings.length > 0;
            const totalSegments = n.recordings.length;

            return (
              <div key={n.id} className="card">
                <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>
                      {new Date(n.date).toLocaleDateString()}
                    </div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                      {(n.startTime || n.endTime) && (
                        <span>
                          {formatTimeDisplay(n.startTime)} {n.startTime && n.endTime && "–"} {formatTimeDisplay(n.endTime)}
                          {" · "}
                        </span>
                      )}
                      Status: {n.status}
                      {n.template && ` · ${n.template}`}
                    </div>
                  </div>
                  <NoteCardActions
                    noteId={n.id}
                    studentId={student.id}
                    status={n.status}
                    sentAt={n.sentAt ? n.sentAt.toISOString() : null}
                    defaultValues={{
                      date: formatDateInput(n.date),
                      template: n.template ?? "",
                      topics: n.topics,
                      homework: n.homework,
                      assessment: n.assessment,
                      plan: n.nextSteps,
                      links: safeJsonArray(n.linksJson).join("\n"),
                      startTime: formatTimeInput(n.startTime),
                      endTime: formatTimeInput(n.endTime),
                    }}
                  />
                </div>

                <div className="divider" />

                <div style={{ display: "grid", gap: 10 }}>
                  <div>
                    <div className="muted" style={{ fontSize: 12 }}>Topics</div>
                    <div style={{ whiteSpace: "pre-wrap" }}>
                      {n.topics || <span className="muted">—</span>}
                    </div>
                  </div>
                  <div>
                    <div className="muted" style={{ fontSize: 12 }}>Homework</div>
                    <div style={{ whiteSpace: "pre-wrap" }}>
                      {n.homework || <span className="muted">—</span>}
                    </div>
                  </div>
                  <div>
                    <div className="muted" style={{ fontSize: 12 }}>Assessment</div>
                    <div style={{ whiteSpace: "pre-wrap" }}>
                      {n.assessment || <span className="muted">—</span>}
                    </div>
                  </div>
                  <div>
                    <div className="muted" style={{ fontSize: 12 }}>Plan</div>
                    <div style={{ whiteSpace: "pre-wrap" }}>
                      {n.nextSteps || <span className="muted">—</span>}
                    </div>
                  </div>
                  {links.length > 0 && (
                    <div>
                      <div className="muted" style={{ fontSize: 12 }}>Links</div>
                      <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                        {links.map((u) => (
                          <li key={u}>
                            <a href={u} target="_blank" rel="noreferrer">{u}</a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {hasRecordings && (
                    <div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        Recording{totalSegments > 1 ? `s (${totalSegments} segments)` : ""}
                      </div>
                      <div style={{ display: "grid", gap: 6, marginTop: 4 }}>
                        {n.recordings.map((rec, idx) => (
                          <div key={rec.id}>
                            {totalSegments > 1 && (
                              <div className="muted" style={{ fontSize: 11, marginBottom: 2 }}>
                                Part {idx + 1} of {totalSegments}
                                {rec.durationSeconds
                                  ? ` · ${Math.round(rec.durationSeconds)}s`
                                  : ""}
                              </div>
                            )}
                            {totalSegments === 1 && rec.durationSeconds && (
                              <div className="muted" style={{ fontSize: 11, marginBottom: 2 }}>
                                {Math.round(rec.durationSeconds)}s
                              </div>
                            )}
                            {/* Audio caption provided via aria-label on the element */}
                            <audio
                              controls
                              preload="none"
                              src={`/api/audio/admin/${rec.id}`}
                              style={{ width: "100%", maxWidth: 480 }}
                              aria-label={
                                totalSegments > 1
                                  ? `Recording part ${idx + 1} of ${totalSegments}`
                                  : "Session recording"
                              }
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Bottom pagination */}
      <div style={{ marginTop: 20 }}>
        <PaginationNav label="Note pages (bottom)" />
      </div>
    </div>
  );
}
