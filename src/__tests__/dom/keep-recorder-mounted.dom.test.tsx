/**
 * @jest-environment jsdom
 */

/**
 * Regression test: switching away from the Record tab MUST NOT unmount the
 * recorder. If the recorder unmounts mid-recording, MediaRecorder.stop() is
 * called silently in the cleanup effect and the tutor loses the in-progress
 * audio with no warning.
 *
 * Background: see docs/BACKLOG.md "Switching tabs while recording silently
 * kills the recording" + the Phase 4 / B3 entries in the recorder refactor
 * plan. Pre-B3 (current `master`), AudioInputTabs uses
 *   `{activeTab === "record" && <AudioRecordInput .../>}`
 * which unmounts on every tab change. Post-B3, the recorder lives inside a
 * wrapper that toggles `display` instead of conditional rendering, so the
 * hook + MediaRecorder + mic stream all stay alive.
 *
 * The describe block is `describe.skip` until B3 lands. B3 will flip it to a
 * regular describe and the tests will pass against the new always-mount
 * implementation.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Lightweight stub to detect mount/unmount churn without dragging in the
// real useAudioRecorder + MediaRecorder mocks. The contract we care about
// here is purely structural: AudioInputTabs must keep this child mounted
// across tab switches.
let mountCount = 0;
let unmountCount = 0;

jest.mock("@/app/admin/students/[id]/AudioRecordInput", () => {
  const React = jest.requireActual("react") as typeof import("react");
  function StubRecorder() {
    React.useEffect(() => {
      mountCount++;
      return () => {
        unmountCount++;
      };
    }, []);
    return <div data-testid="stub-recorder">recorder</div>;
  }
  return { __esModule: true, default: StubRecorder };
});

jest.mock("@/app/admin/students/[id]/AudioUploadInput", () => {
  function StubUpload() {
    return <div data-testid="stub-upload">upload</div>;
  }
  return { __esModule: true, default: StubUpload };
});

import AudioInputTabs from "@/app/admin/students/[id]/AudioInputTabs";

function Harness() {
  const React = jest.requireActual("react") as typeof import("react");
  const [tab, setTab] = React.useState<"text" | "upload" | "record">("record");
  return (
    <AudioInputTabs
      studentId="s1"
      activeTab={tab}
      onTabChange={setTab}
      onAudioReady={() => {}}
      onAudioCleared={() => {}}
      blobEnabled
    />
  );
}

beforeEach(() => {
  mountCount = 0;
  unmountCount = 0;
});

// TODO(B3): un-skip when AudioInputTabs is changed to always-mount the
// recorder behind a display-toggle wrapper. Tests below assert the contract
// the new implementation must satisfy.
describe.skip("AudioInputTabs keep-recorder-mounted regression (B3)", () => {
  test("recorder mounts once on initial render and stays mounted across tab changes", async () => {
    render(<Harness />);
    expect(mountCount).toBe(1);
    expect(unmountCount).toBe(0);
    expect(screen.getByTestId("stub-recorder")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: /paste text/i }));
    // Recorder must still be in the DOM (even if visually hidden) and must
    // not have unmounted.
    expect(unmountCount).toBe(0);
    expect(screen.getByTestId("stub-recorder")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: /upload audio/i }));
    expect(unmountCount).toBe(0);

    await userEvent.click(screen.getByRole("tab", { name: /record/i }));
    expect(mountCount).toBe(1); // never re-mounted
    expect(unmountCount).toBe(0);
  });

  test("the recorder's wrapper toggles visibility (display:none) for non-record tabs", async () => {
    render(<Harness />);
    const recorder = screen.getByTestId("stub-recorder");
    // On the Record tab, the wrapper around the recorder should be visible.
    // On non-Record tabs, the wrapper hides via display:none.
    // We check the closest ancestor element to the recorder for a style toggle.
    const recordTabWrapper = recorder.parentElement;
    expect(recordTabWrapper).toBeTruthy();
    if (!recordTabWrapper) return;

    expect(recordTabWrapper.style.display).not.toBe("none");

    await userEvent.click(screen.getByRole("tab", { name: /paste text/i }));
    expect(recordTabWrapper.style.display).toBe("none");
  });
});
