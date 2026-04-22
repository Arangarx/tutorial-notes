/**
 * @jest-environment jsdom
 */

import { render, screen, fireEvent } from "@testing-library/react";
import AudioPreview from "@/app/admin/students/[id]/AudioPreview";

describe("AudioPreview", () => {
  test("renders an <audio controls> with the src", () => {
    render(<AudioPreview src="blob:https://x/y" mimeType="audio/webm" />);
    const audio = screen.getByTestId("audio-preview") as HTMLAudioElement;
    expect(audio).toBeInTheDocument();
    expect(audio.tagName).toBe("AUDIO");
    expect(audio).toHaveAttribute("controls");
    expect(audio.getAttribute("src")).toBe("blob:https://x/y");
  });

  test("WebM duration hack: on loadedmetadata with bad duration, currentTime is bumped", () => {
    render(<AudioPreview src="blob:https://x/webm" mimeType="audio/webm" />);
    const audio = screen.getByTestId("audio-preview") as HTMLAudioElement;
    // jsdom defaults duration to NaN — bad enough to trigger the hack.
    fireEvent.loadedMetadata(audio);
    // currentTime should now be a very large finite number (1e101 attempted).
    // jsdom may clamp; just check it's been written to (anything > 0 means
    // the seek hack ran).
    expect(audio.currentTime).toBeGreaterThan(0);
  });

  test("WebM duration hack does NOT run for MP4 (already-correct duration)", () => {
    render(<AudioPreview src="blob:https://x/m4a" mimeType="audio/mp4" />);
    const audio = screen.getByTestId("audio-preview") as HTMLAudioElement;
    fireEvent.loadedMetadata(audio);
    expect(audio.currentTime).toBe(0);
  });

  test("error event after metadata loaded is ignored (Chrome quirk)", () => {
    render(<AudioPreview src="blob:https://x/y" mimeType="audio/webm" />);
    const audio = screen.getByTestId("audio-preview") as HTMLAudioElement;
    // Simulate Chrome's sequence: metadata loads, then error fires from our
    // out-of-range seek hack. The fallback message must NOT appear.
    fireEvent.loadedMetadata(audio);
    fireEvent.error(audio);
    expect(screen.queryByTestId("audio-preview-error")).not.toBeInTheDocument();
    expect(screen.getByTestId("audio-preview")).toBeInTheDocument();
  });

  test("error event BEFORE metadata loaded surfaces the fallback message", () => {
    render(<AudioPreview src="blob:https://x/y" mimeType="audio/webm" />);
    const audio = screen.getByTestId("audio-preview") as HTMLAudioElement;
    fireEvent.error(audio);
    expect(screen.getByTestId("audio-preview-error")).toBeInTheDocument();
    expect(screen.queryByTestId("audio-preview")).not.toBeInTheDocument();
  });
});
