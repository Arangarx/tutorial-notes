/**
 * @jest-environment jsdom
 */

/**
 * Behavioural tests for AudioInputTabs (B3).
 *
 * The structural always-mount contract lives in keep-recorder-mounted.dom.test.tsx.
 * Here we cover the user-facing UX:
 *   - The recording-in-progress confirm prompt fires when leaving Record
 *     while recordingActive=true; does NOT fire when idle.
 *   - The pre-existing hasAudio confirm still fires after a recording
 *     completes.
 *   - Cancelling the prompt keeps the active tab.
 *
 * AudioRecordInput / AudioUploadInput are stubbed so we don't need a
 * MediaRecorder mock — the stub lets the test trigger
 * `onRecordingActive` and `onRecorded` callbacks via test-only buttons.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

type RecorderStubProps = {
  onRecordingActive?: (active: boolean) => void;
  onRecorded: (audio: { blobUrl: string; mimeType: string; sizeBytes: number; filename: string }) => void;
};

jest.mock("@/app/admin/students/[id]/AudioRecordInput", () => {
  return {
    __esModule: true,
    default: function StubRecorder({ onRecordingActive, onRecorded }: RecorderStubProps) {
      return (
        <div data-testid="stub-recorder">
          <button
            type="button"
            data-testid="stub-recorder-start"
            onClick={() => onRecordingActive?.(true)}
          >
            stub-start
          </button>
          <button
            type="button"
            data-testid="stub-recorder-stop"
            onClick={() => onRecordingActive?.(false)}
          >
            stub-stop
          </button>
          <button
            type="button"
            data-testid="stub-recorder-finish"
            onClick={() => {
              onRecordingActive?.(false);
              onRecorded({
                blobUrl: "https://blob/x",
                mimeType: "audio/webm",
                sizeBytes: 10,
                filename: "rec.webm",
              });
            }}
          >
            stub-finish
          </button>
        </div>
      );
    },
  };
});

jest.mock("@/app/admin/students/[id]/AudioUploadInput", () => ({
  __esModule: true,
  default: function StubUpload() {
    return <div data-testid="stub-upload">upload</div>;
  },
}));

import AudioInputTabs from "@/app/admin/students/[id]/AudioInputTabs";

function Harness({
  initialTab = "record" as "text" | "upload" | "record",
  onAudioReady = () => {},
  onAudioCleared = () => {},
}: {
  initialTab?: "text" | "upload" | "record";
  onAudioReady?: (audio: unknown) => void;
  onAudioCleared?: () => void;
}) {
  const React = jest.requireActual("react") as typeof import("react");
  const [tab, setTab] = React.useState<"text" | "upload" | "record">(initialTab);
  return (
    <div>
      <div data-testid="active-tab">{tab}</div>
      <AudioInputTabs
        studentId="s1"
        activeTab={tab}
        onTabChange={setTab}
        onAudioReady={onAudioReady}
        onAudioCleared={onAudioCleared}
        blobEnabled
      />
    </div>
  );
}

describe("AudioInputTabs — recording-in-progress confirm (B3)", () => {
  let confirmSpy: jest.SpyInstance;

  beforeEach(() => {
    confirmSpy = jest.spyOn(window, "confirm");
  });

  afterEach(() => {
    confirmSpy.mockRestore();
  });

  test("does NOT prompt when leaving Record with no recording active", async () => {
    confirmSpy.mockReturnValue(true);
    render(<Harness />);
    await userEvent.click(screen.getByRole("tab", { name: /paste text/i }));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId("active-tab")).toHaveTextContent("text");
  });

  test("prompts and switches when leaving Record with a recording active and user confirms", async () => {
    confirmSpy.mockReturnValue(true);
    render(<Harness />);

    await userEvent.click(screen.getByTestId("stub-recorder-start"));
    await userEvent.click(screen.getByRole("tab", { name: /paste text/i }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy.mock.calls[0][0]).toMatch(/recording is in progress/i);
    expect(screen.getByTestId("active-tab")).toHaveTextContent("text");
  });

  test("prompts and stays on Record with a recording active when user cancels", async () => {
    confirmSpy.mockReturnValue(false);
    render(<Harness />);

    await userEvent.click(screen.getByTestId("stub-recorder-start"));
    await userEvent.click(screen.getByRole("tab", { name: /paste text/i }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("active-tab")).toHaveTextContent("record");
  });

  test("after stopping a recording without finalising audio, no prompt fires", async () => {
    confirmSpy.mockReturnValue(true);
    render(<Harness />);

    await userEvent.click(screen.getByTestId("stub-recorder-start"));
    await userEvent.click(screen.getByTestId("stub-recorder-stop"));
    await userEvent.click(screen.getByRole("tab", { name: /upload audio/i }));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId("active-tab")).toHaveTextContent("upload");
  });

  test("after finalising a recording, the existing hasAudio prompt still fires (separate confirm)", async () => {
    confirmSpy.mockReturnValue(true);
    const onAudioCleared = jest.fn();
    render(<Harness onAudioCleared={onAudioCleared} />);

    await userEvent.click(screen.getByTestId("stub-recorder-start"));
    await userEvent.click(screen.getByTestId("stub-recorder-finish"));
    await userEvent.click(screen.getByRole("tab", { name: /paste text/i }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy.mock.calls[0][0]).toMatch(/discard the current audio/i);
    expect(onAudioCleared).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("active-tab")).toHaveTextContent("text");
  });
});
