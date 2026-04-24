/**
 * @jest-environment jsdom
 */

/**
 * UI contract for the Resume-or-End gate.
 *
 * Sarah's pilot fix (Apr 2026): the workspace must NOT auto-reconnect
 * stale sessions. The gate intercepts the workspace render so the
 * sync client never instantiates while the prompt is showing — that's
 * what stops a stale student tab from ghost-joining.
 *
 * Things this test guards:
 *
 *   - Fresh sessions render children directly (no gate visible).
 *     A regression here would interrupt every workspace open.
 *
 *   - Stale sessions HIDE the children entirely until consent.
 *     If children leak through while the gate shows, the sync client
 *     in the workspace would still mount and connect — defeating
 *     the whole point of the gate.
 *
 *   - "Resume" reveals the children (the workspace mounts).
 *
 *   - "End" calls endStaleWhiteboardSession + redirects.
 *
 *   - Failure during End surfaces an alert and keeps the gate visible
 *     so the tutor can retry.
 */

import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const endStaleWhiteboardSessionMock = jest.fn();
const routerPushMock = jest.fn();

jest.mock("next/navigation", () => ({
  __esModule: true,
  useRouter: () => ({ push: routerPushMock }),
}));

jest.mock("@/app/admin/students/[id]/whiteboard/actions", () => ({
  __esModule: true,
  endStaleWhiteboardSession: (...args: unknown[]) =>
    endStaleWhiteboardSessionMock(...args),
}));

import { WorkspaceResumeGate } from "@/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WorkspaceResumeGate";

const NOW = 1_750_000_000_000;

beforeEach(() => {
  endStaleWhiteboardSessionMock.mockReset();
  routerPushMock.mockReset();
});

function CanaryChildren() {
  // We render a sentinel that the gate MUST NOT render until consent.
  return <div data-testid="workspace-canary">workspace mounted</div>;
}

describe("WorkspaceResumeGate", () => {
  it("renders children immediately when session is fresh (no gate)", () => {
    render(
      <WorkspaceResumeGate
        whiteboardSessionId="wb_1"
        studentId="stu_1"
        startedAtIso={new Date(NOW - 30_000).toISOString()}
        initialLastActiveAtIso={null}
        syncEnabled={true}
        __testOverrides={{ nowMs: NOW }}
      >
        <CanaryChildren />
      </WorkspaceResumeGate>
    );
    expect(screen.getByTestId("workspace-canary")).toBeInTheDocument();
    expect(screen.queryByTestId("wb-resume-gate")).not.toBeInTheDocument();
  });

  it("renders children directly in tutor-solo mode regardless of staleness", () => {
    render(
      <WorkspaceResumeGate
        whiteboardSessionId="wb_1"
        studentId="stu_1"
        startedAtIso={new Date(NOW - 24 * 60 * 60_000).toISOString()}
        initialLastActiveAtIso={new Date(NOW - 12 * 60 * 60_000).toISOString()}
        syncEnabled={false}
        __testOverrides={{ nowMs: NOW }}
      >
        <CanaryChildren />
      </WorkspaceResumeGate>
    );
    expect(screen.getByTestId("workspace-canary")).toBeInTheDocument();
    expect(screen.queryByTestId("wb-resume-gate")).not.toBeInTheDocument();
  });

  it("HIDES children and shows the gate for a stale session (no-join case)", () => {
    render(
      <WorkspaceResumeGate
        whiteboardSessionId="wb_1"
        studentId="stu_1"
        startedAtIso={new Date(NOW - 60 * 60_000).toISOString()} // 1h
        initialLastActiveAtIso={null}
        syncEnabled={true}
        __testOverrides={{ nowMs: NOW }}
      >
        <CanaryChildren />
      </WorkspaceResumeGate>
    );
    expect(screen.getByTestId("wb-resume-gate")).toBeInTheDocument();
    // Critical: the workspace MUST NOT have mounted yet, or the sync
    // client would be opening a WebSocket while the gate is showing.
    expect(screen.queryByTestId("workspace-canary")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Resume session/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /End session/i })
    ).toBeInTheDocument();
  });

  it("clicking Resume reveals the children and never hides them again", async () => {
    const user = userEvent.setup();
    render(
      <WorkspaceResumeGate
        whiteboardSessionId="wb_1"
        studentId="stu_1"
        startedAtIso={new Date(NOW - 60 * 60_000).toISOString()}
        initialLastActiveAtIso={new Date(NOW - 30 * 60_000).toISOString()}
        syncEnabled={true}
        __testOverrides={{ nowMs: NOW }}
      >
        <CanaryChildren />
      </WorkspaceResumeGate>
    );

    await user.click(screen.getByTestId("wb-resume-gate-resume"));

    expect(screen.getByTestId("workspace-canary")).toBeInTheDocument();
    expect(screen.queryByTestId("wb-resume-gate")).not.toBeInTheDocument();
  });

  it("clicking End calls endStaleWhiteboardSession and pushes to student page", async () => {
    endStaleWhiteboardSessionMock.mockResolvedValueOnce({
      endedAt: new Date().toISOString(),
      durationSeconds: 1234,
    });
    const user = userEvent.setup();
    render(
      <WorkspaceResumeGate
        whiteboardSessionId="wb_42"
        studentId="stu_99"
        startedAtIso={new Date(NOW - 2 * 60 * 60_000).toISOString()}
        initialLastActiveAtIso={null}
        syncEnabled={true}
        __testOverrides={{ nowMs: NOW }}
      >
        <CanaryChildren />
      </WorkspaceResumeGate>
    );

    await user.click(screen.getByTestId("wb-resume-gate-end"));

    await waitFor(() => {
      expect(endStaleWhiteboardSessionMock).toHaveBeenCalledWith("wb_42");
    });
    await waitFor(() => {
      expect(routerPushMock).toHaveBeenCalledWith("/admin/students/stu_99");
    });
  });

  it("End failure surfaces alert and keeps gate visible", async () => {
    endStaleWhiteboardSessionMock.mockRejectedValueOnce(
      new Error("Database is on fire")
    );
    const user = userEvent.setup();
    render(
      <WorkspaceResumeGate
        whiteboardSessionId="wb_42"
        studentId="stu_99"
        startedAtIso={new Date(NOW - 2 * 60 * 60_000).toISOString()}
        initialLastActiveAtIso={null}
        syncEnabled={true}
        __testOverrides={{ nowMs: NOW }}
      >
        <CanaryChildren />
      </WorkspaceResumeGate>
    );

    await act(async () => {
      await user.click(screen.getByTestId("wb-resume-gate-end"));
    });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/database is on fire/i);
    });
    // Gate still showing, workspace still hidden.
    expect(screen.getByTestId("wb-resume-gate")).toBeInTheDocument();
    expect(screen.queryByTestId("workspace-canary")).not.toBeInTheDocument();
    expect(routerPushMock).not.toHaveBeenCalled();
  });
});
