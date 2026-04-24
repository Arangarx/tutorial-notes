/**
 * @jest-environment jsdom
 */

/**
 * Unit coverage for `insertImageOnCanvas` and `insertPdfPagesOnCanvas`.
 *
 * Exercises:
 *   - mime/size validation rejects bad inputs
 *   - successful image insert wires the dataURL into Excalidraw's
 *     BinaryFiles + appends the image element with assetUrl in
 *     customData
 *   - PDF page insert tiles vertically using the documented stride
 *   - upload failures bubble back as `{ ok: false }` (no throws)
 *
 * Excalidraw isn't loaded — we hand the helpers a structural
 * `ExcalidrawApiLike` test double whose `addFiles` / `updateScene`
 * record arguments for assertion.
 */

import {
  insertDesmosEmbedOnCanvas,
  insertImageOnCanvas,
  insertMathSvgOnCanvas,
  insertPdfPagesOnCanvas,
  validateDesmosUrl,
  type ExcalidrawApiLike,
} from "@/lib/whiteboard/insert-asset";

jest.mock("@/lib/whiteboard/upload", () => ({
  uploadWhiteboardAsset: jest.fn(),
}));

import { uploadWhiteboardAsset } from "@/lib/whiteboard/upload";

const uploadMock = uploadWhiteboardAsset as jest.MockedFunction<
  typeof uploadWhiteboardAsset
>;

function makeFakeApi(): {
  api: ExcalidrawApiLike;
  files: Array<Parameters<ExcalidrawApiLike["addFiles"]>[0]>;
  scenes: Array<unknown[]>;
} {
  const files: Array<Parameters<ExcalidrawApiLike["addFiles"]>[0]> = [];
  const scenes: Array<unknown[]> = [];
  let current: unknown[] = [];
  const api: ExcalidrawApiLike = {
    getSceneElements: () => current,
    getAppState: () => ({
      scrollX: 0,
      scrollY: 0,
      width: 1000,
      height: 800,
      zoom: { value: 1 },
    }),
    addFiles: (f) => {
      files.push(f);
    },
    updateScene: ({ elements }) => {
      current = elements as unknown[];
      scenes.push(current);
    },
    scrollToContent: () => undefined,
  };
  return { api, files, scenes };
}

beforeEach(() => {
  uploadMock.mockReset();
});

beforeAll(() => {
  // jsdom's HTMLImageElement doesn't actually decode the bytes — fake
  // a deterministic onload for our fixtures so dimension probing works.
  Object.defineProperty(window.HTMLImageElement.prototype, "src", {
    configurable: true,
    set(value: string) {
      (this as unknown as { _src: string })._src = value;
      // Microtask to mimic real image decoding completion.
      queueMicrotask(() => {
        Object.defineProperty(this, "naturalWidth", { value: 800, configurable: true });
        Object.defineProperty(this, "naturalHeight", { value: 600, configurable: true });
        const handler = (this as unknown as { onload?: () => void }).onload;
        if (handler) handler();
      });
    },
    get() {
      return (this as unknown as { _src: string })._src ?? "";
    },
  });
});

function makePngFile(name: string, bytes: number): File {
  const arr = new Uint8Array(bytes);
  return new File([arr], name, { type: "image/png" });
}

