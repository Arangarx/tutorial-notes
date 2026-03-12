import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { hasAdminUsers } from "@/lib/auth-db";

export async function GET() {
  const hasAdmins = await hasAdminUsers();
  const envAuth = !!(env.ADMIN_EMAIL && env.ADMIN_PASSWORD);
  const setupRequired = !hasAdmins && !envAuth;
  return NextResponse.json({ setupRequired });
}
