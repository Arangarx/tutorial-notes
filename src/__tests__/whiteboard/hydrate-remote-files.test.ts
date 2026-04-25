/**
 * @jest-environment jsdom
 */
import { hydrateRemoteImageFilesForScene } from "@/lib/whiteboard/hydrate-remote-files";
import type { ExcalidrawApiLike } from "@/lib/whiteboard/insert-asset";
import type { ExcalidrawLikeElement } from "@/lib/whiteboard/excalidraw-adapter";

describe("hydrateRemoteImageFilesForScene", () => {
  const origFetch = global.fetch;

  afterEach(() => {
    global.fetch = origFetch;
  });

  it("retries once on failure then gives up and records giveUp", async () => {
    let calls = 0;
    global.fetch = jest.fn().mockImplementation(() => {
      calls += 1;
      return Promise.resolve({
        ok: false,
        status: 500,
        headers: { get: () => null },
      } as unknown as Response);
    });

    const addFiles = jest.fn();
    const api = { addFiles, updateScene: jest.fn() } as unknown as ExcalidrawApiLike;
    const loaded = new Set<string>();
    const giveUp = new Set<string>();
    const el: ExcalidrawLikeElement = {
      id: "e1",
      type: "image",
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      fileId: "fid-1",
      customData: { assetUrl: "https://example.com/a.png" },
    };

    const r = await hydrateRemoteImageFilesForScene(api, [el], loaded, {
      logContext: "student",
      giveUpFileIds: giveUp,
    });

    expect(calls).toBe(2);
    expect(r.fetchFailed.length).toBe(1);
    expect(r.fetchFailed[0]?.fileId).toBe("fid-1");
    expect(giveUp.has("fid-1")).toBe(true);
    expect(addFiles).not.toHaveBeenCalled();
  });

  it("adds file on first successful fetch", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "image/png" },
      blob: () => Promise.resolve(new Blob([png], { type: "image/png" })),
    } as unknown as Response);

    const addFiles = jest.fn();
    const api = { addFiles, updateScene: jest.fn() } as unknown as ExcalidrawApiLike;
    const loaded = new Set<string>();
    const el: ExcalidrawLikeElement = {
      id: "e1",
      type: "image",
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      fileId: "fid-ok",
      customData: { assetUrl: "https://example.com/ok.png" },
    };

    const r = await hydrateRemoteImageFilesForScene(api, [el], loaded, {
      logContext: "tutor",
    });

    expect(r.addedFileCount).toBe(1);
    expect(loaded.has("fid-ok")).toBe(true);
    expect(addFiles).toHaveBeenCalledTimes(1);
    expect((addFiles.mock.calls[0] as [unknown])[0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "fid-ok", mimeType: "image/png" }),
      ])
    );
  });

  it("re-fetches when loadedFileIds has fileId but Excalidraw no longer has the binary (tab switch eviction)", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "image/png" },
      blob: () => Promise.resolve(new Blob([png], { type: "image/png" })),
    } as unknown as Response);

    const addFiles = jest.fn();
    const api = {
      addFiles,
      updateScene: jest.fn(),
      getFiles: () => ({}),
    } as unknown as ExcalidrawApiLike;
    const loaded = new Set<string>(["fid-revive"]);
    const el: ExcalidrawLikeElement = {
      id: "e1",
      type: "image",
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      fileId: "fid-revive",
      customData: { assetUrl: "https://example.com/revive.png" },
    };

    const r = await hydrateRemoteImageFilesForScene(api, [el], loaded, {
      logContext: "tutor",
    });

    expect(r.addedFileCount).toBe(1);
    expect(global.fetch).toHaveBeenCalled();
    expect(addFiles).toHaveBeenCalledTimes(1);
  });

  it("assigns synthetic fileId when image has assetUrl but no fileId (log replay shape)", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "image/png" },
      blob: () => Promise.resolve(new Blob([png], { type: "image/png" })),
    } as unknown as Response);

    const addFiles = jest.fn();
    const api = { addFiles, updateScene: jest.fn() } as unknown as ExcalidrawApiLike;
    const loaded = new Set<string>();
    const el: ExcalidrawLikeElement = {
      id: "el-z",
      type: "image",
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      customData: { assetUrl: "https://example.com/nofileid.png" },
    };

    const r = await hydrateRemoteImageFilesForScene(api, [el], loaded, {
      logContext: "tutor",
    });

    expect(el.fileId).toBe("wba-el-z");
    expect(r.addedFileCount).toBe(1);
    expect(addFiles).toHaveBeenCalledTimes(1);
  });
});
