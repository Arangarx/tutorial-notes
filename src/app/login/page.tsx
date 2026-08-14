import { Suspense } from "react";

import { AuthShell } from "@/components/auth/AuthShell";
import { env } from "@/lib/env";

import LoginForm from "./LoginForm";

export default function LoginPage() {
  const googleOAuthAvailable = !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

  return (
    <Suspense
      fallback={
        <AuthShell title="Welcome back" description="Loading…">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </AuthShell>
      }
    >
      <LoginForm googleOAuthAvailable={googleOAuthAvailable} />
    </Suspense>
  );
}
