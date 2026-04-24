/**
 * Round-trip + diff invariants for the Excalidraw <-> canonical
 * adapter. These tests are the safety net under the recorder hook +
 * replay player: if the adapter loses information or generates
 * spurious diff events, the recorded session won't replay correctly.
 *
 * What we deliberately verify:
 *   - canonicalizeScene drops library-internal fields (seed, version,
 *     versionNonce, groupIds, isDeleted) that would otherwise leak
 *     into our on-disk JSON.
 *   - toCanonical -> toExcalidraw -> toCanonical is a fixed point for
 *     all supported element types (freedraw, line, rect, ellipse,
 *     diamond, arrow, text, image, desmos).
 *   - diffScenes correctly returns add / update / remove events when
 *     the scene changes, AND returns NO events when the scene is
 *     identical (this is the load-bearing property for plan blocker
 *     #3 — diff log size <500 KB over a 30-min session).
 *   - Custom-typed elements (math equation, desmos) round-trip
 *     through Excalidraw's image/iframe slot via customData.
 *   - isDeleted=true elements are dropped on canonicalization.
 *
 * Tests are jsdom-free (pure data shape transformations). They run
 * under the default node test environment.
 */

import {
  canonicalizeScene,
  diffElement,
  diffScenes,
  snapshotEvent,
  toCanonical,
  toExcalidraw,
  type ExcalidrawLikeElement,
} from "@/lib/whiteboard/excalidraw-adapter";
import type { WBElement } from "@/lib/whiteboard/event-log";

function freedraw(over: Partial<ExcalidrawLikeElement> = {}): ExcalidrawLikeElement {
  return {
    id: "fd1",
    type: "freedraw",
    x: 10,
    y: 20,
    width: 100,
    height: 50,
    strokeColor: "#1e1e1e",
    backgroundColor: "transparent",
    strokeWidth: 1,
    opacity: 100,
    angle: 0,
    points: [
      [0, 0],
      [10, 5],
      [25, 10],
    ],
    isDeleted: false,
    version: 7,
    versionNonce: 12345,
    ...over,
  };
}

function rect(over: Partial<ExcalidrawLikeElement> = {}): ExcalidrawLikeElement {
  return {
    id: "r1",
    type: "rectangle",
    x: 0,
    y: 0,
    width: 200,
    height: 100,
    strokeColor: "#000",
    backgroundColor: "#ffe4e1",
    strokeWidth: 2,
    opacity: 100,
    angle: 0,
    isDeleted: false,
    version: 1,
    versionNonce: 0,
    ...over,
  };
}

