import type { CSSProperties } from "react";

/**
 * Binding Google-reviewer commitment — Google OAuth flows use Mortensen Apps
 * umbrella OAuth client (mortensenapps.com). Credentials auth is usemynk.com.
 */
const VARIANT_COPY = {
  "sign-in":
    "Sign-in is securely handled by Mortensen Apps (mortensenapps.com).",
  "sign-up":
    "Sign-up is securely handled by Mortensen Apps (mortensenapps.com).",
  connect:
    "Connecting Google is handled securely through Mortensen Apps (mortensenapps.com).",
} as const;

export type AuthMortensenNoticeVariant = keyof typeof VARIANT_COPY;

function MortensenAppsLink() {
  return (
    <a
      href="https://www.mortensenapps.com"
      className="text-brand underline-offset-2 hover:underline"
      rel="noopener noreferrer"
      target="_blank"
    >
      mortensenapps.com
    </a>
  );
}

function renderCopy(variant: AuthMortensenNoticeVariant) {
  const text = VARIANT_COPY[variant];
  const [before, after] = text.split("(mortensenapps.com)");
  return (
    <>
      {before}(<MortensenAppsLink />){after}
    </>
  );
}

export function AuthMortensenNotice({
  id,
  variant = "sign-in",
  className = "text-center text-xs leading-relaxed text-muted-foreground",
  style,
}: {
  id?: string;
  variant?: AuthMortensenNoticeVariant;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <p id={id} className={className} style={style}>
      {renderCopy(variant)}
    </p>
  );
}
