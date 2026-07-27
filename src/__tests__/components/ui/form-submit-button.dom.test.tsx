/**
 * @jest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import { useFormStatus } from "react-dom";

import { FormSubmitButton } from "@/components/ui/form-submit-button";

jest.mock("react-dom", () => ({
  ...jest.requireActual<typeof import("react-dom")>("react-dom"),
  useFormStatus: jest.fn(),
}));

const mockUseFormStatus = useFormStatus as jest.MockedFunction<typeof useFormStatus>;

describe("FormSubmitButton", () => {
  beforeEach(() => {
    mockUseFormStatus.mockReset();
  });

  it("renders label when idle", () => {
    mockUseFormStatus.mockReturnValue({ pending: false, data: null, method: null, action: null });
    render(<FormSubmitButton label="Save" />);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toHaveTextContent("Save");
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute("aria-busy", "false");
  });

  it("swaps label, disables, and sets aria-busy when pending", () => {
    mockUseFormStatus.mockReturnValue({ pending: true, data: null, method: null, action: null });
    render(<FormSubmitButton label="Save" pendingLabel="Saving…" />);
    const button = screen.getByRole("button", { name: "Saving…" });
    expect(button).toHaveTextContent("Saving…");
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });

  it("defaults pending label to label with ellipsis", () => {
    mockUseFormStatus.mockReturnValue({ pending: true, data: null, method: null, action: null });
    render(<FormSubmitButton label="Send" />);
    expect(screen.getByRole("button", { name: "Send…" })).toHaveTextContent("Send…");
  });
});
