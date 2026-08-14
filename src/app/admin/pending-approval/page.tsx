import { getServerSession } from "next-auth";
import { authOptions } from "@/auth-options";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PendingApprovalSignOut } from "./PendingApprovalSignOut";

export const dynamic = "force-dynamic";

export default async function PendingApprovalPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  const approvalStatus = session.user.approvalStatus;
  if (!approvalStatus || approvalStatus === "APPROVED") {
    redirect("/admin");
  }

  const email = session.user.email ?? "your account";
  const isRejected = approvalStatus === "REJECTED";

  return (
    <div className="flex flex-col items-center justify-center py-12">
      <Card className="w-full max-w-md">
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl">
              {isRejected ? "Account not approved" : "Account pending approval"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Your tutor account (<span className="font-medium text-foreground">{email}</span>)
              {isRejected
                ? " was not approved for platform access."
                : " has been created and is pending operator approval."}
            </p>
            <p className="text-sm text-muted-foreground">
              {isRejected
                ? "If you believe this is an error, please contact your administrator."
                : "Once approved you will have full access to the platform. If you are expecting faster access, please contact your administrator."}
            </p>
            <div className="pt-2">
              <PendingApprovalSignOut />
            </div>
          </CardContent>
      </Card>
    </div>
  );
}
