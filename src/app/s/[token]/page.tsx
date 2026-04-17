import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";

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
            orderBy: { date: "desc" },
            take: 12,
            include: {
              recording: {
                select: {
                  id: true,
                  blobUrl: true,
                  mimeType: true,
                  durationSeconds: true,
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
  const tutor = await db.adminUser.findFirst({ select: { displayName: true, email: true } });
  const tutorName = tutor?.displayName?.trim() || tutor?.email?.split("@")[0] || null;

  // Build proxy URLs for notes that have a shared recording.
  // Proxy route handles auth so the browser never needs the blob token.
  const audioUrlMap = new Map<string, string>();
  student.notes.forEach((n) => {
    if (n.shareRecordingInEmail && n.recording?.id) {
      audioUrlMap.set(n.id, `/api/audio/${n.recording.id}?token=${token}`);
    }
  });

  function formatDuration(seconds: number | null): string {
    if (!seconds) return "";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  return (
    <div className="container" style={{ maxWidth: 860 }}>
      <div className="card" style={{ background: "rgba(255,255,255,0.04)" }}>
        <h1 style={{ marginTop: 0 }}>{student.name}</h1>
        <p className="muted" style={{ marginTop: 6 }}>
          {tutorName ? `Notes shared by ${tutorName}` : "Recent session notes"}
        </p>

        <div className="divider" />

        {student.notes.length === 0 ? (
          <p className="muted">No notes yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {student.notes.map((n) => {
              const links = safeJsonArray(n.linksJson);
              const signedAudioUrl = audioUrlMap.get(n.id) ?? null;
              return (
                <div key={n.id} className="card">
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <div style={{ fontWeight: 800 }}>
                      {new Date(n.date).toLocaleDateString()}
                    </div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {n.template ? n.template : ""}
                    </div>
                  </div>
                  <div className="divider" />
                  <div style={{ display: "grid", gap: 12 }}>
                    <section>
                      <div className="muted" style={{ fontSize: 12 }}>
                        Topics covered
                      </div>
                      <div style={{ whiteSpace: "pre-wrap" }}>{n.topics || "—"}</div>
                    </section>
                    <section>
                      <div className="muted" style={{ fontSize: 12 }}>
                        Homework
                      </div>
                      <div style={{ whiteSpace: "pre-wrap" }}>{n.homework || "—"}</div>
                    </section>
                    <section>
                      <div className="muted" style={{ fontSize: 12 }}>
                        Next steps
                      </div>
                      <div style={{ whiteSpace: "pre-wrap" }}>{n.nextSteps || "—"}</div>
                    </section>
                    {links.length ? (
                      <section>
                        <div className="muted" style={{ fontSize: 12 }}>
                          Links
                        </div>
                        <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                          {links.map((u) => (
                            <li key={u}>
                              <a href={u} target="_blank" rel="noreferrer">
                                {u}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </section>
                    ) : null}

                    {/* Session recording — only shown when tutor opted in */}
                    {signedAudioUrl && (
                      <section data-testid="share-page-audio">
                        <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                          Session recording
                          {n.recording?.durationSeconds
                            ? ` · ${formatDuration(n.recording.durationSeconds)}`
                            : ""}
                        </div>
                        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                        <audio
                          controls
                          src={signedAudioUrl}
                          style={{ width: "100%", maxWidth: 480 }}
                        />
                        <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--color-muted, #6b7280)" }}>
                          Recording shared by your tutor for your review.
                        </p>
                      </section>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
