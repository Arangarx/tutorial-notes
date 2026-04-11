import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tutoring Notes",
  description: "Fast session notes and clean parent updates for tutors.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body style={{ minHeight: "100%", display: "flex", flexDirection: "column", margin: 0 }}>
        <div style={{ flex: 1 }}>{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}

