import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { authOptions } from "@/auth-options";
import { db } from "@/lib/db";
import { TwoFactorVerifyForm } from "./TwoFactorVerifyForm";
import { ADMIN_TFA_DEVICE_COOKIE } from "@/lib/admin-trusted-device";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ callbackUrl?: string; td?: string }>;
}

/**
 * Validates a returnTo/callbackUrl to prevent open-redirect attacks.
 * Accepts only same-origin relative paths (starts with / but not //).
 */
function safeReturnTo(url: string | undefined | null): string {
  if (url && /^\/(?!\/)/.test(url)) return url;
  return "/admin";
}

export default async function TwoFactorVerifyPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login");

  // Test accounts are exempt.
  if (session.user.isTestAccount) redirect("/admin");

  const { callbackUrl, td } = await searchParams;

  // Already verified this session.
  if (session.user.twoFactorVerified) {
    redirect(safeReturnTo(callbackUrl));
  }

  // Trusted-device skip: when the trusted-device cookie is present AND the td=0
  // sentinel is absent, route to the Route Handler which is the only context where
  // cookies().set() is legal (Server Component renders throw on cookie writes).
  //
  // Loop-safety: the Route Handler sets td=0 when the skip fails, so a handler
  // failure redirects here with td=0 and we fall through to the TOTP form — at
  // most one round trip, never an infinite loop.
  //
  // REGRESSION NOTE: Prior implementation called tryTrustedDeviceLoginSkip here in
  // the RSC render. mintTwoFactorVerifiedSession's cookies().set() threw
  // "Cookies can only be modified in a Server Action or Route Handler", silently
  // swallowed by the try-catch → skip always returned false → TOTP always shown.
  if (session.user.id && !session.user.isTestAccount && td !== "0") {
    const cookieStore = await cookies();
    if (cookieStore.get(ADMIN_TFA_DEVICE_COOKIE)) {
      const params = new URLSearchParams();
      if (callbackUrl) params.set("callbackUrl", callbackUrl);
      redirect(`/api/auth/2fa/trusted-device-check?${params}`);
    }
  }

  const safe = safeReturnTo(callbackUrl);

  let verifyMethod: "EMAIL_OTP" | "TOTP" = "TOTP";
  if (session.user.id) {
    const admin = await db.adminUser.findUnique({
      where: { id: session.user.id },
      select: {
        email: true,
        twoFactor: { select: { method: true, enrolledAt: true } },
      },
    });
    if (admin?.twoFactor?.enrolledAt) {
      verifyMethod = admin.twoFactor.method;
    }
  }

  return (
    <div className="card" style={{ maxWidth: 480 }}>
      <h1 style={{ marginTop: 0 }}>Two-Factor Verification</h1>
      <p className="muted" style={{ marginBottom: 20 }}>
        {verifyMethod === "EMAIL_OTP"
          ? "Enter the verification code we email to your account."
          : "Enter the code from your authenticator app to continue."}
      </p>
      <TwoFactorVerifyForm callbackUrl={safe} method={verifyMethod} />
    </div>
  );
}
