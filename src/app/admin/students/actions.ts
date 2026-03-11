"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";

export async function createStudent(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Name is required");

  await db.student.create({ data: { name } });
  revalidatePath("/admin/students");
}

