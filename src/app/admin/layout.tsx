import { getServerSession } from "next-auth";
import { AdminNav } from "@/components/AdminNav";
import { Providers } from "@/components/Providers";
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
    <Providers>
      <AdminNav showOperatorLinks={showOperatorLinks} />
      <div className="container">{children}</div>
    </Providers>
  );
}
