/**
 * @jest-environment jsdom
 */

import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MainPanel from "@/app/admin/students/[id]/recorder/MainPanel";
import type { MicControlsProps } from "@/app/admin/students/[id]/recorder/MicControls";

function micControlsFixture(): MicControlsProps {
  return {
    meterBarRef: createRef<HTMLDivElement>(),
    devices: [],
    selectedDeviceId: "",
    onDeviceChange: () => {},
    gainLinear: 1,
    onGainChange: () => {},
    isLive: false,
    lockDevice: false,
    chimeEnabled: true,
    onChimeEnabledChange: () => {},
    chimeVolume: 0.6,
    onChimeVolumeChange: () => {},
  };
}

function baseProps(
  overrides: Partial<React.ComponentProps<typeof MainPanel>> = {}
): React.ComponentProps<typeof MainPanel> {
  return {
    state: "idle",
    segmentNumber: 1,
    elapsed: 0,
    isWarning: false,
    micControls: micControlsFixture(),
    onStart: jest.fn(),
    onPause: jest.fn(),
    onResume: jest.fn(),
    onStop: jest.fn(),
    onReset: jest.fn(),
    ...overrides,
  };
}

describe("MainPanel idle/acquiring/ready", () => {
  test("idle: shows Start button enabled, with auto-save copy", () => {
    render(<MainPanel {...baseProps()} />);
    const start = screen.getByRole("button", { name: /start recording/i });
    expect(start).toBeInTheDocument();
    expect(start).not.toBeDisabled();
    expect(screen.getByText(/auto-save every/i)).toBeInTheDocument();
  });

  test("acquiring: shows 'Connecting…' label and disables start", () => {
    render(<MainPanel {...baseProps({ state: "acquiring" })} />);
    const btn = screen.getByRole("button", { name: /start recording/i });
    expect(btn).toHaveTextContent(/connecting/i);
    expect(btn).toBeDisabled();
  });

  test("ready: changes hint to 'Speak — watch the level bar'", () => {
    render(<MainPanel {...baseProps({ state: "ready" })} />);
    expect(screen.getByText(/speak — watch the level bar/i)).toBeInTheDocument();
  });

  test("disabled prop disables the start button", () => {
    render(<MainPanel {...baseProps({ disabled: true })} />);
    expect(
      screen.getByRole("button", { name: /start recording/i })
    ).toBeDisabled();
  });

  test("clicking Start triggers onStart", async () => {
    const onStart = jest.fn();
    render(<MainPanel {...baseProps({ onStart })} />);
    await userEvent.click(screen.getByRole("button", { name: /start recording/i }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});

describe("MainPanel recording/paused", () => {
  test("recording: shows Pause + Stop + Discard, hides Start", () => {
    render(
      <MainPanel
        {...baseProps({ state: "recording", segmentNumber: 2, elapsed: 65 })}
      />
    );
    expect(screen.queryByRole("button", { name: /start recording/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /pause recording/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /stop and save recording/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /discard recording/i })).toBeInTheDocument();
    // Header shows part + duration (65s -> 01:05)
    expect(screen.getByText(/part 2/i)).toBeInTheDocument();
    expect(screen.getByText(/01:05/)).toBeInTheDocument();
  });

  test("paused: Resume replaces Pause, status text says Paused", () => {
    render(<MainPanel {...baseProps({ state: "paused" })} />);
    expect(screen.queryByRole("button", { name: /pause recording/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /resume recording/i })).toBeInTheDocument();
    expect(screen.getByText(/^paused$/i)).toBeInTheDocument();
  });

  test("isWarning surfaces the time-left alert", () => {
    render(
      <MainPanel
        {...baseProps({ state: "recording", isWarning: true, elapsed: 100 })}
      />
    );
    // role=alert is on the warning span
    const alerts = screen.getAllByRole("alert");
    expect(alerts.some((el) => /save & continue automatically/i.test(el.textContent || ""))).toBe(true);
  });

  test("Pause/Resume/Stop/Discard each fire their handlers", async () => {
    const handlers = {
      onPause: jest.fn(),
      onResume: jest.fn(),
      onStop: jest.fn(),
      onReset: jest.fn(),
    };
    const { rerender } = render(
      <MainPanel {...baseProps({ state: "recording", ...handlers })} />
    );
    await userEvent.click(screen.getByRole("button", { name: /pause recording/i }));
    expect(handlers.onPause).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: /stop and save recording/i }));
    expect(handlers.onStop).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: /discard recording/i }));
    expect(handlers.onReset).toHaveBeenCalledTimes(1);

    rerender(<MainPanel {...baseProps({ state: "paused", ...handlers })} />);
    await userEvent.click(screen.getByRole("button", { name: /resume recording/i }));
    expect(handlers.onResume).toHaveBeenCalledTimes(1);
  });
});
