/**
 * SEC-1 Dispatch C — Test accounts list + "Log in as" on the real-admin dashboard.
 */

import { db } from "@/lib/db";
import { assertIsRealAdmin } from "@/lib/impersonation";
import { startImpersonation } from "@/app/admin/actions/impersonate";
import { ImpersonateSubmitForm } from "@/app/admin/ImpersonateSubmitForm";

export async function AdminTestAccountsPanel() {
  await assertIsRealAdmin();

  const testAccounts = await db.adminUser.findMany({
    where: { isTestAccount: true },
    select: { id: true, email: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  if (testAccounts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No test accounts yet. Seed <code className="text-xs">isTestAccount=true</code> rows in the
        database.
      </p>
    );
  }

  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {testAccounts.map((acct) => (
        <li
          key={acct.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3"
        >
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-foreground">{acct.email}</div>
            <div className="label-mono mt-0.5 text-xs text-muted-foreground">
              Created {acct.createdAt.toLocaleDateString()}
            </div>
          </div>
          <ImpersonateSubmitForm action={startImpersonation.bind(null, acct.id)} />
        </li>
      ))}
    </ul>
  );
}