describe("insertImageOnCanvas", () => {
  it("rejects unsupported mime types", async () => {
    const { api } = makeFakeApi();
    const file = new File([new Uint8Array(8)], "x.txt", {
      type: "text/plain",
    });
    const result = await insertImageOnCanvas({
      excalidrawAPI: api,
      whiteboardSessionId: "wb",
      studentId: "s",
      file,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/Unsupported image type/);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("rejects oversized files before uploading", async () => {
    const { api } = makeFakeApi();
    const huge = makePngFile("big.png", 26 * 1024 * 1024);
    const result = await insertImageOnCanvas({
      excalidrawAPI: api,
      whiteboardSessionId: "wb",
      studentId: "s",
      file: huge,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/upload limit/);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("uploads, registers a file, and adds an image element on success", async () => {
    uploadMock.mockResolvedValue({
      ok: true,
      blobUrl: "https://blob.example/wb-asset.png",
      sizeBytes: 1024,
    });
    const { api, files, scenes } = makeFakeApi();
    const file = makePngFile("worksheet.png", 1024);

    const result = await insertImageOnCanvas({
      excalidrawAPI: api,
      whiteboardSessionId: "wb-1",
      studentId: "s-1",
      file,
      altText: "Worksheet",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(uploadMock).toHaveBeenCalledWith(
      expect.objectContaining({
        whiteboardSessionId: "wb-1",
        studentId: "s-1",
        contentType: "image/png",
        assetTag: "image",
      })
    );
    expect(files).toHaveLength(1);
    expect(files[0]).toHaveLength(1);
    expect(files[0][0].mimeType).toBe("image/png");
    expect(files[0][0].dataURL.startsWith("data:image/png;base64,")).toBe(true);

    expect(scenes).toHaveLength(1);
    const inserted = scenes[0][0] as Record<string, unknown>;
    expect(inserted.type).toBe("image");
    expect(inserted.fileId).toBe(files[0][0].id);
    expect(inserted.status).toBe("saved");
    expect(
      (inserted.customData as { assetUrl?: string })?.assetUrl
    ).toBe("https://blob.example/wb-asset.png");
    expect(
      (inserted.customData as { altText?: string })?.altText
    ).toBe("Worksheet");
    expect(inserted.id).toBe(result.elementId);
  });

  it("surfaces upload failures without mutating the scene", async () => {
    uploadMock.mockResolvedValue({ ok: false, error: "network down" });
    const { api, files, scenes } = makeFakeApi();
    const file = makePngFile("worksheet.png", 1024);

    const result = await insertImageOnCanvas({
      excalidrawAPI: api,
      whiteboardSessionId: "wb-1",
      studentId: "s-1",
      file,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("network down");
    expect(files).toHaveLength(0);
    expect(scenes).toHaveLength(0);
  });
});

describe("insertPdfPagesOnCanvas", () => {
  it("tiles pages vertically and appends them in a single scene update", async () => {
    uploadMock.mockImplementation(async (args) => ({
      ok: true,
      blobUrl: `https://blob.example/${args.assetTag}.png`,
      sizeBytes: args.blob.size,
    }));
    const { api, files, scenes } = makeFakeApi();
    const pages = [
      {
        pageIndex: 1,
        pngBlob: new Blob([new Uint8Array(8)], { type: "image/png" }),
        widthPx: 720,
        heightPx: 960,
      },
      {
        pageIndex: 2,
        pngBlob: new Blob([new Uint8Array(8)], { type: "image/png" }),
        widthPx: 720,
        heightPx: 960,
      },
      {
        pageIndex: 3,
        pngBlob: new Blob([new Uint8Array(8)], { type: "image/png" }),
        widthPx: 720,
        heightPx: 960,
      },
    ];

    const progress: Array<[number, number]> = [];
    const result = await insertPdfPagesOnCanvas({
      excalidrawAPI: api,
      whiteboardSessionId: "wb-1",
      studentId: "s-1",
      pages,
      filename: "mixed-fractions.pdf",
      onProgress: (uploaded, total) => progress.push([uploaded, total]),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pagesInserted).toBe(3);
    expect(result.assetUrls).toHaveLength(3);
    expect(progress).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
    expect(uploadMock).toHaveBeenCalledTimes(3);
    // All file registrations are flushed in a single addFiles call so
    // the live-sync path doesn't see N separate scene mutations.
    expect(files).toHaveLength(1);
    expect(files[0]).toHaveLength(3);
    // And the scene update is also a single batch.
    expect(scenes).toHaveLength(1);
    const els = scenes[0] as Array<Record<string, unknown>>;
    expect(els).toHaveLength(3);
    // Width/height proportional to the rendered pixel dims (720 wide).
    expect(els[0].width).toBe(720);
    expect(els[0].height).toBeCloseTo(960, 1);
    // Pages are stacked: page2.y > page1.y > 0; gap of 32 between them.
    const ys = els.map((e) => e.y as number);
    expect(ys[1] - ys[0]).toBeCloseTo(960 + 32, 1);
    expect(ys[2] - ys[1]).toBeCloseTo(960 + 32, 1);
  });

  it("returns an error if any page upload fails", async () => {
    uploadMock
      .mockResolvedValueOnce({
        ok: true,
        blobUrl: "https://blob.example/p1.png",
        sizeBytes: 0,
      })
      .mockResolvedValueOnce({ ok: false, error: "blob 500" });
    const { api, scenes } = makeFakeApi();
    const result = await insertPdfPagesOnCanvas({
      excalidrawAPI: api,
      whiteboardSessionId: "wb-1",
      studentId: "s-1",
      pages: [
        {
          pageIndex: 1,
          pngBlob: new Blob([new Uint8Array(2)], { type: "image/png" }),
          widthPx: 100,
          heightPx: 100,
        },
        {
          pageIndex: 2,
          pngBlob: new Blob([new Uint8Array(2)], { type: "image/png" }),
          widthPx: 100,
          heightPx: 100,
        },
      ],
      filename: "f.pdf",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("Page 2");
    // No scene update should have happened — failures abort cleanly.
    expect(scenes).toHaveLength(0);
  });

  it("inserts a math SVG with latex preserved in customData", async () => {
    uploadMock.mockResolvedValue({
      ok: true,
      blobUrl: "https://blob.example/eq.svg",
      sizeBytes: 100,
    });
    const { api, files, scenes } = makeFakeApi();
    const svg = new Blob(["<svg>...</svg>"], { type: "image/svg+xml" });
    const result = await insertMathSvgOnCanvas({
      excalidrawAPI: api,
      whiteboardSessionId: "wb-1",
      studentId: "s-1",
      svgBlob: svg,
      widthPx: 240,
      heightPx: 80,
      latex: "\\frac{1}{2}",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(uploadMock).toHaveBeenCalledWith(
      expect.objectContaining({
        contentType: "image/svg+xml",
        assetTag: "math-equation",
      })
    );
    expect(files[0][0].mimeType).toBe("image/svg+xml");
    expect(scenes).toHaveLength(1);
    const inserted = scenes[0][0] as Record<string, unknown>;
    const customData = inserted.customData as {
      latex?: string;
      assetUrl?: string;
      wbType?: string;
    };
    expect(customData.latex).toBe("\\frac{1}{2}");
    expect(customData.assetUrl).toBe("https://blob.example/eq.svg");
    expect(customData.wbType).toBe("text");
  });

  it("rejects empty page arrays", async () => {
    const { api } = makeFakeApi();
    const result = await insertPdfPagesOnCanvas({
      excalidrawAPI: api,
      whiteboardSessionId: "wb-1",
      studentId: "s-1",
      pages: [],
      filename: "f.pdf",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/No pages/);
  });
});

describe("validateDesmosUrl", () => {
  it("accepts a saved-graph URL and strips fragments", () => {
    const result = validateDesmosUrl(
      "https://www.desmos.com/calculator/abc123#editor"
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.url).toBe("https://www.desmos.com/calculator/abc123");
  });

  it("accepts the blank calculator URL", () => {
    const result = validateDesmosUrl("https://www.desmos.com/calculator");
    expect(result.ok).toBe(true);
  });

  it("accepts the apex domain (no www) for forwarded links", () => {
    const result = validateDesmosUrl("https://desmos.com/calculator/xyz");
    expect(result.ok).toBe(true);
  });

  it("rejects non-https URLs", () => {
    const result = validateDesmosUrl("http://www.desmos.com/calculator");
    expect(result.ok).toBe(false);
  });

  it("rejects non-Desmos hosts", () => {
    const evil = validateDesmosUrl("https://evil.example/calculator");
    expect(evil.ok).toBe(false);
    if (evil.ok) return;
    expect(evil.reason).toMatch(/Only Desmos/);
  });

  it("rejects garbage input", () => {
    const result = validateDesmosUrl("not a url at all");
    expect(result.ok).toBe(false);
  });

  it("rejects empty input with a tutor-friendly hint", () => {
    const result = validateDesmosUrl("   ");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/Enter a Desmos URL/);
  });
});

describe("insertDesmosEmbedOnCanvas", () => {
  it("inserts an embeddable element with the validated URL", () => {
    const { api, scenes } = makeFakeApi();
    const result = insertDesmosEmbedOnCanvas({
      excalidrawAPI: api,
      whiteboardSessionId: "wb-1",
      studentId: "s-1",
      url: "https://www.desmos.com/calculator/abc123",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(scenes).toHaveLength(1);
    const el = scenes[0][0] as Record<string, unknown>;
    expect(el.type).toBe("embeddable");
    expect(el.link).toBe("https://www.desmos.com/calculator/abc123");
    const customData = el.customData as {
      assetUrl?: string;
      wbType?: string;
      embed?: { provider: string; kind: string; url: string };
    };
    expect(customData.assetUrl).toBe("https://www.desmos.com/calculator/abc123");
    expect(customData.wbType).toBe("embed");
    expect(customData.embed?.provider).toBe("desmos");
    expect(customData.embed?.kind).toBe("saved");
  });

  it("labels a blank calculator as `calculator` (not `saved`)", () => {
    const { api, scenes } = makeFakeApi();
    const result = insertDesmosEmbedOnCanvas({
      excalidrawAPI: api,
      whiteboardSessionId: "wb-1",
      studentId: "s-1",
      url: "https://www.desmos.com/calculator",
    });
    expect(result.ok).toBe(true);
    const el = scenes[0][0] as Record<string, unknown>;
    const customData = el.customData as {
      embed?: { kind: string };
    };
    expect(customData.embed?.kind).toBe("calculator");
  });

  it("does not mutate the scene if the URL is invalid", () => {
    const { api, scenes } = makeFakeApi();
    const result = insertDesmosEmbedOnCanvas({
      excalidrawAPI: api,
      whiteboardSessionId: "wb-1",
      studentId: "s-1",
      url: "https://evil.example/calculator",
    });
    expect(result.ok).toBe(false);
    expect(scenes).toHaveLength(0);
  });
});
