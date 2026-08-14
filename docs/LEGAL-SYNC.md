# Legal sync — `/privacy` and `/terms` ↔ www.mortensenapps.com

## Standing hard rule — honesty (Andrew 2026-07-09)

**Terms and Privacy must be honest at all times** — especially anything that ships on **`master` / production**. Do not claim retention schedules, deletion clocks, subprocessors, or product capabilities the codebase does not implement. Prefer accurate softer wording over aspirational copy. **Preview branches** have a little more leeway (Andrew-only smoke; nobody else uses them), but still prefer truthfulness; never use preview as an excuse to leave dishonest copy on a path that will merge to master.

This is **non-negotiable** and pairs with SEC-POLICY-TRUTH (interim product-facade honesty + retention lifecycle later). Umbrella `mortensenapps.com` may still differ until upstream is updated — product facade must not over-promise relative to *this* app.

---

**`https://www.mortensenapps.com/privacy` and `https://www.mortensenapps.com/terms`
are the authoritative legal source for any product under the Mortensen
Apps umbrella.** Those exact URLs (with the `www.` subdomain) are the
ones Google's OAuth verification team has been reviewing across multiple
rounds and the URLs registered in the OAuth consent screen for the
shared "Mortensen Apps" OAuth client that Tutoring Notes uses (confirmed
from Google Cloud Console 2026-05-17, screenshot attached to the
follow-up chat). The verification history lives in the mortensenapps.com
site repo — see "Source of truth" below. Anything Google vets there is
the policy that legally governs the products, including Tutoring Notes.

Tutoring Notes ships **its own local copies** at `/privacy` and `/terms`,
but those are **subordinate facades** of the umbrella, not a parallel
canonical source — they are NOT registered with Google as policy URLs
for this OAuth client. The local copies exist to:

1. **Add product-specific sections the umbrella deliberately omits** —
   session audio recordings (Vercel Blob + OpenAI Whisper), whiteboard
   stroke logs and snapshots, parent/student share-link surfaces. The
   umbrella covers the policy framework; this product page enumerates
   what's specifically processed inside Tutoring Notes.
2. **Adapt the Children section for the tutoring context.** The umbrella
   has a generic "Children" section; Tutoring Notes processes minor-data
   as a normal-path user category (students), so the product copy
   elaborates on tutor consent responsibility and revocable share links.
3. **Provide a product-specific contact path** so privacy / data-deletion
   requests for Tutoring Notes don't dilute the umbrella inbox.

The preamble paragraph on each TSX page explicitly tells readers that the
umbrella *governs* and the local copy *supplements*. That hierarchy is the
load-bearing legal posture; this doc and the file headers must not
contradict it.

## Confirmed state of Google verification (2026-05-17)

Andrew shared the Google Cloud Console OAuth consent screen Branding tab
for the shared "Mortensen Apps" OAuth client. Confirmed values:

| Setting | Registered value |
|---------|------------------|
| App name | **Mortensen Apps** |
| User support email | `arangarx@gmail.com` |
| Application home page | `https://www.mortensenapps.com/` |
| Application privacy policy link | **`https://www.mortensenapps.com/privacy`** |
| Application terms of service link | **`https://www.mortensenapps.com/terms`** |
| Authorized domain 1 | `tutoring-notes.vercel.app` |
| Authorized domain 2 | `mortensenapps.com` |
| Authorized domain 3 | `usemynk.com` (added 2026-05-30; production canonical app host) |
| Developer contact | `arangarx@gmail.com` |

**What this means operationally:**

- **The privacy + terms URLs Google enforces against are the `www.`
  mortensenapps.com URLs.** Tutoring Notes' local `/privacy` + `/terms`
  pages are **NOT registered with Google for this OAuth client.** Changes
  to the local TSX pages do not trigger Google re-verification on their
  own.
- **`tutoring-notes.vercel.app` is an Authorized Domain** so that the
  OAuth callback (`tutoring-notes.vercel.app/api/auth/gmail/callback`)
  resolves correctly when a tutor connects Gmail. Authorized Domains
  control where redirects + OAuth flows can land; they do not promote
  the domain's URLs to "verified policy URL" status.
- **The OAuth consent screen users see says "Mortensen Apps"**, not
  "Tutoring Notes." For users who signed up for Tutoring Notes, the
  consent screen branding is the umbrella name. This is intentional
  umbrella-branding and out of scope for the legal-sync doc, but worth
  flagging as a UX consideration for any future Connect-Gmail flow
  copy or onboarding.

**Implication for the sync protocol** (codified in "Sync protocol"
below): when the umbrella legally changes, the operational
re-verification check is **the consent screen settings + the live
`www.mortensenapps.com/*` content**, not the tutoring-notes pages.
The tutoring-notes pages should still be synced (so users + search
engines see consistent text), but that sync is in-product hygiene, not
a Google compliance gate.

