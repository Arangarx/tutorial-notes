import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/auth-options";
import { getStudentScope, studentsWhereForScope } from "@/lib/student-scope";
import { isOperatorEmail } from "@/lib/operator";
import { formatDateOnlyDisplay } from "@/lib/date-only";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const scope = await getStudentScope();
  if (scope.kind === "none") redirect("/login");

  const session = await getServerSession(authOptions);
  const operator = isOperatorEmail(session?.user?.email);
  const studentWhere = studentsWhereForScope(scope);

  const [
    studentCount,
    noteCount,
    sentNoteCount,
    unreadFeedbackCount,
    waitlistCount,
    recentNotes,
  ] = await Promise.all([
    db.student.count({ where: studentWhere }),
    db.sessionNote.count({ where: { student: studentWhere } }),
    db.sessionNote.count({ where: { student: studentWhere, status: "SENT" } }),
    operator ? db.feedbackItem.count() : Promise.resolve(0),
    operator
      ? (async () => {
          try {
            return await db.waitlistEntry.count();
          } catch {
            return 0;
          }
        })()
      : Promise.resolve(0),
    db.sessionNote.findMany({
      where: { student: studentWhere },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { student: { select: { name: true } } },
    }),
  ]);

  const stats: { label: string; value: number; href: string }[] = [
    { label: "Students", value: studentCount, href: "/admin/students" },
    { label: "Total notes", value: noteCount, href: "/admin/students" },
    { label: "Notes sent", value: sentNoteCount, href: "/admin/students" },
  ];
  if (operator) {
    stats.push(
      { label: "Feedback items", value: unreadFeedbackCount, href: "/admin/feedback" },
      { label: "Waitlist signups", value: waitlistCount, href: "/admin/waitlist" }
    );
  }

  return (
    <div className="card">
      <h1 style={{ marginTop: 0 }}>Dashboard</h1>
      <p className="muted" style={{ marginTop: 0 }}>Overview of your tutoring practice.</p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
          gap: 12,
          marginTop: 20,
        }}
      >
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="card" style={{ textDecoration: "none" }}>
            <div style={{ fontSize: 32, fontWeight: 800 }}>{s.value}</div>
            <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{s.label}</div>
          </Link>
        ))}
      </div>

      <div className="divider" />

      <h3 style={{ marginTop: 0 }}>Recent notes</h3>
      {recentNotes.length === 0 ? (
        <p className="muted">No notes yet.</p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {recentNotes.map((n) => (
            <Link
              key={n.id}
              href={`/admin/students/${n.studentId}`}
              className="card"
              style={{ display: "block" }}
            >
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{n.student.name}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                    {formatDateOnlyDisplay(n.date)} · {n.status}
                  </div>
                </div>
                <div className="muted" style={{ fontSize: 12 }}>Open →</div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <div className="divider" />

      <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
        <Link className="btn primary" href="/admin/students">
          Students
        </Link>
        <Link className="btn" href="/admin/outbox">
          Outbox
        </Link>
        {operator ? (
          <Link className="btn" href="/admin/feedback">
            Feedback inbox
          </Link>
        ) : null}
        <Link className="btn" href="/admin/settings">
          Settings
        </Link>
      </div>
    </div>
  );
}
