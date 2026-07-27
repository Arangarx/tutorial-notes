/**
 * @jest-environment jsdom
 *
 * Wave A dedupe — StatTile + QuickLinkCard canonical admin dashboard tiles.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { StatTile } from "@/components/admin/StatTile";
import { QuickLinkCard } from "@/components/admin/QuickLinkCard";
import { ADMIN_TILE_SHELL_CLASS } from "@/components/admin/admin-tile-shell";

jest.mock("next/link", () => {
  return function MockLink({
    href,
    children,
    className,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) {
    return (
      <a href={href} className={className} {...rest}>
        {children}
      </a>
    );
  };
});

describe("StatTile", () => {
  it("renders label, value, and optional sub copy", () => {
    const { container, rerender } = render(
      <StatTile label="Sessions this month" value="42" />
    );

    expect(screen.getByText("Sessions this month")).toHaveClass("text-xs", "text-muted-foreground");
    expect(screen.getByText("42")).toHaveClass("text-2xl", "font-bold", "text-foreground");
    expect(screen.queryByText(/sessions$/i)).toBeNull();
    expect(container.firstElementChild).toHaveClass(...ADMIN_TILE_SHELL_CLASS.split(" "));

    rerender(
      <StatTile label="Avg / session (30d)" value="$1.23" sub="12 sessions" />
    );
    expect(screen.getByText("12 sessions")).toHaveClass("text-[11px]", "text-muted-foreground");
  });
});

describe("QuickLinkCard", () => {
  it("renders default link tile with eyebrow and title", () => {
    render(<QuickLinkCard href="/admin/feedback" eyebrow="Operator" title="Feedback inbox" />);

    const link = screen.getByRole("link", { name: /Feedback inbox/i });
    expect(link).toHaveAttribute("href", "/admin/feedback");
    expect(link.className).toContain("hover:border-accent/40");
    expect(screen.getByText("Operator")).toHaveClass("label-mono", "text-accent-text");
    expect(screen.getByText("Feedback inbox")).toHaveClass("font-semibold", "text-foreground");
  });

  it("renders emphasized brand variant with title suffix", () => {
    render(
      <QuickLinkCard
        href="/admin/tutor-approvals"
        eyebrow="Operator"
        title="Tutor approvals"
        emphasized
        titleSuffix="(3 pending)"
      />
    );

    const link = screen.getByRole("link", { name: /Tutor approvals/i });
    expect(link.className).toContain("bg-brand");
    expect(link.className).not.toContain("border-border");
    expect(screen.getByText("Operator")).toHaveClass("text-[color:var(--brand-eyebrow)]");
    expect(screen.getByText("Tutor approvals")).toHaveClass("text-[color:var(--brand-on)]");
    expect(screen.getByText("(3 pending)")).toBeInTheDocument();
  });
});