## Decision (2026-05-30) -- Path A: keep umbrella OAuth

**Andrew's decision after a legal/OAuth analysis (usemynk.com brand-domain
cutover, 2026-05-30):** keep the shared **"Mortensen Apps"** Google OAuth
consent screen for ALL products for now (**Path A -- umbrella OAuth**).

- The consent screen's registered **homepage / privacy / terms URLs stay
  `https://www.mortensenapps.com/*`** (already brand-verified). These are
  NOT changing.
- **`usemynk.com` is added ONLY as an Authorized domain + redirect URIs**
  (see operational-snapshot table above -- Authorized domain 3). It is
  **NOT** registered as a legal-surface (homepage/privacy/terms) URL.
- The product `usemynk.com/privacy` + `/terms` pages remain **subordinate
  facades**, unchanged, and are **NOT** inspected by Google verification.
- **Rationale:** avoid per-app legal-surface verification overhead. Revisit
  a usemynk-branded consent screen (**Path B -- dedicated per-product OAuth
  brand**) only if/when a dedicated per-product OAuth brand is justified
  (Andrew: "maybe hire someone to set that up later").

**To-do (re-verification round):** adding `usemynk.com` as an authorized
domain requires re-submitting branding for Google verification. Verify
`usemynk.com` ownership in Google Search Console under `arangarx@gmail.com`
first, then re-submit. The consent screen will continue to display
"Mortensen Apps".

## Source of truth

- **Umbrella canonical text + verification history:** the
  `mortensenapps.com` site repository, currently at
  **`C:\Users\arang\Documents\Andrew\dev\agenticPipeline\pipeline-projects\mortensen-apps-site`**
  (path provided by Andrew 2026-05-18; the site repo has not yet been
  moved to the `agentic-projects/` parent alongside this app — update
  this reference when it moves). Static HTML site, not Next.js;
  `privacy/index.html` and `terms/index.html` are the canonical files.
  The commit history of that repo captures the iteration with the
  Google verification team across rounds — invaluable context when the
  umbrella next changes. Known Google-verification-driven commits as of
  2026-05-18:
    - `89f3cc9` (2026-04-22) — Initial site: home, privacy, terms for OAuth verification.
    - `9422b0a` (2026-04-22) — Contact: primary `arangarx@gmail.com`; per-app support on home.
    - `b0aa270` (2026-05-12) — Homepage: Tutoring Notes purpose for OAuth verification.
    - `b3483b6` (2026-05-12) — **Privacy: sharing/recipients and security (Google verification).** +82 lines. Most load-bearing — added the full `Sharing, disclosure, and recipients` enumerated list and the full `Security` enumerated list (including the Limiting-data-use bullet). DO NOT lose any content from this commit when editing.
- **Pending umbrella drafts (not yet shipped):** see
  `docs/legal-drafts/umbrella-pending-2026-05-18.md` in this repo for
  the PostHog analytics expansion + AI-improvement section that the
  Phase 11a + 11b bootstrappers depend on. That draft also documents
  the must-preserve-verbatim blocks from each prior Google round so
  the next umbrella edit can't accidentally delete verified content.
- **Live deployed umbrella copy:** `https://www.mortensenapps.com/privacy`
  and `https://www.mortensenapps.com/terms` (the www subdomain — exact
  match to the registered consent-screen URLs; the apex
  `mortensenapps.com/*` resolves to the same content, but referencing
  the registered form keeps everything string-aligned with Google's
  records).
- **Tutoring Notes local copies:** `src/app/privacy/page.tsx` and
  `src/app/terms/page.tsx` in this repo.
- **Google Cloud Console OAuth consent screen:** as confirmed above
  (2026-05-17). Re-confirm during quarterly drift review.

## What's umbrella-derived vs. product-specific

### `/privacy` (`src/app/privacy/page.tsx`)

