import { NextResponse } from "next/server";
import { requestPasswordReset } from "@/lib/password-reset";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const email =
    typeof body === "object" && body !== null && "email" in body && typeof (body as { email: unknown }).email === "string"
      ? (body as { email: string }).email
      : "";

  await requestPasswordReset(email);

  return NextResponse.json({
    ok: true,
    message:
      "If an account exists for that email, we sent reset instructions. Check your inbox.",
  });
}
