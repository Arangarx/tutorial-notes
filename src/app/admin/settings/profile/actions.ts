"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth-options";
import { updateAdminDisplayName } from "@/lib/auth-db";

export async function saveProfileDisplayName(formData: FormData) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) throw new Error("Not signed in");

  const displayName = String(formData.get("displayName") ?? "").trim() || null;
  await updateAdminDisplayName(email, displayName);
  revalidatePath("/admin/settings/profile");
  revalidatePath("/admin");
}
