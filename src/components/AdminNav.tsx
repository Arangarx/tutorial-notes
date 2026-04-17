"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOut } from "next-auth/react";

const adminLinks = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/students", label: "Students" },
  { href: "/admin/outbox", label: "Outbox" },
  /** Inbox of messages from the public form (not the form itself). */
  { href: "/admin/feedback", label: "Feedback inbox" },
  /** Public submit form — works even while signed in as admin. */
  { href: "/feedback", label: "Send feedback" },
  { href: "/admin/waitlist", label: "Waitlist" },
  { href: "/admin/settings", label: "Settings" },
];

export function AdminNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  function isActive(href: string) {
    if (href === "/admin") return pathname === "/admin";
    if (href === "/feedback") return pathname === "/feedback";
    return pathname.startsWith(href);
  }

  return (
    <>
      <nav className="admin-nav">
        <div className="admin-nav-inner">
          <Link href="/admin" className="admin-nav-brand">
            Tutoring Notes
          </Link>

          {/* Desktop links */}
          <div className="admin-nav-links">
            {adminLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`admin-nav-link${isActive(l.href) ? " active" : ""}`}
              >
                {l.label}
              </Link>
            ))}
            <button
              type="button"
              className="admin-nav-link sign-out"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              Sign out
            </button>
          </div>

          {/* Mobile hamburger */}
          <button
            type="button"
            className="admin-nav-hamburger"
            onClick={() => setOpen(!open)}
            aria-label={open ? "Close menu" : "Open menu"}
          >
            <span className={`hamburger-bar${open ? " open" : ""}`} />
            <span className={`hamburger-bar${open ? " open" : ""}`} />
            <span className={`hamburger-bar${open ? " open" : ""}`} />
          </button>
        </div>
      </nav>

      {/* Mobile drawer */}
      {open && (
        <>
          <div className="admin-nav-backdrop" onClick={() => setOpen(false)} />
          <div className="admin-nav-drawer">
            {adminLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`admin-nav-drawer-link${isActive(l.href) ? " active" : ""}`}
                onClick={() => setOpen(false)}
              >
                {l.label}
              </Link>
            ))}
            <button
              type="button"
              className="admin-nav-drawer-link sign-out"
              onClick={() => { setOpen(false); signOut({ callbackUrl: "/login" }); }}
            >
              Sign out
            </button>
          </div>
        </>
      )}
    </>
  );
}
