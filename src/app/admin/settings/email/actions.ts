"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireOperator } from "@/lib/operator";

function hasOAuthModel(): boolean {
  return typeof (db as { oAuthEmailConnection?: { findFirst: unknown } }).oAuthEmailConnection?.findFirst === "function";
}

export async function disconnectGmail() {
  await requireOperator();
  if (!hasOAuthModel()) {
    revalidatePath("/admin/settings/email");
    redirect("/admin/settings/email");
    return;
  }
  try {
    await db.oAuthEmailConnection.deleteMany({ where: { provider: "gmail" } });
  } catch {
    // table may not exist yet (run prisma db push)
  }
  revalidatePath("/admin/settings/email");
  redirect("/admin/settings/email");
}

export async function saveEmailConfig(formData: FormData) {
  await requireOperator();
  const host = String(formData.get("host") ?? "").trim();
  const port = parseInt(String(formData.get("port") ?? "587"), 10);
  const secure = String(formData.get("secure") ?? "") === "true";
  const user = String(formData.get("user") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const fromEmail = String(formData.get("fromEmail") ?? "").trim() || null;

  if (!host || !user) throw new Error("Host and user are required");

  const existing = await db.emailConfig.findFirst({ orderBy: { updatedAt: "desc" } });
  if (existing) {
    await db.emailConfig.update({
      where: { id: existing.id },
      data: {
        host,
        port: Number.isNaN(port) ? 587 : port,
        secure,
        user,
        ...(password ? { password } : {}),
        fromEmail,
      },
    });
  } else {
    if (!password) throw new Error("Password is required when adding new config");
    await db.emailConfig.create({
      data: { host, port: Number.isNaN(port) ? 587 : port, secure, user, password, fromEmail },
    });
  }

  revalidatePath("/admin/settings/email");
}