| Section | Source |
|---------|--------|
| Preamble + umbrella reference link | Product (acknowledges sync) |
| What Tutoring Notes is | Product |
| What data we collect | **Hybrid** — umbrella framing, product-specific inventory |
| How we use your data | **Umbrella** — includes the "do not sell Google user data" and "do not sell personal information to data brokers" language verbatim |
| Sharing, disclosure, and recipients | **Umbrella** — full bulleted enumeration (Google / Infrastructure / People you direct / Legal / Business transfers). Product-specific subprocessors (Vercel, Neon, Vercel Blob, OpenAI) listed under Infrastructure. |
| Google account and Gmail | **Hybrid** — umbrella's Limited Use / scope / token-storage / disconnect language + product-specific scope details (`gmail.send`, `userinfo.email`) and Settings → Email instruction |
| Google Calendar (Connect Google Calendar) | **Hybrid** — umbrella Limited Use / token-storage / disconnect framing + product-specific scope details (`calendar.events`, `calendar.readonly`, `userinfo.email`), honest no-sync-yet stub, Settings → Calendar integrations instruction |
| AI note generation (OpenAI) | Product |
| Session audio recordings (Vercel Blob) | Product |
| Where data is stored | Product |
| Data retention and deletion | **Hybrid** — umbrella framing, product-specific delete-from-app instruction. **Expanded 2026-05-31:** added COPPA §312.10 child-specific retention schedule paragraph (active relationship + 24 months post-closure; no indefinite retention; verified deletion requests honored earlier). Original general-retention and delete-from-app paragraph preserved verbatim. |
| Security | **Umbrella** — full enumerated list (encryption in transit / hosting / authentication / secrets / Limited Use). Product-specific bcrypt password storage added. |
| Children | **Hybrid** — umbrella's framing, product-specific tutor-consent and share-link minor handling. **Expanded 2026-05-31:** added full COPPA §312.10 children's data inventory, subprocessor disclosure, retention schedule (active + 24 months), parental rights bullet list (review/delete/revoke), deletion-request contact path, consent-revocation two-track mechanics, and educational-use consent disclosure. The original tutor-responsibility and share-link paragraphs are preserved verbatim; COPPA disclosures are a separate adjacent `<div>` headed "Children's data and parental rights (COPPA)". |
| Changes | **Umbrella** |
| Contact | Product — uses `arangarx+tutoringnotes@gmail.com` for product-specific addressing, links to mortensenapps.com for general inquiries |

### `/terms` (`src/app/terms/page.tsx`)

