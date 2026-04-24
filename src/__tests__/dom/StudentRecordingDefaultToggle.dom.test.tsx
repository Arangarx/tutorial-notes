/**
 * @jest-environment jsdom
 */

/**
 * UI contract for the per-student "Start whiteboard recording on by
 * default" toggle. Sarah's pilot ask (Apr 2026): she shouldn't have to
 * un-tick Start on every session for students who declined recording
 * — this toggle on the student detail page is the source-of-truth.
 *
 * Things this test guards:
 *
 *   - Initial checked state mirrors the server-truth `initialEnabled`
 *     prop. A regression that flipped the default would silently
 *     re-record students who had been opted out.
 *
 *   - Click invokes the server action with the new value. `pending`
 *     is granted via React's `useTransition` — we await the action
 *     promise via the `findBy*` queries and `await act(...)` to let
 *     the transition flush.
 *
 *   - Failure reverts the optimistic UI AND surfaces an inline
 *     `role="alert"`. Without revert, the displayed state would lie
 *     about what's persisted.
 */

import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const setStudentRecordingDefaultMock = jest.fn();
jest.mock("@/app/admin/students/[id]/actions", () => ({
  __esModule: true,
  setStudentRecordingDefault: (...args: unknown[]) =>
    setStudentRecordingDefaultMock(...args),
}));

import { StudentRecordingDefaultToggle } from "@/app/admin/students/[id]/StudentRecordingDefaultToggle";

beforeEach(() => {
  setStudentRecordingDefaultMock.mockReset();
});

describe("StudentRecordingDefaultToggle", () => {
  it("renders checked when initialEnabled=true and shows '(on)'", () => {
    render(
      <StudentRecordingDefaultToggle studentId="stu_1" initialEnabled={true} />
    );
    const cb = screen.getByTestId(
      "student-recording-default-toggle"
    ) as HTMLInputElement;
    expect(cb.checked).toBe(true);
    expect(screen.getByText(/\(on\)/i)).toBeInTheDocument();
  });

  it("renders unchecked when initialEnabled=false and shows '(off)'", () => {
    render(
      <StudentRecordingDefaultToggle studentId="stu_1" initialEnabled={false} />
    );
    const cb = screen.getByTestId(
      "student-recording-default-toggle"
    ) as HTMLInputElement;
    expect(cb.checked).toBe(false);
    expect(screen.getByText(/\(off\)/i)).toBeInTheDocument();
  });

  it("clicking on calls setStudentRecordingDefault(id, true)", async () => {
    setStudentRecordingDefaultMock.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(
      <StudentRecordingDefaultToggle studentId="stu_42" initialEnabled={false} />
    );
    const cb = screen.getByTestId(
      "student-recording-default-toggle"
    ) as HTMLInputElement;

    await user.click(cb);

    await waitFor(() => {
      expect(setStudentRecordingDefaultMock).toHaveBeenCalledWith(
        "stu_42",
        true
      );
    });
    expect(cb.checked).toBe(true);
    expect(screen.getByText(/\(on\)/i)).toBeInTheDocument();
  });

  it("clicking off calls setStudentRecordingDefault(id, false)", async () => {
    setStudentRecordingDefaultMock.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(
      <StudentRecordingDefaultToggle studentId="stu_42" initialEnabled={true} />
    );
    const cb = screen.getByTestId(
      "student-recording-default-toggle"
    ) as HTMLInputElement;

    await user.click(cb);

    await waitFor(() => {
      expect(setStudentRecordingDefaultMock).toHaveBeenCalledWith(
        "stu_42",
        false
      );
    });
    expect(cb.checked).toBe(false);
  });

  it("reverts the optimistic UI and shows alert on action failure", async () => {
    setStudentRecordingDefaultMock.mockRejectedValueOnce(
      new Error("Database is on fire")
    );
    const user = userEvent.setup();
    render(
      <StudentRecordingDefaultToggle studentId="stu_x" initialEnabled={true} />
    );
    const cb = screen.getByTestId(
      "student-recording-default-toggle"
    ) as HTMLInputElement;

    await act(async () => {
      await user.click(cb);
    });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/database is on fire/i);
    });
    // Reverted to the original state.
    expect(cb.checked).toBe(true);
  });
});
