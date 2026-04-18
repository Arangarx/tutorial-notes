import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth-options";
import { env } from "@/lib/env";
import { getAdminByEmail } from "@/lib/auth-db";
import { db, withDbRetry } from "@/lib/db";

/** Who is viewing the admin UI — DB-backed tutor, legacy env-only login, or nobody. */
export type StudentScope =
  | { kind: "admin"; adminId: string; email: string }
  | { kind: "env"; email: string }
  | { kind: "none" };

export async function getStudentScope(): Promise<StudentScope> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) return { kind: "none" };

  const admin = await withDbRetry(() => getAdminByEmail(email), { label: "getStudentScope" });
  if (admin) return { kind: "admin", adminId: admin.id, email: admin.email };

  if (env.ADMIN_EMAIL && email === env.ADMIN_EMAIL.trim().toLowerCase() && env.ADMIN_PASSWORD) {
    return { kind: "env", email };
  }

  return { kind: "none" };
}

/** Use in server components / actions that must have a logged-in tutor or env admin. */
export async function requireStudentScope(): Promise<Exclude<StudentScope, { kind: "none" }>> {
  const scope = await getStudentScope();
  if (scope.kind === "none") redirect("/login");
  return scope;
}

/** Prisma `where` for listing/creating students for this scope. */
export function studentsWhereForScope(
  scope: Exclude<StudentScope, { kind: "none" }>
): { adminUserId: string } | { adminUserId: null } {
  if (scope.kind === "admin") return { adminUserId: scope.adminId };
  return { adminUserId: null };
}

export function canAccessStudentRow(
  scope: Exclude<StudentScope, { kind: "none" }>,
  student: { adminUserId: string | null }
): boolean {
  if (scope.kind === "admin") return student.adminUserId === scope.adminId;
  return student.adminUserId === null;
}

/** Call at the start of server actions that mutate a student by id. */
export async function assertOwnsStudent(studentId: string): Promise<void> {
  const scope = await requireStudentScope();
  const student = await withDbRetry(
    () =>
      db.student.findUnique({
        where: { id: studentId },
        select: { adminUserId: true },
      }),
    { label: "assertOwnsStudent" }
  );
  if (!student || !canAccessStudentRow(scope, student)) notFound();
}
