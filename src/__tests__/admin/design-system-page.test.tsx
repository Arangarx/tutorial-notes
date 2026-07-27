/**
 * @jest-environment jsdom
 *
 * /admin/design-system — platform-maintainer gallery gate + render smoke.
 */

import { render, screen } from "@testing-library/react";
import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";

jest.mock("next-auth", () => ({
  getServerSession: jest.fn(),
}));

jest.mock("next/navigation", () => ({
  __esModule: true,
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  usePathname: jest.fn(() => "/admin/design-system"),
}));

jest.mock("@/lib/env", () => ({
  env: {
    OPERATOR_EMAILS: "operator@example.com",
    ADMIN_EMAIL: "operator@example.com",
  },
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

jest.mock("@/components/ThemeProvider", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
  useTheme: () => ({
    mode: "system" as const,
    resolvedTheme: "light" as const,
    setMode: jest.fn(),
  }),
}));

const mockGetServerSession = getServerSession as jest.Mock;
const mockNotFound = notFound as jest.Mock;

const OPERATOR_EMAIL = "operator@example.com";

describe("/admin/design-system page gate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls notFound() when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { default: AdminDesignSystemPage } = await import("@/app/admin/design-system/page");
    await expect(AdminDesignSystemPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockNotFound).toHaveBeenCalled();
  });

  it("calls notFound() for signed-in non-operator tutor", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { email: "tutor@example.com", id: "tutor-1", role: "TUTOR" },
    });
    const { default: AdminDesignSystemPage } = await import("@/app/admin/design-system/page");
    await expect(AdminDesignSystemPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockNotFound).toHaveBeenCalled();
  });

  it("loads for operator session and renders key gallery testids", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { email: OPERATOR_EMAIL, id: "op-1", role: "ADMIN" },
    });
    const { default: AdminDesignSystemPage } = await import("@/app/admin/design-system/page");
    const tree = await AdminDesignSystemPage();
    render(tree);

    expect(mockNotFound).not.toHaveBeenCalled();
    expect(screen.getByTestId("design-system-gallery")).toBeInTheDocument();
    expect(screen.getByTestId("design-system-primitives")).toBeInTheDocument();
    expect(screen.getByTestId("specimen-button")).toBeInTheDocument();
    expect(screen.getByTestId("specimen-input")).toBeInTheDocument();
    expect(screen.getByTestId("design-system-patterns")).toBeInTheDocument();
    expect(screen.getByTestId("design-system-compositions")).toBeInTheDocument();
    expect(screen.getByTestId("design-system-live-links")).toBeInTheDocument();
    expect(screen.getByTestId("design-system-fenced")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Design system" })).toBeInTheDocument();
  });
});

describe("/admin/design-system source contract", () => {
  it("documents platform-operator-only scope in page source", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const pagePath = path.resolve(__dirname, "../../app/admin/design-system/page.tsx");
    const content = fs.readFileSync(pagePath, "utf-8");
    expect(content).toContain("requireOperator");
    expect(content).toContain("NOT future school/org admins");
  });
});
