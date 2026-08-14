import { NextRequest, NextResponse } from "next/server";

/** Production deploys must hard-404 test routes even if Playwright sentinels leak. */
export function isPlaywrightTestProductionLocked(): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production"
  );
}

function isPlaywrightTestRouteEnv(): boolean {
  return (
    process.env.NODE_ENV === "test" || process.env.PLAYWRIGHT_TEST === "1"
  );
}

/**
 * Canonical gate for `/api/test/whiteboard/*` Playwright helpers.
 * Returns a response when the request must be rejected; `null` when allowed.
 */
export function guardPlaywrightTestRoute(
  req: NextRequest
): NextResponse | null {
  if (isPlaywrightTestProductionLocked()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!isPlaywrightTestRouteEnv()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const secret = process.env.PLAYWRIGHT_TEST_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
