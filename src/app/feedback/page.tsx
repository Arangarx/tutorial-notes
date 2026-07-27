"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useActionState, useState } from "react";

import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { Button } from "@/components/ui/button";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { submitFeedback, type FeedbackResult } from "./actions";

export default function FeedbackPage() {
  const { status } = useSession();
  const signedIn = status === "authenticated";
  const homeHref = signedIn ? "/admin" : "/";
  const [kind, setKind] = useState("FEEDBACK");
  const [state, formAction] = useActionState(
    submitFeedback,
    null as FeedbackResult | null
  );

  if (state?.ok) {
    return (
      <>
        <MarketingHeader />
        <main id="main-content" className="px-4 py-10">
          <div className="mx-auto w-full max-w-2xl">
            <Card>
              <CardHeader>
                <CardTitle className="heading text-2xl font-normal">
                  Thanks for the feedback!
                </CardTitle>
                <CardDescription>
                  Your message was received. We read every submission.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="accent">
                  <Link href={homeHref}>
                    {signedIn ? "Back to dashboard" : "Back to home"}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <MarketingHeader />
      <main id="main-content" className="px-4 py-10">
        <div className="mx-auto w-full max-w-2xl">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
              <div className="space-y-1">
                <CardTitle className="heading text-2xl font-normal">Feedback</CardTitle>
                <CardDescription>
                  Found a bug or have a suggestion? Send it here — we read every
                  submission. (No account required.)
                </CardDescription>
              </div>
              <Button asChild variant="outline" size="sm" className="shrink-0">
                <Link href={homeHref}>{signedIn ? "Dashboard" : "Home"}</Link>
              </Button>
            </CardHeader>
            <CardContent>
              <form action={formAction} className="space-y-4">
                <input type="hidden" name="kind" value={kind} />

                <div className="space-y-2">
                  <Label htmlFor="feedback-kind">Type</Label>
                  <Select value={kind} onValueChange={setKind}>
                    <SelectTrigger id="feedback-kind" className="w-full sm:w-48">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FEEDBACK">Feedback</SelectItem>
                      <SelectItem value="BUG">Bug report</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="feedback-contactEmail">Your email (optional)</Label>
                  <Input
                    id="feedback-contactEmail"
                    name="contactEmail"
                    type="email"
                    autoComplete="email"
                    placeholder="So we can reply if needed"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="feedback-message">Message</Label>
                  <Textarea
                    id="feedback-message"
                    name="message"
                    rows={6}
                    placeholder="What should be improved? What went wrong?"
                    required
                    maxLength={10000}
                  />
                </div>

                {/* Honeypot — bots only; humans never see or tab to this field */}
                <div className="sr-only" aria-hidden="true">
                  <Label htmlFor="feedback-companyWebsite">Company website</Label>
                  <Input
                    id="feedback-companyWebsite"
                    name="companyWebsite"
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                  />
                </div>

                {state?.ok === false ? (
                  <p className="text-sm text-destructive" role="alert">
                    {state.error}
                  </p>
                ) : null}

                <div className="flex justify-end pt-2">
                  <FormSubmitButton label="Send" pendingLabel="Sending…" />
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
