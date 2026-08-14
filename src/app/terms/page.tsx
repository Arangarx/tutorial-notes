import type { Metadata } from "next";
import Link from "next/link";

import { LegalDocumentShell } from "@/components/LegalDocumentShell";
import { Separator } from "@/components/ui/separator";

/**
 * Terms of Service — Tutoring Notes (product subordinate facade).
 *
 * SYNCED FROM https://www.mortensenapps.com/terms as of 2026-05-31.
 * Product-specific COPPA cross-reference updated 2026-07-09 (SEC-POLICY-TRUTH interim).
 * Google Calendar connect section added 2026-08-14 (honest stub — no sync claim).
 *
 * The Mortensen Apps umbrella terms at www.mortensenapps.com/terms are
 * the CANONICAL legal source for eligibility / acceptable use /
 * disclaimers / limitation of liability (incl. the $50 dollar cap) /
 * indemnity / governing law, and the URL registered in the shared
 * "Mortensen Apps" OAuth consent screen Tutoring Notes uses (confirmed
 * from Google Cloud Console 2026-05-17). This file is a local
 * subordinate facade that embeds those sections verbatim and layers
 * product-specific sections on top — Your content, Gmail integration
 * specifics, Availability. The in-UI preamble paragraph on this page
 * explicitly tells readers the umbrella governs. This URL is NOT
 * registered with Google as a policy URL for the OAuth client.
 *
 * MAINTENANCE: when www.mortensenapps.com/terms changes, update the
 * embedded sections here verbatim from the upstream + bump the "Last
 * updated" date + bump the SYNCED FROM date above. See
 * docs/LEGAL-SYNC.md for the sync protocol and the per-section
 * umbrella-vs-product classification table.
 */

export const metadata: Metadata = {
  title: "Terms of Use — Tutoring Notes",
  description: "Terms of use for the Tutoring Notes application.",
};

