/**
 * @jest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PendingSegmentList from "@/app/admin/students/[id]/PendingSegmentList";
import type { AudioResult } from "@/app/admin/students/[id]/AudioInputTabs";

function audio(overrides: Partial<AudioResult> = {}): AudioResult {
  return {
    blobUrl: `https://x/${Math.random().toString(36).slice(2)}`,
    mimeType: "audio/webm",
    sizeBytes: 1024,
    filename: "seg.webm",
    previewUrl: "blob:https://x/preview",
    ...overrides,
  };
}

describe("PendingSegmentList", () => {
  test("renders nothing when audios is empty", () => {
    const { container } = render(
      <PendingSegmentList audios={[]} onRemove={() => {}} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  test("single segment: shows 'Part 1' without 'of N' suffix", () => {
    render(
      <PendingSegmentList audios={[audio()]} onRemove={() => {}} />
    );
    expect(screen.getByText(/^Part 1$/)).toBeInTheDocument();
    expect(screen.queryByText(/of 1/)).not.toBeInTheDocument();
  });

  test("multi-segment: shows 'Part i of N' label for each", () => {
    render(
      <PendingSegmentList
        audios={[audio(), audio(), audio()]}
        onRemove={() => {}}
      />
    );
    expect(screen.getByText(/Part 1 of 3/)).toBeInTheDocument();
    expect(screen.getByText(/Part 2 of 3/)).toBeInTheDocument();
    expect(screen.getByText(/Part 3 of 3/)).toBeInTheDocument();
  });

  test("renders AudioPreview when previewUrl is set", () => {
    render(
      <PendingSegmentList audios={[audio()]} onRemove={() => {}} />
    );
    expect(screen.getByTestId("audio-preview")).toBeInTheDocument();
  });

  test("renders 'Saved — no preview' fallback when previewUrl is missing", () => {
    render(
      <PendingSegmentList
        audios={[audio({ previewUrl: undefined })]}
        onRemove={() => {}}
      />
    );
    expect(screen.queryByTestId("audio-preview")).not.toBeInTheDocument();
    expect(screen.getByText(/saved — no preview/i)).toBeInTheDocument();
  });

  test("clicking remove fires onRemove with the index", async () => {
    const onRemove = jest.fn();
    render(
      <PendingSegmentList
        audios={[audio(), audio(), audio()]}
        onRemove={onRemove}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /remove segment 2/i }));
    expect(onRemove).toHaveBeenCalledWith(1);
  });

  test("disabled prop disables every remove button", () => {
    render(
      <PendingSegmentList
        audios={[audio(), audio()]}
        onRemove={() => {}}
        disabled
      />
    );
    for (const btn of screen.getAllByRole("button", { name: /remove segment/i })) {
      expect(btn).toBeDisabled();
    }
  });
});
