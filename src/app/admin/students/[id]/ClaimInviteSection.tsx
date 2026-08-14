"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Tutor-facing "Send claim invite" control on the student detail page.
 *
 * Gated by NEXT_PUBLIC_CLAIM_INVITES_ENABLED — only renders when the flag is "true".
 * POST /api/students/[studentId]/claim-invites
 * Returns an invite link for copy/share.
 *
 * Handles:
 *   409 "student_already_claimed" — student already has a LearnerProfile
 *   429 "too_many_pending_invites" — 3 pending invites exist
 */
export function ClaimInviteSection({
  studentId,
  studentName,
  alreadyClaimed,
  prominent = false,
}: {
  studentId: string;
  studentName: string;
  alreadyClaimed: boolean;
  /** Larger CTA for top-of-page banner placement. */
  prominent?: boolean;
}) {
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (alreadyClaimed) {
    return (
      <p className="text-sm text-muted-foreground">
        {"This student's account has already been claimed by a parent."}
      </p>
    );
  }

  async function handleSendInvite() {
    setBusy(true);
    setError(null);
    setInviteLink(null);

    try {
      const res = await fetch(`/api/students/${studentId}/claim-invites`, {
        method: "POST",
      });
      const data = (await res.json()) as {
        inviteLink?: string;
        error?: string;
      };

      if (!res.ok) {
        if (data.error === "student_already_claimed") {
          setError("already_claimed");
        } else if (data.error === "too_many_pending_invites") {
          setError("too_many_pending");
        } else {
          setError("server");
        }
        return;
      }

      const link = data.inviteLink ?? null;
      setInviteLink(link);

      // Auto-copy to clipboard on create
      if (link) {
        const fullUrl = `${window.location.origin}${link}`;
        await navigator.clipboard.writeText(fullUrl).catch(() => undefined);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      setError("network");
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    if (!inviteLink) return;
    const fullUrl = `${window.location.origin}${inviteLink}`;
    await navigator.clipboard.writeText(fullUrl).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-3">
      {inviteLink ? (
        <>
          <p className="text-sm text-muted-foreground">
            {copied
              ? `Claim link for ${studentName} — copied to clipboard!`
              : `Share this link with ${studentName}'s parent. It expires in 48 hours.`}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="flex-1 overflow-hidden text-ellipsis rounded border border-border bg-muted px-3 py-2 text-xs">
              {typeof window !== "undefined"
                ? `${window.location.origin}${inviteLink}`
                : inviteLink}
            </code>
            <Button variant="outline" size="sm" onClick={handleCopy}>
              {copied ? "Copied!" : "Copy again"}
            </Button>
          </div>
          <Button variant="ghost" size="sm" onClick={handleSendInvite} disabled={busy}>
            Generate new link
          </Button>
        </>
      ) : (
        <Button
          onClick={handleSendInvite}
          disabled={busy}
          aria-busy={busy}
          size={prominent ? "default" : "sm"}
          variant={prominent ? "accent" : "default"}
          className={prominent ? "min-h-11" : undefined}
          data-testid="create-claim-link-btn"
        >
          {busy ? "Creating link..." : "Create claim link"}
        </Button>
      )}

      {error === "already_claimed" ? (
        <p className="text-sm text-muted-foreground">
          {"This student's account has already been claimed."}
        </p>
      ) : null}
      {error === "too_many_pending" ? (
        <p className="text-sm text-muted-foreground">
          {"Too many pending invites (max 3). Wait for existing links to be used or expire."}
        </p>
      ) : null}
      {error === "server" || error === "network" ? (
        <p className="text-sm text-destructive" role="alert">
          {"Couldn't create invite. Please try again."}
        </p>
      ) : null}
    </div>
  );
}
