import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/auth-options";
import { createStudent } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";
import { getStudentScope, studentsWhereForScope } from "@/lib/student-scope";
import { isOperatorEmail } from "@/lib/operator";

export const dynamic = "force-dynamic";

export default async function StudentsPage() {
  const scope = await getStudentScope();
  if (scope.kind === "none") redirect("/login");

  const session = await getServerSession(authOptions);
  const operator = isOperatorEmail(session?.user?.email);

  const students = await db.student.findMany({
    where: studentsWhereForScope(scope),
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Students</h1>
        {operator ? (
          <Link className="btn" href="/admin/outbox">
            View outbox
          </Link>
        ) : null}
      </div>

      <div className="divider" />

      <form action={createStudent}>
        <div className="row" style={{ alignItems: "flex-end" }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <label htmlFor="studentName">Student name</label>
            <input
              id="studentName"
              name="name"
              placeholder="e.g. Jordan S."
              required
            />
          </div>
          <SubmitButton label="Add student" />
        </div>
      </form>

      <div className="divider" />

      {students.length === 0 ? (
        <p className="muted">No students yet. Add one above.</p>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {students.map((s) => (
            <Link
              key={s.id}
              href={`/admin/students/${s.id}`}
              className="card"
              style={{ display: "block" }}
            >
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{s.name}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    Created {new Date(s.createdAt).toLocaleString()}
                  </div>
                </div>
                <div className="muted">Open →</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

