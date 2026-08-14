import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import type { AdminRole, TutorApprovalStatus } from "@prisma/client";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import {
  createAdminFromGoogle,
  getAdminByEmail,
  getAdminById,
  hasAdminUsers,
  verifyPassword,
} from "@/lib/auth-db";
import { notifyOperatorsOfNewSignup } from "@/lib/notify-operator-new-signup";
import {
  isPlaywrightHarnessActive,
  isPlaywrightHarnessAdminEmail,
} from "@/lib/playwright-harness";
import {
  SIGNUP_INTENT_COOKIE,
  clearSignupIntentCookie,
  isValidSignupIntentToken,
} from "@/lib/signup-intent";

// Re-check role + isTestAccount from DB at most once per this interval per active session.
// Tradeoff: a role change in the DB propagates to active tokens within 5 min.
const ROLE_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

// Google OAuth provider is only included when both credentials are present.
// CredentialsProvider remains available at all times for password logins and
// the env-only fallback. This means tsc passes cleanly with Google creds absent
// (Blocker #7).
const googleProviders =
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? [
        GoogleProvider({
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
          authorization: {
            // Strictly openid + email + profile — NOT gmail.send.
            // The existing Gmail-send OAuth is a separate custom flow
            // (OAuthEmailConnection) and is unrelated to this provider.
            params: { scope: "openid email profile" },
          },
        }),
      ]
    : [];

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = (credentials?.email ?? "").trim();
        const password = credentials?.password ?? "";

        if (!email || !password) return null;

        const hasDbAdmins = await hasAdminUsers();

        if (hasDbAdmins) {
          const admin = await getAdminByEmail(email);
          if (!admin) return null;
          // Blocker #1: test accounts cannot log in via password.
          if (admin.isTestAccount) return null;
          // Blocker #2 (via verifyPassword): Google-OAuth-only real admins
          // have null passwordHash; verifyPassword returns false for null.
          const ok = await verifyPassword(password, admin.passwordHash);
          if (!ok) return null;
          return {
            id: admin.id,
            email: admin.email,
            name: admin.displayName ?? "Admin",
            isTestAccount: admin.isTestAccount,
            role: admin.role,
            approvalStatus: admin.approvalStatus,
          };
        }

        if (env.ADMIN_EMAIL && env.ADMIN_PASSWORD) {
          if (email !== env.ADMIN_EMAIL || password !== env.ADMIN_PASSWORD)
            return null;
          // Legacy env-only admin: map to ADMIN role so it keeps its existing
          // tutor-experience access (sub=admin path in getAdminSessionMode).
          return {
            id: "admin",
            email: env.ADMIN_EMAIL,
            name: "Admin",
            isTestAccount: false,
            role: "ADMIN" as AdminRole,
          };
        }

        return null;
      },
    }),
    ...googleProviders,
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    // Redirect all NextAuth error pages to /login?error=... so they render
    // the inline error banner instead of NextAuth's standalone "Error" card
    // at /api/auth/error.
    error: "/login",
  },
  callbacks: {
    async signIn({ user, account }) {
      // Google sign-in: existing DB rows may log in from /login or /signup.
      // Unknown emails auto-provision ONLY with a valid /signup intent cookie.
      if (account?.provider === "google") {
        if (!user.email) return false;
        const email = user.email.trim().toLowerCase();
        let admin = await getAdminByEmail(email);
        if (!admin) {
          const cookieStore = await cookies();
          const intentValue = cookieStore.get(SIGNUP_INTENT_COOKIE)?.value;
          const hasSignupIntent = await isValidSignupIntentToken(
            intentValue,
            env.NEXTAUTH_SECRET
          );
          if (!hasSignupIntent) return "/login?error=not_authorized";

          admin = await createAdminFromGoogle(email, user.name ?? null);
          await notifyOperatorsOfNewSignup({
            email: admin.email,
            displayName: admin.displayName,
            method: "google",
          });
          await clearSignupIntentCookie();
        }
        // Test accounts cannot authenticate via Google OAuth.
        if (admin.isTestAccount) return "/login?error=not_authorized";
        return true;
      }
      // CredentialsProvider: handled in authorize() above.
      return true;
    },

    async jwt({ token, user, account }) {
      if (user) {
        // CredentialsProvider: authorize() sets isTestAccount + role + approvalStatus on the returned user.
        const u = user as {
          isTestAccount?: boolean;
          role?: AdminRole;
          approvalStatus?: TutorApprovalStatus;
          email?: string;
        };
        token.isTestAccount = u.isTestAccount ?? false;
        if (u.role !== undefined) token.role = u.role;
        if (u.approvalStatus !== undefined) token.approvalStatus = u.approvalStatus;
        // Fresh login: 2FA not yet verified this session (non-test accounts must pass the gate).
        // isTestAccount accounts are exempt — we mark them pre-verified so middleware skips them.
        // Playwright wb-regression harness: credentials login for playwright@test.local
        // under WB_E2E_HARNESS=1 (server-only flag, local Docker Postgres only;
        // NOT gated on NEXT_PUBLIC_WB_E2E_SCENE_HOOK to prevent client-bundle bypass).
        const playwrightHarnessLogin =
          isPlaywrightHarnessActive() && isPlaywrightHarnessAdminEmail(u.email);
        if (u.isTestAccount || playwrightHarnessLogin) {
          token.twoFactorVerified = true;
        } else {
          token.twoFactorVerified = false;
        }
      }
      if (account?.provider === "google" && user?.email) {
        // Google sign-in: resolve the DB row to get the canonical id + flags.
        const admin = await getAdminByEmail(user.email);
        if (admin) {
          token.sub = admin.id;
          token.isTestAccount = admin.isTestAccount;
          token.role = admin.role;
          token.approvalStatus = admin.approvalStatus;
          // Google login: same 2FA gate — not verified yet.
          // isTestAccount exempts (Google path can't produce test accounts per signIn callback,
          // but guard anyway for safety).
          token.twoFactorVerified = admin.isTestAccount ? true : false;
        }
      }
      // Impersonation fields (isImpersonating, originalAdminId, originalAdminEmail,
      // impersonationLogId, role) are already in the token when set by
      // mintImpersonationSession() in src/lib/impersonation.ts; they persist
      // across token refreshes without any extra logic here.
      //
      // twoFactorVerified: once set to true by mintTwoFactorVerifiedSession(),
      // it persists across refreshes here (no code clears it — the flag is only
      // cleared by a full sign-out which issues a new session).

      // Fix B — role re-fetch on refresh (rol log prefix; registered in AGENTS.md § Conventions).
      //
      // On token refreshes (user absent, account absent) we re-read role + isTestAccount
      // from the DB so that a DB change (e.g. role promotion/demotion) propagates within
      // ROLE_REFRESH_INTERVAL_MS without requiring an explicit re-login.
      //
      // Skip conditions (do NOT re-fetch when):
      //   - Initial sign-in: `user` or `account` is present — already handled above.
      //   - Impersonation token: `token.isImpersonating === true` — the token intentionally
      //     carries the impersonation TARGET's role; the exit path (mintAdminSession) re-mints
      //     correctly. Re-fetching by sub would wrongly overwrite the target's role with the
      //     real admin's DB role.
      //   - Legacy env-only admin: sub === "admin" — no DB row exists; skip to avoid 404.
      //
      // Throttle: re-fetch at most once per ROLE_REFRESH_INTERVAL_MS (stored in `_roleCheckedAt`
      // token claim). Tradeoff: role changes propagate within 5 min, not instantly. Acceptable
      // for this low-traffic app; tighten the interval if near-instant propagation is required.
      //
      // Fail-closed on deleted accounts (DB returns null): clear token.sub so middleware
      // treats the session as unauthenticated and redirects to /login.
      // Fail-open on transient DB errors: preserve the existing token to avoid mass
      // session invalidation during DB outages.
      if (!user && !account && token.sub && token.sub !== "admin" && !token.isImpersonating) {
        const now = Date.now();
        const lastCheck = (token._roleCheckedAt as number | undefined) ?? 0;
        if (now - lastCheck >= ROLE_REFRESH_INTERVAL_MS) {
          try {
            const dbAdmin = await getAdminById(token.sub);
            if (!dbAdmin) {
              console.log(`[rol] sub=${token.sub} refresh=account_deleted fail_closed`);
              // Fail closed: clear identity so middleware treats this as unauthenticated.
              token.sub = undefined;
            } else {
              const roleChanged = dbAdmin.role !== (token.role as string | undefined);
              const testChanged = dbAdmin.isTestAccount !== (token.isTestAccount as boolean | undefined);
              const approvalChanged = dbAdmin.approvalStatus !== (token.approvalStatus as string | undefined);
              if (roleChanged || testChanged || approvalChanged) {
                console.log(
                  `[rol] sub=${token.sub} role_corrected` +
                    (roleChanged ? ` role=${String(token.role)}->${dbAdmin.role}` : "") +
                    (testChanged ? ` isTestAccount=${String(token.isTestAccount)}->${String(dbAdmin.isTestAccount)}` : "") +
                    (approvalChanged ? ` approvalStatus=${String(token.approvalStatus)}->${dbAdmin.approvalStatus}` : "")
                );
              }
              token.role = dbAdmin.role;
              token.isTestAccount = dbAdmin.isTestAccount;
              token.approvalStatus = dbAdmin.approvalStatus;
              token._roleCheckedAt = now;
            }
          } catch (err) {
            // Transient DB error: fail open (keep existing token) to avoid mass sign-out.
            console.error(`[rol] sub=${token.sub} refresh_error fail_open`, err);
          }
        }
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string | undefined;
        session.user.isTestAccount = (token.isTestAccount as boolean | undefined) ?? false;
        session.user.isImpersonating =
          (token.isImpersonating as boolean | undefined) ?? false;
        session.user.originalAdminId =
          (token.originalAdminId as string | null | undefined) ?? null;
        session.user.originalAdminEmail =
          (token.originalAdminEmail as string | null | undefined) ?? null;
        session.user.impersonationLogId =
          (token.impersonationLogId as string | null | undefined) ?? null;
        session.user.role = (token.role as AdminRole | undefined);
        session.user.approvalStatus = (token.approvalStatus as TutorApprovalStatus | undefined);
        session.user.twoFactorVerified =
          (token.twoFactorVerified as boolean | undefined) ?? false;
      }
      return session;
    },
  },
};
