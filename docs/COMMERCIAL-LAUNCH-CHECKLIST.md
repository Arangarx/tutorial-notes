# Commercial launch checklist — Tutoring Notes

> **When to use this:** After achieving product-market fit through pilots (people are using it, asking others to use it, saying it saves them time). This is NOT a now list — it's a reference for when you're ready to scale beyond pilots.

---

## Signal that you're ready

- [ ] At least 5 tutors actively using it (weekly sessions logged)
- [ ] Unprompted referrals from current users
- [ ] Consistent positive feedback with specific use cases
- [ ] Identified willingness to pay (even small amounts)

---

## Company / legal

- [ ] Decide on business entity (sole proprietor OK to start; LLC for liability protection before significant revenue)
- [ ] Register business name if applicable
- [ ] Separate business bank account
- [ ] Set pricing (monthly subscription model is standard for SaaS; start simple: one tier)
- [ ] Terms of Service → replace `/terms` placeholder with real content (consider using a legal template service like Clerky, or hire a lawyer for <$500 for a basic SaaS ToS)
- [ ] Privacy Policy → replace `/privacy` placeholder (required for Google OAuth verification, app stores, payment processors)

---

## Payments

- [ ] Stripe account → integrate via Stripe Checkout or Payment Links (simplest: Payment Links require no code)
- [ ] Decide: per-seat pricing vs flat subscription
- [ ] Set up free trial or freemium tier if desired
- [ ] Add billing management (Stripe Customer Portal — minimal code)

---

## Web presence

- [ ] Custom domain (Vercel makes this easy; ~$12/year for a `.com`)
- [ ] Landing page with pricing section
- [ ] Social proof section (testimonials from pilots)
- [ ] FAQ (covers "is my data safe?", "how does email work?", "can I cancel?")

---

## App stores (if going native)

> **Note:** A web app (Next.js) can be used on mobile without app stores via the browser. Consider PWA (Progressive Web App) first — zero store approval process, instant updates.

- [ ] PWA: add `manifest.json`, service worker, and mobile meta tags — works on iOS and Android in browser
- [ ] Android (Google Play): requires $25 one-time developer fee; review in ~1 week
- [ ] iOS (Apple App Store): requires $99/year developer fee; review in ~1-7 days; stricter guidelines
- [ ] Both stores require a privacy policy URL before submission

---

## Marketing

- [ ] Set up a simple brand email (e.g. `hello@tutoringnotes.com`) — Google Workspace $6/mo or Fastmail
- [ ] Create a minimal social media presence as the product grows (LinkedIn and/or Twitter/X depending on audience)
- [ ] Product Hunt launch (free, good for initial awareness)
- [ ] Tutor communities/forums outreach (Reddit, Facebook groups for tutors)
- [ ] Consider reaching out to tutoring agencies for B2B deals

---

## Operations at scale

- [ ] Upgrade Neon from free tier to paid when approaching 0.5GB storage
- [ ] Upgrade Vercel from free tier to Pro ($20/mo) if usage exceeds free limits
- [ ] Set up error monitoring (Sentry has a free tier)
- [ ] Set up uptime monitoring (Better Uptime, UptimeRobot — free tiers available)
- [ ] Google OAuth verification (required once out of Testing mode — see `docs/pilot-ops-playbook.md`)

---

## Pipeline note

This doc is intentionally a **checklist, not a sprint plan**. When you're ready to act on any section, ask the pipeline to build it — each item here is a defined, buildable task.
