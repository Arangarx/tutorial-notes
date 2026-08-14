"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireStudentScope } from "@/lib/student-scope";

function hasOAuthCalendarModel(): boolean {
  return typeof (db as { oAuthCalendarConnection?: { findFirst: unknown } }).oAuthCalendarConnection
    ?.findFirst === "function";
}

export async function disconnectGoogleCalendar() {
  const scope = await requireStudentScope();
  const adminUserId = scope.kind === "admin" ? scope.adminId : null;
  if (!hasOAuthCalendarModel()) {
    revalidatePath("/admin/settings/integrations");
    redirect("/admin/settings/integrations");
    return;
  }
  try {
    await db.oAuthCalendarConnection.deleteMany({
      where: { provider: "google", adminUserId },
    });
  } catch {
    // table may not exist yet
  }
  revalidatePath("/admin/settings/integrations");
  revalidatePath("/admin/schedule");
  redirect("/admin/settings/integrations");
}
