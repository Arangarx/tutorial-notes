import { AdminNav } from "@/components/AdminNav";
import { Providers } from "@/components/Providers";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Providers>
      <AdminNav />
      <div className="container">{children}</div>
    </Providers>
  );
}