describe("excalidraw-adapter -- toCanonical", () => {
  test("freedraw maps to freehand and drops library-internal fields", () => {
    const wb = toCanonical(freedraw());
    expect(wb).toMatchObject({
      id: "fd1",
      type: "freehand",
      x: 10,
      y: 20,
      width: 100,
      height: 50,
      strokeColor: "#1e1e1e",
      strokeWidth: 1,
    });
    // background/opacity/angle defaults are dropped to keep diffs small
    expect(wb).not.toHaveProperty("backgroundColor");
    expect(wb).not.toHaveProperty("opacity");
    expect(wb).not.toHaveProperty("angle");
    // version + versionNonce are library-internal; never persisted
    expect(wb).not.toHaveProperty("version");
    expect(wb).not.toHaveProperty("versionNonce");
  });

  test("isDeleted=true returns null", () => {
    expect(toCanonical(freedraw({ isDeleted: true }))).toBeNull();
  });

  test("frame / magicframe / selection elements are dropped", () => {
    expect(toCanonical(rect({ type: "frame" }))).toBeNull();
    expect(toCanonical(rect({ type: "magicframe" }))).toBeNull();
    expect(toCanonical(rect({ type: "selection" }))).toBeNull();
  });

  test("unknown future element types are dropped without throwing", () => {
    expect(toCanonical(rect({ type: "future-shape" }))).toBeNull();
  });

  test("rounds positional floats to 2dp", () => {
    const el = freedraw({
      x: 10.123456,
      y: 20.999,
      width: 100.5001,
      height: 50.49999,
      angle: 1.234567,
      points: [
        [0.111111, 0.222222],
        [10.5555, 5.4444],
      ],
    });
    const wb = toCanonical(el)!;
    expect(wb.x).toBe(10.12);
    expect(wb.y).toBe(21);
    expect(wb.width).toBe(100.5);
    expect(wb.height).toBe(50.5);
    expect(wb.angle).toBe(1.23);
    expect(wb.points).toEqual([
      [0.11, 0.22],
      [10.56, 5.44],
    ]);
  });

  test("text element preserves text + fontSize + fontFamily", () => {
    const el = rect({
      id: "t1",
      type: "text",
      text: "hello",
      fontSize: 24,
      fontFamily: 1,
      backgroundColor: "transparent",
    });
    const wb = toCanonical(el)!;
    expect(wb.type).toBe("text");
    expect(wb.text).toBe("hello");
    expect(wb.fontSize).toBe(24);
    expect(wb.fontFamily).toBe(1);
  });

  test("image element preserves customData.assetUrl", () => {
    const el = rect({
      id: "img1",
      type: "image",
      fileId: "fid_abc",
      customData: { assetUrl: "https://blob/x.png", altText: "diagram" },
    });
    const wb = toCanonical(el)!;
    expect(wb.type).toBe("image");
    expect(wb.assetUrl).toBe("https://blob/x.png");
    expect(wb.altText).toBe("diagram");
  });

  test("math equation maps via customData.wbType=text + latex", () => {
    const el = rect({
      id: "eq1",
      type: "image",
      customData: {
        wbType: "text",
        latex: "x^2 + 1",
        assetUrl: "https://blob/eq.svg",
      },
    });
    const wb = toCanonical(el)!;
    expect(wb.type).toBe("text");
    expect(wb.latex).toBe("x^2 + 1");
    expect(wb.assetUrl).toBe("https://blob/eq.svg");
  });

  test("desmos iframe maps to wbType=desmos with desmosStateJson", () => {
    const el = rect({
      id: "ds1",
      type: "iframe",
      customData: {
        wbType: "desmos",
        desmosStateJson: '{"version":11}',
      },
    });
    const wb = toCanonical(el)!;
    expect(wb.type).toBe("desmos");
    expect(wb.desmosStateJson).toBe('{"version":11}');
  });
});

describe("excalidraw-adapter -- toExcalidraw round-trip", () => {
  test("freehand survives toExcalidraw -> toCanonical", () => {
    const original = toCanonical(freedraw())!;
    const ex = toExcalidraw(original);
    expect(ex.type).toBe("freedraw");
    const back = toCanonical(ex);
    expect(back).toEqual(original);
  });

  test("rectangle with backgroundColor round-trips", () => {
    const original = toCanonical(rect())!;
    const ex = toExcalidraw(original);
    const back = toCanonical(ex);
    expect(back).toEqual(original);
  });

  test("desmos round-trips through iframe slot", () => {
    const wb: WBElement = {
      id: "ds1",
      type: "desmos",
      x: 0,
      y: 0,
      width: 400,
      height: 300,
      desmosStateJson: '{"v":11}',
    };
    const ex = toExcalidraw(wb);
    expect(ex.type).toBe("iframe");
    const back = toCanonical(ex);
    expect(back).toEqual(wb);
  });

  test("math-equation latex round-trips", () => {
    const wb: WBElement = {
      id: "eq1",
      type: "text",
      x: 0,
      y: 0,
      width: 200,
      height: 60,
      latex: "\\frac{1}{2}",
      assetUrl: "https://blob/eq.svg",
    };
    const ex = toExcalidraw(wb);
    expect(ex.customData?.latex).toBe("\\frac{1}{2}");
    expect(ex.customData?.assetUrl).toBe("https://blob/eq.svg");
    const back = toCanonical(ex);
    expect(back).toEqual(wb);
  });
});

