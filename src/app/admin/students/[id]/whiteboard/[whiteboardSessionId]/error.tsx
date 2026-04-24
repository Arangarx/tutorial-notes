"use client";

/**
 * Route-segment error boundary for the whiteboard pages
 * (`/admin/students/[id]/whiteboard/[whiteboardSessionId]/...`).
 *
 * Why this file exists:
 *
 * Without a custom `error.tsx`, Next.js production replaces every
 * thrown server error with the generic "An error occurred in the
 * Server Components render. The specific message is omitted in
 * production builds..." message and only logs the digest server-side.
 * That makes field-debugging impossible — the tutor sees a wall of
 * text but can't tell us which request crashed, and we can't grep
 * Vercel logs without a needle to search for.
 *
 * This boundary surfaces the digest prominently and exposes a "copy
 * digest" button. When Sarah hits the error, she can paste the
 * digest into a bug report; the digest matches the one Next.js
 * logged on the server side, so we can find the actual stack trace
 * in Vercel.
 *
 * It also gives her a "Back to student" escape so she's not stuck on
 * a dead page, and a "Retry" button for transient network/DB hiccups.
 *
 * Scope: this boundary catches errors in BOTH the live workspace
 * surface (`/workspace`) and the review surface
 * (`/[whiteboardSessionId]`) because it sits at the segment that
 * parents both routes. Errors thrown by deeper nested layouts/pages
 * bubble up here.
 */

import { useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function WhiteboardSessionError({ error, reset }: Props) {
  // Mirror to the browser console so Sarah can paste the full block
  // into a bug report from devtools if the digest alone isn't enough.
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[whiteboard route error]", {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
  }, [error]);

  const params = useParams<{ id?: string }>();
  const studentHref = params?.id ? `/admin/students/${params.id}` : "/admin";

  const copyDigest = async () => {
    if (!error.digest) return;
    try {
      await navigator.clipboard.writeText(error.digest);
    } catch {
      // Clipboard can fail in iframe / insecure-context cases; the
      // digest is still visible on screen for manual copy.
    }
  };

  return (
    <div className="container" style={{ maxWidth: 720 }}>
      <div
        className="card"
        style={{
          padding: 24,
          background: "#0d1328",
          border: "1px solid var(--border)",
        }}
      >
        <h1 style={{ marginTop: 0 }}>Whiteboard hit an error</h1>
        <p className="muted" style={{ fontSize: 14 }}>
          The page failed to render. Your data is safe — this only
          affects the current view.
        </p>

        {error.digest ? (
          <div style={{ marginTop: 16 }}>
            <label style={{ marginBottom: 4 }}>Error ID (copy this if you report the bug)</label>
            <div className="row" style={{ gap: 8, alignItems: "stretch" }}>
              <code
                style={{
                  flex: 1,
                  background: "rgba(0,0,0,0.35)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "8px 10px",
                  fontSize: 13,
                  wordBreak: "break-all",
                }}
              >
                {error.digest}
              </code>
              <button type="button" className="btn" onClick={copyDigest}>
                Copy
              </button>
            </div>
          </div>
        ) : null}

        {error.message && process.env.NODE_ENV !== "production" ? (
          <pre
            style={{
              marginTop: 16,
              background: "rgba(0,0,0,0.35)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: 12,
              fontSize: 12,
              overflowX: "auto",
              whiteSpace: "pre-wrap",
            }}
          >
            {error.message}
          </pre>
        ) : null}

        <div className="row" style={{ marginTop: 20, gap: 8 }}>
          <button type="button" className="btn primary" onClick={reset}>
            Try again
          </button>
          <Link href={studentHref} className="btn">
            Back to student
          </Link>
        </div>
      </div>
    </div>
  );
}
