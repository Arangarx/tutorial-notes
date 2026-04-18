# Tutoring Notes — Backlog

Living document. Things to research, calibrate, build, or decide once we have real data.
Not in priority order within sections — that comes when items move to a sprint/spec.

## Pilot feedback — action items

- **Session time logging.** malmesae requested a start/end time field on notes (e.g. "3:00 PM – 4:30 PM"). Ideal: auto-populated from recording start/stop, manually adjustable. Should be storable on `SessionNote`. Low effort, high value for billing/scheduling context.
- **Recordings longer than 90 min.** malmesae sometimes tutors for longer than 90 min. Currently capped at 90 min and 100MB. Real fix: chunked/segmented recording that auto-saves and continues, or allow multiple recordings per note. Backlogged — requires architecture change.
- **Tutor playback of saved recording.** malmesae asked if she/student can listen after saving. ✅ Preview before transcribing is now available in the AI panel (local object URL, no extra server call). Remaining: add playback UI to the admin note detail view (requires an admin-authenticated `/api/audio/admin/[recordingId]` route, separate from the public share-token-authenticated one).
- **AI link extraction from spoken/typed URLs.** Currently the AI lifts brand mentions verbatim — e.g. "go to google for more info" becomes a "Google" entry in the Links field, not a real URL. Desired behavior: when an actual URL or domain is spoken/typed (`www.google.com`, `khanacademy.org/algebra`), normalize to `https://...` and put it in Links. When only a brand name is mentioned with no domain, leave it out of Links (don't guess). Implementation: tighten the system prompt in `generateNoteFromTextAction` and add a regex post-pass to validate/normalize what the model returns. Add a unit test covering: (a) spoken URL → captured, (b) brand-only → not captured, (c) bare domain → `https://` prepended.

---

## Product positioning (set night 1 of pilot)

**Tools for independent tutors who source their own clients.** Subscription-based. **Not a marketplace.** Tutor keeps 100% of their hourly rate; we provide the tooling that makes the work easier and more valuable to parents/students.

**Direct comp:** **Wyzant** — has the interactive whiteboard, takes **25% of tutor pay**, **does not take notes for the tutor** (tutor writes manually at end of session, platform sends to parent). Sarah currently uses Wyzant occasionally and explicitly asked for a platform that *"doesn't have to connect me to clients, just have a platform that I could use to make my work easier."* That's our wedge.

**Pitch shape:** *"Keep 100% of your rate. Get better tools than Wyzant gives you, for ~$20/month."*

**Initial target persona:** Independent tutor, primarily math/STEM, high school + college students (sometimes middle school, rare elementary). Sources own clients. Currently writes notes by hand or skips them.

---

## Pending pilot input (waiting on)

- **Sarah's first real session (tomorrow morning).** Outcomes to watch: signup flow friction, whether AI notes (if shipped tonight) actually saves her the writeup, what she calls out unprompted.

## Pilot input received

- **Sarah's "would-pay" wishlist (~10:03 PM):** versatile online + in-person; interactive whiteboard with video + screen/document share; AI-summarize conversation+whiteboard into notes; in-person tablet whiteboard with audio capture + AI notes. Quote: *"I would pay for"* AI taking the conversation and turning it into notes + suggestions for next session.
- **Sarah's disambiguators (~10:29 PM):**
  1. **Devices online:** *Tutor* uses computer + two monitors. *Students* use Chromebook or laptop, single screen. → **Web-first, browser-based.** iPad is in-person only.
  2. **Recording:** Yes with consent; would help her students to send the recording for review. **Killer-feature description (verbatim):** *"open a whiteboard under the students name and it would ask whether I want to record this whiteboard session. I would want it to record writing strokes as a video and record the audio that goes along with it, plus a pause button in case we end up talking about off topic things."* Her own words: **"That is a feature I have not seen."** Treat this as a **competitive moat** signal from a practitioner.
  3. **Subjects/ages:** Primarily **math**, high school most common, college second, occasional middle school, rare elementary. Has tutored chemistry, soon physics. Has helped people write papers. → Whiteboard MVP can target **math/STEM for older students** without worrying about kid UX.
- **Currently uses paper for notes** (in-person). Sometimes phone, but *"too small to do all the work on there"*. Tablet preferred when she has it. **Phone should be a usable fallback** when she forgets her tablet — *"I would still like it as an option"*. → UI must not break on small screens even if it's not optimized for them.
- **In-person student** brings own iPad with Apple Pencil; they pass iPads back and forth, write directly on each other's screens, **mark up homework digitally** ("write directly on her homework in a digital format that has worked pretty well"). → PDF/image annotation isn't just an abstract future feature; it's a workflow she already does today and values.
- **Existing notes form structure is validated.** Sarah: *"I usually give over all the things on the notes form you have, I just hate taking the time to write them up."* → She's not asking for a different schema; she's asking for AI to **fill the existing form**. This is meaningful — don't redesign the form, just add the AI fill.
- **Existing "send notes via email" feature is liked.** Sarah: *"I think the ability for the program to put the notes info in an email is cool. I like that idea."* → Don't deprecate or hide it; it's actually one of the touchpoints that landed.
- **Recording is dual-purpose** — not just for AI notes generation, but **for student review**. Sarah: *"it could be helpful to send to them if [they] want to review it."* → The share-link infrastructure should extend to recordings; this affects the value prop for both tutor and student.
- **Sarah is self-aware about scope.** Closed her wishlist with *"I know my suggestion is kind of a complicated one. But it would be cool."* → She's not entitled; she'll be happy with iterative wins. Reinforces "ship in slices, communicate honestly about scope."
- **Tomorrow's pilot smoke test (her plan):** *"I'll probably test the google oauth tomorrow."* → If Google OAuth fails for her tomorrow morning, that's the first thing to fix. Make sure her email is allowlisted (it is) and the connect flow works end-to-end.
- **Curiosity / relationship signal:** Sarah remarked she was *"surprised you picked this type of app as your project."* → She's invested enough to wonder *why*; treat her as **co-designer**, not just tester. Worth scheduling a "watch her use it" call within the first 1–2 weeks to capture friction she won't bother to message about.

---

## Tonight-shippable (high confidence, single focused session)

- **AI notes from pasted text** — server action that takes typed/pasted session content + student context, calls LLM with structured-output prompt, fills the note form fields (topics, homework, next steps). User reviews before saving. Directly hits Sarah's #1 paid pain.
  - Provider decision: OpenAI `gpt-4o-mini` is the leaning default (cheap, JSON mode, same provider as Whisper for later).
  - Dedicated app-specific API key in Vercel env (not a reused dev key).
  - Provider-side spend cap on the key from day one.
  - Per-request token cap in code.
  - Mocked LLM call in tests so CI doesn't burn tokens.

## Days, not nights (next 1–2 weeks)

- **Audio upload → Whisper transcript → AI notes.** Skips live capture; tutor records on phone after session, uploads, gets notes. Cheaper & simpler than live capture; ships value while live recording is built.
- **PDF/image attachment on a note** (just display/storage; no annotation yet).
- **In-app onboarding polish** (signup → first student → first note flow audit; signup gap was the first thing Sarah noticed unprompted).
- **Operator dashboard scaffolding** (`/operator/*`, separate from `/admin/*`): users list, status, manual comp flag. Required before payments are useful.

## Weeks, real engineering — this is where the moat lives

- **Web-based collaborative whiteboard for online sessions.** Browser-only, works on Chromebook + tutor's desktop. `tldraw` is the leading candidate (open source, real-time sync engine available). Tutor opens a whiteboard "under the student's name" — i.e. attached to a Student record. **Both tutor and student draw on the same canvas in real time.** This is the table-stakes feature to compete with Wyzant's whiteboard.
- **🎯 Whiteboard session recording (THE differentiator per Sarah).** When tutor opens a whiteboard, prompt: *"Record this whiteboard session?"* If yes:
  - Record **stroke events** as a time-indexed event log (replay as scrubbable video, not flattened video file — much smaller, and lets students step through).
  - Record **audio** (browser MediaRecorder API) synced to stroke timestamps.
  - **Pause button** for off-topic chat — pauses both stroke recording and audio.
  - Save recording attached to the session/note.
  - Allow tutor to send recording link to student/parent for review (existing share-link infrastructure can extend here).
  - **AI notes can be generated from the recording** (transcribe audio, summarize what was worked on, infer next-step suggestions). This is the integration of her #1 paid pain with her #1 moat-feature ask.
- **Subscription billing** — Stripe Checkout, webhook → `AdminUser.subscriptionStatus`, single price to start.
- **Live audio capture during session** with browser reliability (covered by whiteboard recording above).

## Later: in-person mode

- **iPad whiteboard (single user)** using `tldraw` or similar — Apple Pencil via Pointer Events. For when tutor uses tablet during in-person sessions. Lower priority than online whiteboard; in-person is currently paper-based and works for her.
- **iPad two-device handoff** — pass-the-tablet UX for in-person sessions where student writes on tutor's iPad.
- **PDF annotation** (write on top of a worksheet with stylus, persist ink layer).

## Months, "competes with paid tools" polish

- **Whiteboard sync hardening** — `tldraw` self-hosted sync server with proper presence, conflict resolution, network-drop recovery. Initial version can use their hosted sync; production-quality eventually self-hosted for cost + control.
- **Discount system** (Stripe Coupons + Promotion Codes):
  - Public promo codes (`PILOT10` first month off) via Stripe promotion codes.
  - Per-user comp (lifetime / N months free) via customer-applied coupons.
  - DB-side `compReason`, `compGrantedAt`, `compGrantedBy` even when Stripe holds the discount.
  - Default to "free for 12 months, renewable manually" over true infinite.
- **Native or PWA app store presence** (only if mobile install friction proves to matter).

---

## Research / calibration (waiting on real usage data)

These are not features — they're things we don't yet know enough to decide. Revisit after some weeks of pilot usage.

### Pricing
- **Minimum viable subscription amount.** Need 3–5 independent tutors' "I'd pay for this without breaking a sweat" numbers before committing to a price.
- **Anchor against Wyzant's 25% cut.** A tutor making $50/hr through Wyzant loses $12.50/hr (~$50/wk for 4 sessions) to the platform. Subscription priced **well below their Wyzant losses** is an easy yes if our tools match or beat Wyzant's. Use this in marketing copy.
- **Tier structure.** Solo tutor vs tutor with multiple students vs small tutoring business. Not worth designing tiers until we know if anyone hits a ceiling on a flat plan.
- **Per-feature gating decisions.** Should AI notes / recording be in every plan or a "Pro" feature? **Likely needs metering** — recording + transcription costs scale with session minutes, so a flat sub at any price has unbounded downside. Decide once we have a month of real usage data.

### True API costs at scale
- **OpenAI text generation (`gpt-4o-mini`):** estimate is ~$0.001–0.005 per AI-generated note. At 8 notes/week per tutor that's single-digit cents/month. **Need real measurement** once feature ships — log token counts per request, sum monthly per tutor.
- **Whisper transcription:** $0.006/min. A 1-hour session is ~$0.36. **This is the cost-watch item** — at 10 sessions/week per tutor that's ~$15/mo in API spend alone, which eats most of a $20 sub. Need to decide:
  - Pass through cost (transcription as a paid add-on / metered)?
  - Cap minutes per tier?
  - Use a cheaper transcription provider once volumes warrant?
- **Whiteboard sync server costs** (when we get there) — bandwidth-driven, hard to estimate until we know session length and concurrent users per tutor.
- **Hosting** — Vercel + Neon are negligible until they aren't. Watch as users grow.

### Per-user usage quotas
- Daily/monthly request quota per tutor for AI features so a runaway script or unusual usage can't blow up costs.
- Soft limits with "you've used 80% of your monthly AI budget" UI before hard cutoff.
- Decide threshold once we have a month or two of usage data.

### Unit economics
- **CAC:** unknown. Word-of-mouth-only for now; if/when paid ads enter the picture, need real conversion-rate data first.
- **Retention/churn:** unknown until we have ≥3 months of paying users.
- **LTV:** unknown until churn is known. Don't run paid acquisition until LTV/CAC is healthy with margin.

### Marketing / acquisition channels (research, not action yet)
- Tutor subreddits (r/tutor and adjacent), tutoring Facebook groups, Discord communities.
- "I built this for my friend who's a tutor" content angle (Twitter/LinkedIn/Reddit).
- Referral nudge in-app (e.g. "give a tutor 50% off, get a month free") — costs margin, not cash.
- Paid ads: **deferred** until conversion funnel is measured and LTV justifies CAC. Math doesn't work for B2B SaaS at low ASP without real funnel data.

### Legal / trust
- **Audio recording of minors** is jurisdiction-sensitive. Need a clear consent flow, retention policy, and a "delete on request" path before live audio capture ships. Research per state/province before enabling for users outside Sarah's pilot.
- **PII handling** (parent emails, student names, session content) — privacy policy needs to be real, not generic, before public launch. Already have stub via Trust launch bar; revisit before opening signups beyond pilot.

### Feedback handling discipline
- **Tutor advisory of 3–5 honest practitioners** (Sarah is #1). Monthly check-ins, not focus groups.
- **Watch-them-use-it sessions** — 10 minutes of screen-share reveals more than weeks of async messages. Schedule with each pilot at month 1.
- **Distinguish universal pain from personal quirk** — only treat feedback as roadmap when ≥2 unrelated tutors say the same thing. Single-user requests are noted, not built.
- **Track whether shipped fixes actually changed behavior** — "thanks" from a user is not the same as the metric improving.

---

## Operational follow-ups (small, do when convenient)

- **Vercel ignored build step** — doc-only commits (changes under `docs/`, `*.md`, `BACKLOG.md`) currently trigger a full redeploy. Add an "Ignored Build Step" command in Vercel → Project Settings → Git to skip builds when only non-code files changed. Command: `git diff HEAD^ HEAD --name-only | grep -qvE '^(docs/|.*\.md$)'`
- **AI panel / note form layout shift** — at borderline window widths the two panels (Auto-fill + New session note) flip between stacked and side-by-side depending on content height. When the AI panel collapses from "full input" to the "Form filled" banner, the reduced height can cause the flex row to reflow. Fix: use CSS grid with fixed column widths instead of a flex row with `flex-wrap`, so the two-column layout stays locked regardless of content height.
- **React #418 hydration mismatch on student page.** Console shows minified React error #418 (server-rendered HTML doesn't match client render) on `/admin/students/[id]`. Likely culprits: locale-formatted dates rendered without a stable timezone, dark-mode/theme detection that runs differently on server vs client, or any `Date.now()` / `Math.random()` at render time. Repro path: open the page in a fresh browser and check console. To diagnose, run `npm run dev` locally and reproduce — dev mode prints the offending element/text instead of the minified code. Pollutes the console (makes real bugs harder to spot) and can cause flickers / state desync, so worth fixing even though no user-visible damage is confirmed yet.
- **Missing favicon (404 on /favicon.ico).** Every page load logs a 404 for `/favicon.ico`. Add a real favicon (16/32/48px ico, plus an SVG and apple-touch-icon) under `src/app/` per Next.js App Router convention so browsers stop 404'ing on every tab. Trivial fix; mostly polish + cleaner logs.

- Pre-fill / saved-input audit beyond parent email (anything else she's typing twice?).
- Friendlier empty states throughout (especially Outbox first-time, Students first-time).
- "What's this for?" tooltips on Settings sections.
- Add an obvious "Send feedback" CTA inside the app (already exists in nav, but not yet contextual on key screens).
- **Mobile/phone responsive audit.** Sarah may fall back to phone if tablet is forgotten. Notes form, students list, and "Send update" flow should at minimum *work* on a phone, even if not optimized.
- **Schedule a "watch her use it" call** within first 1–2 weeks of pilot. 10 minutes of screen-share reveals friction users never bother to message about.
- Document for future agents: tutoring-notes is a **service** for tutors, not a product Andrew uses himself. Feedback loop must come from real users, not intuition. (Echoed in PRINCIPLES + multi-tenant learning; worth a per-app reminder here.)

---

## Decisions deferred (revisit when triggered)

- **Whiteboard: feature of tutoring-notes vs sibling product?** Currently leaning toward **feature** (single app, single account, one subscription). "Tutoring Notes" branding may need to grow into "Tutoring Studio" or similar once whiteboard + recording ship — the current name undersells the product. Worth a deliberate naming decision before public launch.
- **Native app vs PWA** — defer until we know if iPad install friction is a real pain (vs just adding the web app to Home Screen). Online flow is browser-only per Sarah, so PWA is fine for MVP.
- **Choosing OpenAI vs Anthropic** — coin-flip for current use case; revisit if cost or quality differs meaningfully on real workloads. OpenAI has the advantage of also providing Whisper, keeping audio + text on one provider/key.
- **Recording storage:** stroke event log (JSON, small) is easy. Audio (MB-scale per session) needs a real plan: object storage (S3/R2/Vercel Blob), retention policy, cost per tutor. Decide before shipping recording feature publicly.
- **Audio blob retention policy.** Once a recording is transcribed, there are two options: (a) delete immediately — transcript is in the DB, blob has no further purpose unless we offer re-download; (b) keep for N days (30-day window?) so tutor can re-transcribe or download before it expires. Currently blobs are never cleaned up. Also: student/note delete should cascade to blob deletion. Decide: do we want recordings to be re-downloadable by the tutor? If no, delete on successful transcription. If yes, set a retention window and a cron/cleanup job. Either way, add `deleteBlob()` calls to the note and student delete paths.
- **Replay video format:** stroke-event-replay (custom player) vs flatten-to-MP4 server-side (familiar to students, larger file). Probably stroke-event-replay first (cheaper, scrubbable, smaller); add MP4 export if students ask.
