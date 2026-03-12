import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/auth-options";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.redirect(new URL("/login", process.env.NEXTAUTH_URL ?? "http://localhost:3000"));
  }
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const state = searchParams.get("state");
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const returnTo = (state ? (() => { try { const s = JSON.parse(Buffer.from(state, "base64url").toString()); return s?.returnTo; } catch { return null; } })() : null) ?? "/admin/settings/email";

  if (error) {
    return NextResponse.redirect(new URL(`${returnTo}?error=gmail_denied`, baseUrl));
  }
  if (!code || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.redirect(new URL(`${returnTo}?error=missing_code_or_config`, baseUrl));
  }

  const redirectUri = `${baseUrl}/api/auth/gmail/callback`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    console.error("[gmail/callback] token exchange failed:", err);
    return NextResponse.redirect(new URL(`${returnTo}?error=token_exchange_failed`, baseUrl));
  }
  const tokens = await tokenRes.json();
  const refreshToken = tokens.refresh_token;
  if (!refreshToken) {
    return NextResponse.redirect(new URL(`${returnTo}?error=no_refresh_token`, baseUrl));
  }

  const accessToken = tokens.access_token;
  const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const userInfo = userInfoRes.ok ? await userInfoRes.json() : null;
  const email = userInfo?.email ?? session.user?.email ?? "unknown@gmail.com";

  if (typeof (db as { oAuthEmailConnection?: { create: unknown } }).oAuthEmailConnection?.create !== "function") {
    return NextResponse.redirect(new URL(`${returnTo}?error=db_not_ready`, baseUrl));
  }
  try {
    await db.oAuthEmailConnection.deleteMany({ where: { provider: "gmail" } });
    await db.oAuthEmailConnection.create({
      data: { provider: "gmail", refreshToken, email },
    });
  } catch {
    return NextResponse.redirect(new URL(`${returnTo}?error=db_not_ready`, baseUrl));
  }

  return NextResponse.redirect(new URL(`${returnTo}?connected=gmail`, baseUrl));
}