export default function TermsPage() {
  return (
    <LegalDocumentShell title="Terms of Use" lastUpdated="August 14, 2026">
        <p className="text-sm leading-relaxed text-muted-foreground">
          These terms govern your use of <strong>Tutoring Notes</strong>, a web
          application operated by Andrew Mortensen (&ldquo;Operator,&rdquo; &ldquo;we,&rdquo;
          &ldquo;us&rdquo;) under the Mortensen Apps umbrella. They supplement the umbrella
          terms of service at{" "}
          <a href="https://www.mortensenapps.com/terms" target="_blank" rel="noreferrer">
            www.mortensenapps.com/terms
          </a>. By using the app, you agree to these terms.
        </p>

        <Separator className="my-5" />

        <section className="grid gap-4">
          <div>
            <h2 className="heading m-0 text-lg font-normal">The service</h2>
            <p style={{ margin: "8px 0 0" }}>
              Tutoring Notes is a web application that helps tutors record session
              audio, draft notes, run a shared whiteboard, and share read-only updates
              with students and parents.
            </p>
          </div>

          <div>
            <h2 className="heading m-0 text-lg font-normal">Eligibility and accounts</h2>
            <p style={{ margin: "8px 0 0" }}>
              You must be able to form a binding contract and, where applicable, have
              permission from your organization to use the service. You are responsible
              for safeguarding your account credentials and for activity under your
              account. You must not share your account with others.
            </p>
          </div>

          <div>
            <h2 className="heading m-0 text-lg font-normal">Acceptable use</h2>
            <p style={{ margin: "8px 0 0" }}>You agree not to:</p>
            <ul style={{ margin: "8px 0 0", paddingLeft: 20, lineHeight: 1.7 }}>
              <li>Use the service to violate law or third-party rights.</li>
              <li>Attempt to access data or systems you are not authorized to use.</li>
              <li>Interfere with or disrupt the service or its infrastructure.</li>
              <li>Use automated means to abuse, scrape, or overload the service without permission.</li>
              <li>Send unsolicited bulk email or deceptive messages through any integration (including Gmail).</li>
              <li>Enter student or parent information without obtaining any consent required for that data and the use you intend.</li>
              <li>Record session audio or share whiteboard / audio replays without obtaining appropriate consent, especially for sessions involving minors.</li>
            </ul>
          </div>

          <div>
            <h2 className="heading m-0 text-lg font-normal">Your content</h2>
            <p style={{ margin: "8px 0 0" }}>
              You retain ownership of the notes, student information, audio recordings,
              whiteboard content, and other content you enter. By using the service,
              you grant us permission to store and transmit that content as needed to
              operate the product (for example, storing notes in the database, storing
              audio in object storage, sending emails you initiate, generating share
              links you create, and processing audio through the transcription
              provider described in the privacy policy).
            </p>
          </div>

          <div>
            <h2 className="heading m-0 text-lg font-normal">Gmail integration</h2>
            <p style={{ margin: "8px 0 0" }}>
              If you connect your Gmail account, the app sends emails on your behalf
              only when you explicitly click &ldquo;Send update.&rdquo; You can disconnect
              at any time from Settings → Email. Your use of Gmail is also subject to
              Google&apos;s own terms of service.
            </p>
          </div>

          <div>
            <h2 className="heading m-0 text-lg font-normal">Google Calendar integration</h2>
            <p style={{ margin: "8px 0 0" }}>
              If you connect Google Calendar, the app stores your OAuth connection for upcoming
              scheduling features. <strong>Calendar sync is not live yet</strong> — we do not
              currently create, update, delete, or watch calendar events on your behalf. You can
              disconnect at any time from Settings → Calendar integrations. Your use of Google
              Calendar is also subject to Google&apos;s own terms of service.
            </p>
          </div>

          <div>
            <h2 className="heading m-0 text-lg font-normal">Third-party services</h2>
            <p style={{ margin: "8px 0 0" }}>
              The service relies on third parties (for example hosting, database, object
              storage, Google OAuth, OpenAI for transcription and note generation, and
              email delivery). Your use of those features is also subject to the third
              party&apos;s terms and policies. We are not responsible for outages or
              changes caused solely by third-party platforms. The current list of
              subprocessors is in the{" "}
              <Link href="/privacy">privacy policy</Link>.
            </p>
          </div>

          <div>
            <h2 className="heading m-0 text-lg font-normal">Availability and changes</h2>
            <p style={{ margin: "8px 0 0" }}>
              We aim to keep the service available but do not guarantee uptime.
              Features may change or be removed. We will make reasonable efforts to
              notify users of significant changes via the app or by email where
              practical.
            </p>
          </div>

          <div>
            <h2 className="heading m-0 text-lg font-normal">Children and parental consent</h2>
            <p style={{ margin: "8px 0 0" }}>
              Tutoring Notes knowingly serves students who may be under 13 and is subject
              to the Children&rsquo;s Online Privacy Protection Act (COPPA),
              16&nbsp;CFR Part&nbsp;312. By entering a child under 13 into the platform as
              a student, the account holder (parent or guardian) represents that they are
              that child&rsquo;s parent or legal guardian and that they have reviewed and
              consented to the privacy practices described in our{" "}
              <Link href="/privacy">privacy policy</Link>, including the collection of
              session audio recordings, transcripts, and notes.
            </p>
            <p style={{ margin: "8px 0 0" }}>
              Parents and legal guardians retain the right to review, request deletion of,
              and revoke consent for their child&rsquo;s personal information at any time.
              See the <Link href="/privacy">privacy policy</Link> — specifically the{" "}
              &ldquo;Children&rsquo;s data and parental rights (COPPA)&rdquo; section — for
              how to exercise these rights, our retention practices, and the contact address
              for deletion requests. Withdrawing consent stops future data collection; it
              does not automatically delete data already collected under prior consent.
              Deletion requests are honored upon verification.
            </p>
          </div>

          <div>
            <h2 className="heading m-0 text-lg font-normal">Disclaimers</h2>
            <p style={{ margin: "8px 0 0" }}>
              The service is provided &ldquo;as is&rdquo; and &ldquo;as available.&rdquo; To the
              fullest extent permitted by law, we disclaim implied warranties of
              merchantability, fitness for a particular purpose, and non-infringement.
              We do not guarantee uninterrupted or error-free operation. Educational
              outcomes are not guaranteed.
            </p>
          </div>

          <div>
            <h2 className="heading m-0 text-lg font-normal">Limitation of liability</h2>
            <p style={{ margin: "8px 0 0" }}>
              To the fullest extent permitted by law, the Operator will not be liable
              for any indirect, incidental, special, consequential, or punitive damages,
              or loss of profits, data, or goodwill, arising from your use of the
              service. Our total liability for any claim arising out of these terms or
              the service is limited to the greater of (a) the amount you paid us for
              the service in the twelve months before the claim or (b) fifty U.S.
              dollars, if you have not paid a fee.
            </p>
          </div>

          <div>
            <h2 className="heading m-0 text-lg font-normal">Indemnity</h2>
            <p style={{ margin: "8px 0 0" }}>
              You will defend and indemnify the Operator against claims arising from
              your misuse of the service, your content, or your violation of these
              terms, to the extent permitted by law.
            </p>
          </div>

          <div>
            <h2 className="heading m-0 text-lg font-normal">Changes</h2>
            <p style={{ margin: "8px 0 0" }}>
              We may modify these terms or discontinue features. We will post the
              updated terms on this site with a new &ldquo;Last updated&rdquo; date. Material
              changes may also be communicated in-product or by email where practical.
              Continued use after changes constitutes acceptance.
            </p>
          </div>

          <div>
            <h2 className="heading m-0 text-lg font-normal">Governing law</h2>
            <p style={{ margin: "8px 0 0" }}>
              These terms are governed by the laws of the United States, without regard
              to conflict-of-law rules, except where mandatory local consumer protection
              laws apply in your country or region of residence.
            </p>
          </div>

          <div>
            <h2 className="heading m-0 text-lg font-normal">Contact</h2>
            <p style={{ margin: "8px 0 0" }}>
              Questions about these terms specific to Tutoring Notes? Email{" "}
              <a href="mailto:arangarx+tutoringnotes@gmail.com">arangarx+tutoringnotes@gmail.com</a>.
              For general Mortensen Apps legal notices, see{" "}
              <a href="https://www.mortensenapps.com/" target="_blank" rel="noreferrer">
                www.mortensenapps.com
              </a>.
            </p>
          </div>
        </section>

        <Separator className="my-5" />

        <p className="text-[13px] text-muted-foreground">
          <Link href="/">Home</Link> · <Link href="/privacy">Privacy</Link> ·{" "}
          <a href="https://www.mortensenapps.com/terms" target="_blank" rel="noreferrer">
            Umbrella terms of service
          </a>
        </p>
    </LegalDocumentShell>
  );
}