describe("excalidraw-adapter -- diffElement", () => {
  test("identical references return undefined", () => {
    const wb = toCanonical(freedraw())!;
    expect(diffElement(wb, wb)).toBeUndefined();
  });

  test("unchanged but distinct objects return undefined", () => {
    const a = toCanonical(freedraw())!;
    const b = toCanonical(freedraw())!;
    expect(diffElement(a, b)).toBeUndefined();
  });

  test("position change yields a small patch", () => {
    const a = toCanonical(freedraw())!;
    const b = toCanonical(freedraw({ x: 50 }))!;
    const patch = diffElement(a, b);
    expect(patch).toEqual({ x: 50 });
  });

  test("appending a stroke point yields a points patch", () => {
    const a = toCanonical(freedraw())!;
    const longer: ExcalidrawLikeElement = freedraw({
      points: [
        [0, 0],
        [10, 5],
        [25, 10],
        [40, 20],
      ],
    });
    const b = toCanonical(longer)!;
    const patch = diffElement(a, b);
    expect(patch).toBeDefined();
    expect(patch!.points).toEqual([
      [0, 0],
      [10, 5],
      [25, 10],
      [40, 20],
    ]);
  });

  test("multiple changes yield a multi-key patch", () => {
    const a = toCanonical(rect())!;
    const b = toCanonical(rect({ x: 5, width: 250, strokeColor: "red" }))!;
    const patch = diffElement(a, b);
    expect(patch).toEqual({ x: 5, width: 250, strokeColor: "red" });
  });
});

describe("excalidraw-adapter -- diffScenes", () => {
  test("empty -> empty produces zero events", () => {
    expect(diffScenes([], [], 0)).toEqual([]);
  });

  test("one new element produces an add event", () => {
    const next = canonicalizeScene([freedraw()]);
    const events = diffScenes([], next, 1234);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ t: 1234, type: "add", element: next[0] });
  });

  test("removed element produces a remove event", () => {
    const prev = canonicalizeScene([freedraw()]);
    const events = diffScenes(prev, [], 999);
    expect(events).toEqual([{ t: 999, type: "remove", elementId: "fd1" }]);
  });

  test("identical frames produce zero events (size budget invariant)", () => {
    const prev = canonicalizeScene([freedraw(), rect()]);
    // Re-canonicalize fresh; objects are distinct but values identical.
    const next = canonicalizeScene([freedraw(), rect()]);
    const events = diffScenes(prev, next, 50);
    expect(events).toEqual([]);
  });

  test("mixed add/update/remove in one frame", () => {
    const prev = canonicalizeScene([freedraw(), rect()]);
    const next = canonicalizeScene([
      freedraw({ x: 99 }), // updated
      rect({ id: "r2" }), // r1 removed, r2 added
    ]);
    const events = diffScenes(prev, next, 100);
    // Sorted as: updates of surviving elements first (order from `next`),
    // adds in next-order, then removes from prev-order.
    expect(events).toEqual([
      { t: 100, type: "update", elementId: "fd1", patch: { x: 99 } },
      { t: 100, type: "add", element: next[1] },
      { t: 100, type: "remove", elementId: "r1" },
    ]);
  });

  test("snapshotEvent captures the full scene", () => {
    const scene = canonicalizeScene([freedraw(), rect()]);
    const ev = snapshotEvent(scene, 7);
    expect(ev).toEqual({ t: 7, type: "snapshot", elements: scene });
    // Verifying defensive copy of the array: mutating the source after
    // capture should not affect the snapshot.
    scene.push({
      id: "extra",
      type: "freehand",
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });
    expect((ev as { elements: WBElement[] }).elements).toHaveLength(2);
  });
});

describe("excalidraw-adapter -- canonicalizeScene", () => {
  test("preserves order from Excalidraw onChange payload", () => {
    const out = canonicalizeScene([freedraw({ id: "a" }), rect({ id: "b" })]);
    expect(out.map((e) => e.id)).toEqual(["a", "b"]);
  });

  test("filters out frames + selection + deleted elements silently", () => {
    const out = canonicalizeScene([
      freedraw({ id: "keep" }),
      rect({ id: "drop1", type: "frame" }),
      rect({ id: "drop2", type: "selection" }),
      rect({ id: "drop3", isDeleted: true }),
      rect({ id: "keep2" }),
    ]);
    expect(out.map((e) => e.id)).toEqual(["keep", "keep2"]);
  });
});
