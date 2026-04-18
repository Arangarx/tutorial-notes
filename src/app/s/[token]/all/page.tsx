import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { db } from "@/lib/db";
import { NotesSearchBar } from "@/components/notes/NotesSearchBar";
import { PageSizeSelect } from "@/components/notes/PageSizeSelect";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "All session notes",
    robots: { index: false, follow: false },
  };
}

const DEFAULT_PAGE_SIZE = 20;

function safeJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function formatTimeDisplay(d: Date | null): string {
  if (!d) return "";
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

interface PageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ q?: string; page?: string; size?: string }>;
}

export default async function ShareAllPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const { q = "", page = "1", size = String(DEFAULT_PAGE_SIZE) } = await searchParams;

  const link = await db.shareLink.findUnique({
    where: { token },
    include: { student: { select: { id: true, name: true } } },
  });
  if (!link || link.revokedAt) notFound();

  const { student } = link;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = Math.min(50, Math.max(10, parseInt(size, 10) || DEFAULT_PAGE_SIZE));
  const skip = (pageNum - 1) * pageSize;

  const searchFilter = q.trim()
    ? {
        OR: [
          { topics: { contains: q.trim(), mode: "insensitive" as const } },
          { homework: { contains: q.trim(), mode: "insensitive" as const } },
          { nextSteps: { contains: q.trim(), mode: "insensitive" as const } },
        ],
      }
    : {};

  const [notes, totalCount] = await Promise.all([
    db.sessionNote.findMany({
      where: { studentId: student.id, ...searchFilter },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      skip,
      take: pageSize,
      select: {
        id: true,
        date: true,
        topics: true,
        homework: true,
        nextSteps: true,
        linksJson: true,
        template: true,
        startTime: true,
        endTime: true,
        shareRecordingInEmail: true,
        recordings: {
          orderBy: { orderIndex: "asc" },
          select: { id: true, durationSeconds: true },
        },
      },
    }),
    db.sessionNote.count({ where: { studentId: student.id, ...searchFilter } }),
  ]);

  const totalPages = Math.ceil(totalCount / pageSize);

  function buildPageUrl(p: number) {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (pageSize !== DEFAULT_PAGE_SIZE) sp.set("size", String(pageSize));
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return `/s/${token}/all${qs ? `?${qs}` : ""}`;
  }

  function PaginationNav() {
    if (totalPages <= 1) return null;
    return (
      <nav
        aria-label="Note pages"
        style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}
      >
        {pageNum > 1 && (
          <Link className="btn" href={buildPageUrl(pageNum - 1)}>← Previous</Link>
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
              <span key={`e${idx}`} style={{ alignSelf: "center", padding: "0 4px" }}>…</span>
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
          <Link className="btn" href={buildPageUrl(pageNum + 1)}>Next →</Link>
        )}
      </nav>
    );
  }

  return (
    <div className="container" style={{ maxWidth: 860 }}>
      <div className="card" style={{ background: "rgba(255,255,255,0.04)" }}>
        {/* Breadcrumb */}
        <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
          <Link href={`/s/${token}`}>← Back to {student.name}&apos;s notes</Link>
        </div>

        <h1 style={{ marginTop: 0, marginBottom: 4 }}>{student.name} — All session notes</h1>

        {/* Toolbar */}
        <Suspense>
          <div className="row" style={{ flexWrap: "wrap", gap: 8, margin: "16px 0" }}>
            <NotesSearchBar placeholder="Search topics, homework, next steps…" />
            <PageSizeSelect defaultSize={DEFAULT_PAGE_SIZE} />
          </div>
        </Suspense>

        {/* Count + top pagination */}
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 12, alignItems: "center" }}>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            {q
              ? `${totalCount} note${totalCount !== 1 ? "s" : ""} matching "${q}"`
              : `${totalCount} note${totalCount !== 1 ? "s" : ""} total`}
            {totalPages > 1 && ` — page ${pageNum} of ${totalPages}`}
          </p>
          <PaginationNav />
        </div>

        {notes.length === 0 ? (
          <p className="muted">{q ? "No notes match your search." : "No notes yet."}</p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {notes.map((n) => {
              const links = safeJsonArray(n.linksJson);
              const audioUrls = n.shareRecordingInEmail
                ? n.recordings.map((r) => `/api/audio/${r.id}?token=${token}`)
                : [];

              return (
                <div key={n.id} className="card">
                  <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 800 }}>
                        {new Date(n.date).toLocaleDateString()}
                      </div>
                      {(n.startTime || n.endTime) && (
                        <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                          {formatTimeDisplay(n.startTime)}
                          {n.startTime && n.endTime && " – "}
                          {formatTimeDisplay(n.endTime)}
                        </div>
                      )}
                    </div>
                    {n.template && (
                      <span className="muted" style={{ fontSize: 12 }}>{n.template}</span>
                    )}
                  </div>

                  <div className="divider" />

                  <div style={{ display: "grid", gap: 10 }}>
                    <section>
                      <div className="muted" style={{ fontSize: 12 }}>Topics covered</div>
                      <div style={{ whiteSpace: "pre-wrap" }}>{n.topics || "—"}</div>
                    </section>
                    <section>
                      <div className="muted" style={{ fontSize: 12 }}>Homework</div>
                      <div style={{ whiteSpace: "pre-wrap" }}>{n.homework || "—"}</div>
                    </section>
                    <section>
                      <div className="muted" style={{ fontSize: 12 }}>Next steps</div>
                      <div style={{ whiteSpace: "pre-wrap" }}>{n.nextSteps || "—"}</div>
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
                      <section>
                        <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                          Session recording{audioUrls.length > 1 ? "s" : ""}
                        </div>
                        {audioUrls.map((audioUrl, idx) => {
                          const durationLabel = n.recordings[idx]?.durationSeconds
                            ? ` · ${Math.floor(n.recordings[idx].durationSeconds! / 60)}:${String(n.recordings[idx].durationSeconds! % 60).padStart(2, "0")}`
                            : "";
                          return (
                            <div key={audioUrl} style={{ marginBottom: idx < audioUrls.length - 1 ? 8 : 0 }}>
                              {audioUrls.length > 1 && (
                                <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>
                                  Part {idx + 1} of {audioUrls.length}{durationLabel}
                                </div>
                              )}
                              <audio
                                controls
                                src={audioUrl}
                                aria-label={audioUrls.length > 1 ? `Part ${idx + 1} of ${audioUrls.length}` : "Session recording"}
                                style={{ width: "100%", maxWidth: 480, display: "block" }}
                              />
                            </div>
                          );
                        })}
                      </section>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ marginTop: 20 }}>
          <PaginationNav />
        </div>
      </div>
    </div>
  );
}
