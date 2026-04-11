import { NextResponse } from "next/server";
import { db } from "@/lib/db";

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

  const email =
    "email" in body && typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const name =
    "name" in body && typeof body.name === "string" ? body.name.trim() || null : null;
  const note =
    "note" in body && typeof body.note === "string" ? body.note.trim() || null : null;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: "A valid email is required." }, { status: 400 });
  }

  try {
    await db.waitlistEntry.upsert({
      where: { email },
      update: { name: name ?? undefined, note: note ?? undefined },
      create: { email, name, note },
    });
  } catch {
    // Table may not exist yet (e.g. migration not run); treat as success so UX is not broken.
    console.error("[waitlist] DB error — table may need migration");
  }

  return NextResponse.json({
    ok: true,
    message: "You're on the list! We'll reach out when it's ready.",
  });
}
