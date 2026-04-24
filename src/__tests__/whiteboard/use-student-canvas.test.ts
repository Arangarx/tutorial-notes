/**
 * @jest-environment jsdom
 */
/**
 * `useStudentWhiteboardCanvas` — suppresses re-broadcast when applying
 * remote scenes and calls broadcastScene for local edits.
 */
import { renderHook, act } from "@testing-library/react";
import { useStudentWhiteboardCanvas } from "@/hooks/useStudentWhiteboardCanvas";
import type { ExcalidrawApiLike } from "@/lib/whiteboard/insert-asset";
import type { ExcalidrawLikeElement } from "@/lib/whiteboard/excalidraw-adapter";
import type { WhiteboardSyncClient } from "@/lib/whiteboard/sync-client";

function makeMockSync() {
  const remoteCb: Array<
    (peerId: string, el: ReadonlyArray<ExcalidrawLikeElement>) => void
  > = [];
  const broadcastScene = jest.fn();
  const sync = {
    onRemoteScene: (cb: (typeof remoteCb)[number]) => {
      remoteCb.push(cb);
      return () => {
        const i = remoteCb.indexOf(cb);
        if (i >= 0) remoteCb.splice(i, 1);
      };
    },
    broadcastScene,
  };
  return {
    sync: sync as unknown as WhiteboardSyncClient,
    broadcastScene,
    emitRemote(peerId: string, el: ReadonlyArray<ExcalidrawLikeElement>) {
      for (const c of remoteCb) c(peerId, el);
    },
  };
}

describe("useStudentWhiteboardCanvas", () => {
  it("applies remote scenes via updateScene and does not broadcast in that path", async () => {
    const { sync, broadcastScene, emitRemote } = makeMockSync();
    const updateScene = jest.fn();
    const api = {
      updateScene,
      addFiles: jest.fn(),
    } as unknown as ExcalidrawApiLike;
    const { result } = renderHook(() => useStudentWhiteboardCanvas(sync, api));

    await act(async () => {
      emitRemote("tutor-1", []);
      await Promise.resolve();
    });
    expect(updateScene).toHaveBeenCalledWith({ elements: [] });
    expect(broadcastScene).not.toHaveBeenCalled();
    void result.current; // keep hook return alive for linter
  });

  it("broadcasts local onChange when not applying remote", () => {
    const { sync, broadcastScene } = makeMockSync();
    const api = { updateScene: jest.fn() } as unknown as ExcalidrawApiLike;
    const { result } = renderHook(() => useStudentWhiteboardCanvas(sync, api));

    act(() => {
      result.current.onCanvasChange([{ id: "x" } as unknown as ExcalidrawLikeElement]);
    });
    expect(broadcastScene).toHaveBeenCalled();
  });
});
