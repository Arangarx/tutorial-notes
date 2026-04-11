"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdminSession } from "@/lib/require-admin";

export async function createStudent(formData: FormData) {
  await requireAdminSession();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Name is required");

  await db.student.create({ data: { name } });
  revalidatePath("/admin/students");
}
