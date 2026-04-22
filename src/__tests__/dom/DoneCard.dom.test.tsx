/**
 * @jest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DoneCard from "@/app/admin/students/[id]/recorder/DoneCard";

describe("DoneCard", () => {
  test("renders saved duration in MM:SS form", () => {
    render(<DoneCard doneSegmentSeconds={75} onReset={() => {}} />);
    // 75s -> 01:15
    expect(screen.getByTestId("audio-record-done")).toHaveTextContent(/01:15/);
  });

  test("renders saved duration in H:MM:SS for >= 1 hour", () => {
    render(<DoneCard doneSegmentSeconds={3661} onReset={() => {}} />);
    // 3661 -> 1:01:01
    expect(screen.getByTestId("audio-record-done")).toHaveTextContent(/1:01:01/);
  });

  test("Re-record button triggers onReset", async () => {
    const onReset = jest.fn();
    render(<DoneCard doneSegmentSeconds={42} onReset={onReset} />);
    await userEvent.click(screen.getByRole("button", { name: /re-record/i }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
