import { NextResponse } from "next/server";
import { completePasswordReset } from "@/lib/password-reset";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const token = "token" in body && typeof body.token === "string" ? body.token : "";
  const password = "password" in body && typeof body.password === "string" ? body.password : "";

  if (!token || !password) {
    return NextResponse.json(
      { ok: false, error: "Token and password are required." },
      { status: 400 }
    );
  }

  const result = await completePasswordReset(token, password);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
