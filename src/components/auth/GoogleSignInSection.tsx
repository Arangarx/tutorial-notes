import {
  AuthMortensenNotice,
  type AuthMortensenNoticeVariant,
} from "@/components/auth/AuthMortensenNotice";
import { Button } from "@/components/ui/button";

export function GoogleSignInSection({
  callbackUrl,
  noticeVariant = "sign-in",
  buttonLabel,
}: {
  callbackUrl: string;
  noticeVariant?: AuthMortensenNoticeVariant;
  buttonLabel?: string;
}) {
  const signInHref = `/api/auth/signin/google?${new URLSearchParams({
    callbackUrl,
  }).toString()}`;
  const label =
    buttonLabel ??
    (noticeVariant === "sign-up" ? "Sign up with Google" : "Sign in with Google");

  return (
    <div className="space-y-3">
      <AuthMortensenNotice variant={noticeVariant} />
      {/* Full-page navigation so the server redirect to Google is followed;
          Link would client-navigate and can flash an error on 302 */}
      <Button variant="outline" asChild className="min-h-11 w-full text-base">
        <a href={signInHref}>{label}</a>
      </Button>
    </div>
  );
}
