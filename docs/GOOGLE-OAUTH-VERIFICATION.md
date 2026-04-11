# Google OAuth verification — Tutoring Notes

> **When you need this:** Only if you use "Connect Gmail" (OAuth) for sending email. If you use SMTP (Resend / Mailgun / etc.) you can skip this entirely. For pilots, **SMTP via Resend is recommended** — zero verification required.

---

## Current state: Testing mode

Your Google Cloud project is in **Testing mode**. This means:
- Only **manually-added test users** (up to 100) can grant OAuth consent.
- Each test user must be added in Google Cloud Console → APIs & Services → OAuth consent screen → Test users.
- The "unverified app" warning screen appears on login.

**This is fine for early pilots** (you + a few tutors). No need to rush verification.

---

## When to verify

Verify when:
- You have more than ~20 active Gmail-connected users (managing test users becomes annoying).
- You're onboarding users who can't be manually pre-approved.
- Users complain about the "unverified app" warning.

---

## Verification requirements

Google will review your app if it requests sensitive or restricted scopes. For Tutoring Notes, the scope is `https://www.googleapis.com/auth/gmail.send` (restricted), which requires:

1. **Privacy Policy URL** — must be publicly accessible (you already have `/privacy`; fill in the real content).
2. **Terms of Service URL** — same (you have `/terms`; fill in real content).
3. **App homepage** — your production URL.
4. **Authorized domains** — your production domain (e.g. `tutoringnotes.com`).
5. **YouTube video** — a short screencast (~2–3 min) showing:
   - What the app does.
   - How the OAuth flow is used (the "Connect Gmail" button → consent screen → sending an email).
   - That you only send email on behalf of the user (you don't read their inbox).
6. **Justification letter** — a few sentences explaining why you need `gmail.send`. Example:

   > "Tutoring Notes is a session-notes app for private tutors. When the tutor clicks 'Send update', the app sends a summary email to the student's parent from the tutor's own Gmail address via the Gmail API. We request gmail.send only; we do not read, list, or modify the user's inbox."

---

## Steps to submit verification

1. Go to [Google Cloud Console → OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent).
2. Click **Edit App** → fill in:
   - App name: **Tutoring Notes**
   - User support email: your email
   - App homepage: `https://your-domain.com`
   - Privacy Policy: `https://your-domain.com/privacy`
   - Terms of Service: `https://your-domain.com/terms`
   - Authorized domains: `your-domain.com`
3. Under **Scopes**, confirm only `gmail.send` is listed.
4. Click **Publish App** → status changes to "In verification."
5. Google will email you requesting the video and justification. Respond with both.
6. Review typically takes 4–6 weeks. During review, existing test users continue to work.

---

## While waiting for verification

- **Continue using SMTP (Resend) as the default** — it works for all users with no approval.
- Keep "Connect Gmail" as an option for power users who prefer sending from their own address.
- Add new pilot users to the test users list as needed.

---

## Alternative: stay on SMTP permanently

If Gmail verification feels like too much overhead:
- SMTP via Resend (or Mailgun, Postmark, etc.) works for all users immediately.
- The from address is your domain (e.g. `notes@tutoringnotes.com`), not the tutor's Gmail.
- This is how most SaaS apps work. The "Connect Gmail" feature is a nice-to-have, not a must-have.

You can defer or skip verification entirely if you go this route.
