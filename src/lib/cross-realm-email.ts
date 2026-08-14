import { db } from "@/lib/db";
import { normalizeEmail } from "@/lib/normalize-email";

export type IdentityRealm = "admin" | "account_holder";

export type EmailRealmPresence = {
  normalizedEmail: string;
  inAdmin: boolean;
  inAccountHolder: boolean;
};

/**
 * Returns which identity realms already own this email (normalized).
 * Used at signup/OAuth provision to block cross-realm squatting.
 */
export async function findEmailRealmPresence(
  email: string
): Promise<EmailRealmPresence> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return { normalizedEmail, inAdmin: false, inAccountHolder: false };
  }

  const [admin, accountHolder] = await Promise.all([
    db.adminUser.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    }),
    db.accountHolder.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    }),
  ]);

  return {
    normalizedEmail,
    inAdmin: admin !== null,
    inAccountHolder: accountHolder !== null,
  };
}

/** True when the email exists in a realm other than `targetRealm`. */
export function isEmailTakenInOtherRealm(
  presence: EmailRealmPresence,
  targetRealm: IdentityRealm
): boolean {
  if (targetRealm === "admin") {
    return presence.inAccountHolder;
  }
  return presence.inAdmin;
}
