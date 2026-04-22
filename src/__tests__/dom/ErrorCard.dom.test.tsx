/**
 * @jest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ErrorCard from "@/app/admin/students/[id]/recorder/ErrorCard";

describe("ErrorCard", () => {
  test("renders the error in a role=alert region", () => {
    render(<ErrorCard error="mic blocked" onReset={() => {}} />);
    expect(screen.getByRole("alert")).toHaveTextContent("mic blocked");
    expect(screen.getByTestId("audio-record-error")).toBeInTheDocument();
  });

  test("omits the alert region when error is null", () => {
    render(<ErrorCard error={null} onReset={() => {}} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByTestId("audio-record-error")).not.toBeInTheDocument();
  });

  test("Try again button triggers onReset", async () => {
    const onReset = jest.fn();
    render(<ErrorCard error="boom" onReset={onReset} />);
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