| Section | Source |
|---------|--------|
| Preamble + umbrella reference link | Product |
| The service | Product |
| Eligibility and accounts | **Umbrella** |
| Acceptable use | **Hybrid** — umbrella's bulleted list verbatim + 2 tutoring-specific bullets (consent for student data; consent for recording/replay sharing) |
| Your content | Product |
| Gmail integration | Product |
| Google Calendar integration | Product |
| Third-party services | **Hybrid** — umbrella's framing, product-specific subprocessor list with link to privacy policy |
| Children and parental consent | **Hybrid** — umbrella now has this section (added 2026-05-31 on `coppa-312-10-disclosure` branch); product facade adds Tutoring-Notes-specific COPPA language (COPPA applicability, representation-of-consent, cross-reference to privacy policy COPPA section). |
| Availability and changes | Product (combines umbrella's posture with product-specific notification language) |
| Disclaimers | **Umbrella** — adds product-specific "Educational outcomes are not guaranteed" sentence |
| Limitation of liability | **Umbrella** — **VERBATIM**, including the $50 / 12-month-of-fees cap. Do not alter without legal review. |
| Indemnity | **Umbrella** |
| Changes | **Umbrella** |
| Governing law | **Umbrella** |
| Contact | Product — `arangarx+tutoringnotes@gmail.com` for product-specific, links to mortensenapps.com for general |

## Sync protocol (when umbrella changes)

The umbrella is canonical. When `www.mortensenapps.com/privacy` or
`www.mortensenapps.com/terms` is updated (or when the mortensenapps.com site
repo lands a verification-team-driven change before the deploy):

1. **Source the new umbrella text from the mortensenapps.com site repo**
   if accessible (preferred — preserves the verification-round context).
   Otherwise fetch both umbrella URLs and diff against the previous sync
   date. The sync date is in the top-of-file React doc-comment in each
   TSX file.
2. **For each changed umbrella section:** locate the matching section in
   the product file (use the tables above), update the umbrella-derived
   text **verbatim**, preserving any hybrid product-specific additions.
3. **Update the top-of-file sync date** in both TSX files to the new
   sync date.
4. **Update the "Last updated" date** displayed in the UI on both pages.
5. **Update this doc's tables** if any section's umbrella/product/hybrid
   classification changed.
6. **Verify visually** on Vercel Preview that both pages render correctly
   (no broken JSX, no orphaned `&ldquo;`/`&rdquo;` escapes, no broken links).
7. **Re-check the Google Cloud Console OAuth consent screen** — verify
   the URLs registered there (umbrella vs. tutoring-notes domain) and
   ensure the policy text at those URLs reflects the verified umbrella
   version. If the umbrella changed Gmail Limited Use language or the
   no-sale clauses, those are the changes most likely to interest a
   future verification reviewer.
8. **Commit** with a message like `legal: sync /privacy and /terms with
   mortensenapps.com (2026-MM-DD)`.

## Cadence

- **Andrew updates mortensenapps.com** → sync to tutoring-notes within the
  same evening, or open an issue / mark a TODO in the master plan.
- **Google announces a Limited Use policy change** → priority: update
  umbrella first, then this product, before next deploy.
- **Quarterly review** (every ~3 months) — diff product vs. umbrella even
  if no notification triggered, catch drift from edits made without going
  through this protocol.

## Anti-drift safeguards

- The top-of-file doc-comment in each TSX file references this doc by
  name so the next maintainer (Andrew, or a future executor) sees the
  sync requirement before touching the file.
- The footer of each page links to the umbrella version so a careful
  reader can spot drift even without dev access.
- This doc is referenced from `AGENTS.md` (added in the same commit as
  the initial sync, 2026-05-17) so orchestrators reviewing executor
  bootstrappers will not miss the requirement when scoping legal-copy
  changes.

## History

- **2026-05-31** — COPPA §312.10 compliance sync (disclosure floor, not counsel-gated per
  Andrew 2026-05-31 decision). Branch `coppa-312-10-disclosure` in the umbrella repo;
  product facades committed on `v1-redesign`. ADDITIVE-ONLY changes to umbrella; no
  existing clause, heading, or sentence was removed or reworded.
  - **Umbrella `privacy/index.html`:** added COPPA para to "Retention and deletion"
    (no indefinite retention, written policy, product-specific schedule, parental
    deletion-request cross-reference); expanded "Children" section with VPC requirement,
    parent rights bullet list (review/direct-delete/revoke), two-track revocation
    mechanics, and children's PI retention cap. Last updated: May 31, 2026.
  - **Umbrella `terms/index.html`:** added new "Children and parental consent" section
    between Third-party services and Disclaimers (COPPA applicability, representation-
    of-consent, parental-rights cross-reference to product privacy notice). Last updated:
    May 31, 2026.
  - **Product `privacy/page.tsx`:** added LearnerProfile, session transcripts, and
    parent-for-consent items to "What data we collect"; updated "Session audio recordings"
    to explicitly name OpenAI as subprocessor on `/v1/audio/transcriptions` (no training);
    added COPPA §312.10 child retention schedule paragraph to "Data retention and
    deletion"; expanded "Children" section (original two paragraphs preserved verbatim)
    with adjacent new `<div>` "Children's data and parental rights (COPPA)" covering
    full COPPA data inventory, subprocessor disclosure, how-we-use statement, 24-month
    retention schedule, parental rights bullet list, two-track revocation disclosure,
    and educational-use consent disclosure. Contact path:
    `arangarx+tutoringnotes@gmail.com`. Last updated / SYNCED FROM: May 31, 2026.
  - **Product `terms/page.tsx`:** added new "Children and parental consent" section
    before Disclaimers; updated SYNCED FROM and Last updated dates.
  - **LEGAL-SYNC.md:** updated /privacy table rows for "Children" and
    "Data retention and deletion"; added "Children and parental consent" row to /terms
    table; added this history entry.

- **2026-05-17** — initial sync. Brought tutoring-notes copies in line
  with the umbrella's full Sharing/Disclosure list, Limited Use
  language, Children section, $50 liability cap, Indemnity, and
  Governing Law sections. Previous product copies (April 2026) were
  missing several Google-OAuth-defense-relevant clauses.
- **2026-05-17 (same evening) — framing correction.** Original commit
  message and an earlier draft of this doc overstated "Google OAuth
  verification is anchored to the tutoring-notes domain's /privacy
  URL." That was an unvalidated assumption. Andrew clarified the
  verification rounds have been against the mortensenapps.com
  umbrella, and the mortensenapps.com site repo holds the verification
  history. Doc rewritten to reflect mortensenapps.com is the canonical
  legal source and the tutoring-notes local copies are subordinate
  facades. The shipped TSX content was already coherent under the
  corrected framing (the in-UI preamble correctly positions the
  umbrella as governing and the local copy as supplementing); only
  the developer-facing rationale needed correction.
- **2026-05-17 (same evening) — verification state confirmed.**
  Andrew shared the Google Cloud Console OAuth consent screen
  Branding tab. Confirmed: the consent screen registers
  `https://www.mortensenapps.com/privacy` and
  `https://www.mortensenapps.com/terms` as the Application policy URLs;
  `tutoring-notes.vercel.app` and `mortensenapps.com` are both
  Authorized Domains (so the OAuth callback resolves on the Vercel
  domain), but the tutoring-notes app's `/privacy` and `/terms` URLs
  are not registered as policy URLs. App name is "Mortensen Apps,"
  not "Tutoring Notes." Local TSX links updated from apex
  `mortensenapps.com/*` to `www.mortensenapps.com/*` to exact-match
  the consent-screen registration. The earlier "pending action item"
  in this doc is now resolved (see "Confirmed state" section above).
