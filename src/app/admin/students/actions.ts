"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireStudentScope, studentsWhereForScope } from "@/lib/student-scope";

export async function createStudent(formData: FormData) {
  const scope = await requireStudentScope();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Name is required");

  const where = studentsWhereForScope(scope);
  await db.student.create({
    data: {
      name,
      ...where,
    },
  });
  revalidatePath("/admin/students");
}
