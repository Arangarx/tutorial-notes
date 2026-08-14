import { AuthMortensenNotice } from "@/components/auth/AuthMortensenNotice";
import { Button } from "@/components/ui/button";

export function GoogleSignInSection({ callbackUrl }: { callbackUrl: string }) {
  const signInHref = `/api/auth/signin/google?${new URLSearchParams({
    callbackUrl,
  }).toString()}`;

  return (
    <div className="space-y-3">
      <AuthMortensenNotice variant="sign-in" />
      {/* Full-page navigation so the server redirect to Google is followed;
          Link would client-navigate and can flash an error on 302 */}
      <Button variant="outline" asChild className="min-h-11 w-full text-base">
        <a href={signInHref}>Sign in with Google</a>
      </Button>
    </div>
  );
}
