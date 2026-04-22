/**
 * @jest-environment jsdom
 */

import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import UploadingPanel from "@/app/admin/students/[id]/recorder/UploadingPanel";
import type { MicControlsProps } from "@/app/admin/students/[id]/recorder/MicControls";

function micControlsFixture(): MicControlsProps {
  return {
    meterBarRef: createRef<HTMLDivElement>(),
    devices: [],
    selectedDeviceId: "",
    onDeviceChange: () => {},
    gainLinear: 1,
    onGainChange: () => {},
    isLive: true,
    lockDevice: true,
    chimeEnabled: true,
    onChimeEnabledChange: () => {},
    chimeVolume: 0.6,
    onChimeVolumeChange: () => {},
  };
}

describe("UploadingPanel", () => {
  test("final mode renders just the progress bar (no mic controls)", () => {
    render(<UploadingPanel mode="final" />);
    expect(screen.getByTestId("audio-record-uploading")).toBeInTheDocument();
    expect(screen.queryByTestId("mic-controls")).not.toBeInTheDocument();
    expect(screen.getByText(/uploading recording/i)).toBeInTheDocument();
  });

  test("segment mode keeps mic controls visible and shows segment number", () => {
    render(
      <UploadingPanel
        mode="segment"
        micControls={micControlsFixture()}
        segmentNumber={3}
      />
    );
    expect(screen.getByTestId("audio-record-uploading-segment")).toBeInTheDocument();
    expect(screen.getByTestId("mic-controls")).toBeInTheDocument();
    expect(screen.getByText(/saving segment 3/i)).toBeInTheDocument();
  });

  test("segment mode without micControls throws (programmer error)", () => {
    // Suppress the React error log for this expected throw.
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      render(<UploadingPanel mode="segment" segmentNumber={1} />)
    ).toThrow(/requires micControls/i);
    spy.mockRestore();
  });
});
