"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useId, useState } from "react";

import { AuthFieldError } from "@/components/auth/AuthFieldError";
import { AuthShell } from "@/components/auth/AuthShell";
import { GoogleSignInSection } from "@/components/auth/GoogleSignInSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRetryAfterCountdown } from "@/hooks/useRetryAfterCountdown";
import { credentialsSignIn } from "@/lib/auth-client";

// Map URL ?error= param values (NextAuth error codes + app-defined codes) to
// internal error keys for rendering.  This fires when NextAuth redirects to
// /login?error=... instead of returning an error object inline (safety net).
function mapUrlError(e: string | null): string | null {
  if (!e) return null;
  // NextAuth credentials failure — should normally be caught inline, but handle
  // it here as a fallback in case of an unexpected redirect.
  if (e === "CredentialsSignin") return "credentials";
  // App-defined: Google OAuth signIn callback returned /login?error=not_authorized
  if (e === "not_authorized" || e === "AccessDenied") return "access_denied";
  // NextAuth OAuth-flow errors
  if (
    e === "OAuthSignin" ||
    e === "OAuthCallback" ||
    e === "OAuthCreateAccount" ||
    e === "OAuthAccountNotLinked"
  )
    return "oauth_error";
  // NextAuth configuration / catch-all errors
  return "server_error";
}

export default function LoginForm({
  googleOAuthAvailable,
}: {
  googleOAuthAvailable: boolean;
}) {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/admin";
  const resetOk = searchParams.get("reset") === "1";
  const registeredOk = searchParams.get("registered") === "1";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Seed error state from URL param (safety-net for NextAuth redirects).
  const [error, setError] = useState<string | null>(() =>
    mapUrlError(searchParams.get("error"))
  );
  const { retryAfterSec, isRateLimited, startCountdown } = useRetryAfterCountdown();
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [setupHint, setSetupHint] = useState(false);
  const formErrorId = useId();

  useEffect(() => {
    fetch("/api/setup-required")
      .then((r) => r.json())
      .then((data: { setupRequired?: boolean; autoRedirectToSetup?: boolean }) => {
        if (data.setupRequired && data.autoRedirectToSetup) {
          window.location.href = "/setup";
          return;
        }
        if (data.setupRequired) setSetupHint(true);
        setReady(true);
      })
      .catch(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <AuthShell title="Welcome back" description="Loading…">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Welcome back"
      description="Sign in with your tutor account."
      footer={
        <p>
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-brand underline-offset-2 hover:underline">
            Sign up
          </Link>
        </p>
      }
    >
      {registeredOk ? (
        <p className="mb-4 text-sm text-success" role="status">
          Account created. Sign in with the email and password you just chose.
        </p>
      ) : null}
      {setupHint ? (
        <p className="mb-4 text-sm text-muted-foreground">
          No admin exists yet. On production, set <code className="text-xs">SETUP_SECRET</code> in
          your host env, redeploy, then open <code className="text-xs">/setup?token=…</code> with that
          value (see <code className="text-xs">docs/DEPLOY.md</code>). Or set{" "}
          <code className="text-xs">ADMIN_EMAIL</code> / <code className="text-xs">ADMIN_PASSWORD</code>{" "}
          and sign in here.
        </p>
      ) : null}
      {resetOk ? (
        <p className="mb-4 text-sm text-success" role="status">
          Your password was updated. Sign in with your new password.
        </p>
      ) : null}

      {googleOAuthAvailable ? (
        <div className="mb-4">
          <GoogleSignInSection callbackUrl={callbackUrl} />
        </div>
      ) : null}

      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (isRateLimited) return;

          setBusy(true);
          setError(null);

          const result = await credentialsSignIn(email, password, callbackUrl);

          if (result.ok) {
            window.location.href = result.url;
            return;
          }

          if (result.error === "rate_limited") {
            startCountdown(result.retryAfterSec);
            setError("too_many_requests");
            setPassword("");
          } else if (result.error === "credentials") {
            setError("credentials");
            setPassword("");
          } else {
            setError("network");
          }

          setBusy(false);
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
            required
            className="min-h-11"
            aria-invalid={error === "credentials" ? true : undefined}
            aria-describedby={error ? formErrorId : undefined}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
            required
            className="min-h-11"
            aria-invalid={error === "credentials" ? true : undefined}
            aria-describedby={error ? formErrorId : undefined}
          />
          <p className="text-sm">
            <Link
              href="/forgot-password"
              className="text-brand underline-offset-2 hover:underline"
            >
              Forgot your password?
            </Link>
          </p>
        </div>

        {error === "credentials" ? (
          <AuthFieldError id={formErrorId}>
            Email or password is incorrect.{" "}
            <Link
              href="/forgot-password"
              className="underline underline-offset-2 hover:text-destructive/80"
            >
              Reset your password
            </Link>{" "}
            if you&apos;ve forgotten it.
          </AuthFieldError>
        ) : null}
        {error === "too_many_requests" ? (
          <AuthFieldError
            id={formErrorId}
            message={`Too many attempts — please wait${retryAfterSec ? ` ${retryAfterSec} second${retryAfterSec !== 1 ? "s" : ""}` : " a minute"} and try again.`}
          />
        ) : null}
        {error === "network" ? (
          <AuthFieldError
            id={formErrorId}
            message="Couldn't reach Mynk. Check your internet, then try again."
          />
        ) : null}
        {error === "access_denied" ? (
          <AuthFieldError
            id={formErrorId}
            message="This account doesn't have access to Mynk. Contact your administrator to get set up."
          />
        ) : null}
        {error === "oauth_error" ? (
          <AuthFieldError
            id={formErrorId}
            message="Sign-in failed. Try a different method, or contact your administrator."
          />
        ) : null}
        {error === "server_error" ? (
          <AuthFieldError
            id={formErrorId}
            message="Sign-in is temporarily unavailable. Please try again in a moment."
          />
        ) : null}

        <div className="flex flex-col gap-3 pt-1">
          <Button
            type="submit"
            disabled={busy || isRateLimited}
            aria-busy={busy}
            className="min-h-11 w-full text-base"
          >
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </div>
      </form>
    </AuthShell>
  );
}
