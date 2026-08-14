/**
 * @jest-environment jsdom
 */

/**
 * T10 — StartWhiteboardSession consent affordance + ConsentError UX.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const createWhiteboardSessionMock = jest.fn();
jest.mock("@/app/admin/students/[id]/whiteboard/actions", () => ({
  __esModule: true,
  createWhiteboardSession: (...args: unknown[]) =>
    createWhiteboardSessionMock(...args),
}));

import { StartWhiteboardSession } from "@/app/admin/students/[id]/whiteboard/StartWhiteboardSession";
import {
  CONSENT_RECORD_PARENT_SECTION_HINT,
  CONSENT_RECORD_TUTOR_MESSAGE,
} from "@/lib/consent-action-error";

const baseProps = {
  studentId: "stu_1",
  consentRecordExists: true,
  isSelfLearner: false,
  studentClaimed: true,
} as const;

beforeEach(() => {
  createWhiteboardSessionMock.mockReset();
});

describe("StartWhiteboardSession — T10 consent affordance", () => {
  it("replaces Start with claim/consent callout when no record (claimed minor)", () => {
    render(
      <StartWhiteboardSession
        {...baseProps}
        consentRecordExists={false}
        isSelfLearner={false}
        studentClaimed={true}
      />
    );

    const callout = screen.getByTestId("start-wb-consent-callout");
    expect(callout).toBeInTheDocument();
    expect(callout).toHaveAttribute("role", "alert");
    expect(
      screen.getByText(/Start whiteboard session unavailable/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/privacy preferences are not complete/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("start-whiteboard-session-btn")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /parent account/i })
    ).not.toBeInTheDocument();
  });

  it("replaces Start with callout when student is unclaimed", () => {
    render(
      <StartWhiteboardSession
        {...baseProps}
        consentRecordExists={false}
        studentClaimed={false}
        claimInvitesEnabled={true}
        hasTopClaimBanner={true}
      />
    );

    expect(screen.getByTestId("start-wb-consent-callout")).toBeInTheDocument();
    expect(screen.getByText(/banner above/i)).toBeInTheDocument();
    expect(
      screen.queryByTestId("start-whiteboard-session-btn")
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /parent account/i })).toHaveAttribute(
      "href",
      "/admin/students/stu_1#student-section-parent"
    );
  });

  it("renders normal Start when consent record exists", () => {
    render(
      <StartWhiteboardSession
        {...baseProps}
        consentRecordExists={true}
        isSelfLearner={false}
        studentClaimed={true}
      />
    );

    expect(screen.getByTestId("start-whiteboard-session-btn")).toBeInTheDocument();
    expect(
      screen.queryByTestId("start-wb-consent-callout")
    ).not.toBeInTheDocument();
  });

  it("renders normal Start for self-learner without consent record", () => {
    render(
      <StartWhiteboardSession
        {...baseProps}
        consentRecordExists={false}
        isSelfLearner={true}
        studentClaimed={true}
      />
    );

    expect(screen.getByTestId("start-whiteboard-session-btn")).toBeInTheDocument();
    expect(
      screen.queryByTestId("start-wb-consent-callout")
    ).not.toBeInTheDocument();
  });

  it("replaces Start with erasure callout when access is suspended (ER-4)", () => {
    render(
      <StartWhiteboardSession
        {...baseProps}
        accessSuspended={true}
      />
    );

    expect(screen.getByTestId("start-wb-erasure-callout")).toBeInTheDocument();
    expect(
      screen.queryByTestId("start-whiteboard-session-btn")
    ).not.toBeInTheDocument();
    expect(createWhiteboardSessionMock).not.toHaveBeenCalled();
  });

  it("maps ConsentError from the action to friendly copy without Error ID", async () => {
    const consentErr = Object.assign(
      new Error(
        "Parent privacy preferences must be set before starting a session."
      ),
      { name: "ConsentError", permission: "consentRecord" }
    );
    createWhiteboardSessionMock.mockRejectedValueOnce(consentErr);

    const user = userEvent.setup();
    render(<StartWhiteboardSession {...baseProps} />);

    await user.click(screen.getByTestId("start-whiteboard-session-btn"));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        CONSENT_RECORD_TUTOR_MESSAGE
      );
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      CONSENT_RECORD_PARENT_SECTION_HINT
    );
    expect(screen.getByRole("alert").textContent).not.toMatch(/Error ID/i);
  });

  it("surfaces allowLiveSession server message verbatim without digest", async () => {
    const liveDeniedMsg =
      "Live sessions are not permitted under the parent's current privacy preferences.";
    const consentErr = Object.assign(new Error(liveDeniedMsg), {
      name: "ConsentError",
      permission: "allowLiveSession",
    });
    createWhiteboardSessionMock.mockRejectedValueOnce(consentErr);

    const user = userEvent.setup();
    render(<StartWhiteboardSession {...baseProps} />);

    await user.click(screen.getByTestId("start-whiteboard-session-btn"));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(liveDeniedMsg);
    });
    expect(screen.getByRole("alert").textContent).not.toMatch(/Error ID/i);
  });
});
