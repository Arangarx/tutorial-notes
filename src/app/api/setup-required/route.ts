import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { hasAdminUsers } from "@/lib/auth-db";
import { setupReachableWithoutToken } from "@/lib/setup-guard";

export async function GET() {
  const hasAdmins = await hasAdminUsers();
  const envAuth = !!(env.ADMIN_EMAIL && env.ADMIN_PASSWORD);
  const setupRequired = !hasAdmins && !envAuth;
  /** Only auto-send users to /setup when that page is reachable without ?token= (local dev, no secret). */
  const autoRedirectToSetup = setupRequired && setupReachableWithoutToken();
  return NextResponse.json({ setupRequired, autoRedirectToSetup });
}
