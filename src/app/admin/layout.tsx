import { getServerSession } from "next-auth";
import { AdminNav } from "@/components/AdminNav";
import { authOptions } from "@/auth-options";
import { isOperatorEmail } from "@/lib/operator";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  const showOperatorLinks = isOperatorEmail(session?.user?.email);

  return (
    <>
      <AdminNav showOperatorLinks={showOperatorLinks} />
      <div className="container">{children}</div>
    </>
  );
}
