/**
 * Excalidraw <-> canonical event-log adapter.
 *
 * Translates between Excalidraw's `ExcalidrawElement` shape (which
 * Excalidraw itself owns) and our library-agnostic `WBElement` shape
 * defined in `event-log.ts`. The recorder hook calls
 * `diffExcalidrawScene()` on every `onChange` to compute add/update/
 * remove events; the replay player calls `toExcalidraw()` to push the
 * canonical scene back into a read-only Excalidraw instance.
 *
 * Why an adapter exists at all: see whiteboard plan guardrail #3 +
 * docs/WHITEBOARD-STATUS.md. Excalidraw's element shape includes
 * library-internal fields (`seed`, `version`, `versionNonce`,
 * `groupIds`, `roundness`, `roughness`, `fixedPoint` bindings, etc.)
 * that would couple our recordings to a specific Excalidraw version.
 * If we ever swap to tldraw or a custom canvas, only this adapter
 * changes — old recordings keep replaying.
 *
 * Tests: `src/__tests__/whiteboard/excalidraw-adapter.test.ts`.
 */

import type {
  WBElement,
  WBEvent,
} from "@/lib/whiteboard/event-log";

/**
 * Minimal structural types for the Excalidraw element shapes we care
 * about. We DO NOT import from `@excalidraw/excalidraw` in this file
 * directly because:
 *   1. The adapter must be importable from server code (e.g. Blob
 *      upload validators) where the Excalidraw client bundle would
 *      blow up the server build.
 *   2. The structural fields below are stable across Excalidraw
 *      versions in a way the full readonly+branded types are not —
 *      one less thing to break on a dependency upgrade.
 *
 * Anywhere that does need the real Excalidraw types (the workspace
 * page, the recorder hook callsite) imports them locally and casts
 * down to these structural shapes when calling into the adapter.
 */
export type ExcalidrawLikeElement = {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  index?: string | number | null;
  strokeColor?: string;
  backgroundColor?: string;
  strokeWidth?: number;
  opacity?: number;
  angle?: number;
  isDeleted?: boolean;
  version?: number;
  versionNonce?: number;
  /** freedraw + line + arrow elements */
  points?: ReadonlyArray<readonly [number, number]>;
  /** text elements */
  text?: string;
  fontSize?: number;
  fontFamily?: number;
  /** image elements: lookup key into Excalidraw's `BinaryFiles` table */
  fileId?: string | null;
  /** customData carries our extension fields for non-native types (latex, desmos state) */
  customData?: {
    wbType?: WBElement["type"];
    latex?: string;
    desmosStateJson?: string;
    altText?: string;
    /** For image elements: the resolved asset URL on Vercel Blob. */
    assetUrl?: string;
    /** Originator client id for collaborative attribution. */
    clientId?: string;
  };
};

/** Round to 2 decimal places to suppress noisy float jitter in diffs. */
function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Translate an Excalidraw element type string into our canonical type. */
function mapExcalidrawTypeToWB(
  type: string,
  customData: ExcalidrawLikeElement["customData"]
): WBElement["type"] | null {
  // Custom-typed elements (math equation, desmos) use customData.wbType
  // so we can round-trip them through Excalidraw's image/iframe slot.
  if (customData?.wbType) return customData.wbType;
  switch (type) {
    case "freedraw":
      return "freehand";
    case "line":
    case "rectangle":
    case "ellipse":
    case "diamond":
    case "arrow":
    case "text":
    case "image":
      return type;
    case "iframe":
    case "embeddable":
      // Desmos and other iframe embeds without explicit wbType default
      // to "desmos" so replay can render them; non-Desmos iframes are
      // rare enough in tutoring sessions that this fallback is safe.
      return "desmos";
    case "frame":
    case "magicframe":
    case "selection":
      // Not persisted to the event log — frames/selection are UI helpers.
      return null;
    default:
      // Unknown future Excalidraw element types are dropped silently;
      // the replay player just won't see them. Better than crashing.
      return null;
  }
}

/** Translate a canonical WBElement type back into Excalidraw's element type. */
function mapWBTypeToExcalidraw(type: WBElement["type"]): string {
  switch (type) {
    case "freehand":
      return "freedraw";
    case "desmos":
      return "iframe";
    default:
      return type;
  }
}

/**
 * Convert an Excalidraw element to our canonical shape. Drops library-
 * internal fields and rounds positional floats to 2dp.
 *
 * Returns `null` for elements we don't persist (selection, frame,
 * magicframe, isDeleted=true).
 */
export function toCanonical(
  src: ExcalidrawLikeElement
): WBElement | null {
  if (src.isDeleted) return null;
  const wbType = mapExcalidrawTypeToWB(src.type, src.customData);
  if (!wbType) return null;

  const out: WBElement = {
    id: src.id,
    type: wbType,
    x: r2(src.x),
    y: r2(src.y),
    width: r2(src.width),
    height: r2(src.height),
  };

  // Numeric `index` from Excalidraw's fractional indexing is a string;
  // we don't preserve the brand and just store it as a sortable string.
  // For tests + jsdom that pass numeric indices, accept those too.
  if (typeof src.index === "number") {
    out.index = src.index;
  }

  if (src.strokeColor !== undefined) out.strokeColor = src.strokeColor;
  if (src.backgroundColor !== undefined && src.backgroundColor !== "transparent") {
    out.backgroundColor = src.backgroundColor;
  }
  if (src.strokeWidth !== undefined) out.strokeWidth = src.strokeWidth;
  if (src.opacity !== undefined && src.opacity !== 100) out.opacity = src.opacity;
  if (src.angle !== undefined && src.angle !== 0) out.angle = r2(src.angle);

  if (src.points && src.points.length > 0) {
    out.points = src.points.map(([x, y]) => [r2(x), r2(y)] as [number, number]);
  }

  if (wbType === "text") {
    if (src.text !== undefined) out.text = src.text;
    if (src.fontSize !== undefined) out.fontSize = src.fontSize;
    if (src.fontFamily !== undefined) out.fontFamily = src.fontFamily;
  }

  if (src.customData?.assetUrl) out.assetUrl = src.customData.assetUrl;
  if (src.customData?.altText) out.altText = src.customData.altText;
  if (src.customData?.latex) out.latex = src.customData.latex;
  if (src.customData?.desmosStateJson) {
    out.desmosStateJson = src.customData.desmosStateJson;
  }
  if (src.customData?.clientId) out.clientId = src.customData.clientId;

  return out;
}

/**
 * Convert our canonical element back into the structural Excalidraw
 * shape. The replay player wraps this with full Excalidraw defaults
 * (seed, version, versionNonce, groupIds, etc.) before pushing into
 * `excalidrawAPI.updateScene`.
 */
export function toExcalidraw(src: WBElement): ExcalidrawLikeElement {
  const customData: NonNullable<ExcalidrawLikeElement["customData"]> = {};
  if (src.assetUrl) customData.assetUrl = src.assetUrl;
  if (src.altText) customData.altText = src.altText;
  if (src.latex) {
    customData.latex = src.latex;
    customData.wbType = "text"; // round-trip preservation
  }
  if (src.type === "desmos") {
    customData.wbType = "desmos";
    if (src.desmosStateJson) customData.desmosStateJson = src.desmosStateJson;
  }
  if (src.clientId) customData.clientId = src.clientId;

  const out: ExcalidrawLikeElement = {
    id: src.id,
    type: mapWBTypeToExcalidraw(src.type),
    x: src.x,
    y: src.y,
    width: src.width,
    height: src.height,
    isDeleted: false,
    customData: Object.keys(customData).length ? customData : undefined,
  };

  if (src.index !== undefined) out.index = src.index;
  if (src.strokeColor !== undefined) out.strokeColor = src.strokeColor;
  if (src.backgroundColor !== undefined) {
    out.backgroundColor = src.backgroundColor;
  }
  if (src.strokeWidth !== undefined) out.strokeWidth = src.strokeWidth;
  if (src.opacity !== undefined) out.opacity = src.opacity;
  if (src.angle !== undefined) out.angle = src.angle;
  if (src.points) out.points = src.points;
  if (src.text !== undefined) out.text = src.text;
  if (src.fontSize !== undefined) out.fontSize = src.fontSize;
  if (typeof src.fontFamily === "number") out.fontFamily = src.fontFamily;

  return out;
}

/**
 * Shallow per-field comparison used to decide whether an `update`
 * event needs to fire and which fields to send in the patch. Returns
 * undefined if the elements are identical, otherwise a partial object
 * containing only changed fields.
 *
 * Identity (`a === b`) short-circuits — `useWhiteboardRecorder` keeps
 * the previous frame as a frozen snapshot, so unchanged elements
 * usually compare by reference.
 */
export function diffElement(
  prev: WBElement,
  next: WBElement
): Partial<WBElement> | undefined {
  if (prev === next) return undefined;
  const patch: Partial<WBElement> = {};
  let changed = false;

  // The keys we diff are deliberately chosen to be the user-visible
  // ones. Internal scratchpad like `clientId` is not diffed (clientId
  // is set on `add` only).
  const keys: Array<keyof WBElement> = [
    "type",
    "x",
    "y",
    "width",
    "height",
    "index",
    "strokeColor",
    "backgroundColor",
    "strokeWidth",
    "opacity",
    "angle",
    "points",
    "text",
    "fontSize",
    "fontFamily",
    "assetUrl",
    "altText",
    "latex",
    "desmosStateJson",
  ];

  for (const k of keys) {
    if (k === "points") {
      if (!pointsEqual(prev.points, next.points)) {
        // Cast through unknown to satisfy the union; runtime semantics
        // are correct because we copy directly from `next`.
        (patch as Record<string, unknown>)[k] = next.points;
        changed = true;
      }
      continue;
    }
    if (prev[k] !== next[k]) {
      (patch as Record<string, unknown>)[k] = next[k];
      changed = true;
    }
  }

  return changed ? patch : undefined;
}

function pointsEqual(
  a: WBElement["points"] | undefined,
  b: WBElement["points"] | undefined
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i][0] !== b[i][0] || a[i][1] !== b[i][1]) return false;
  }
  return true;
}

/**
 * Compute the WBEvent diff between two frames of an Excalidraw scene
 * (prev -> next, both arrays of elements).
 *
 * The recorder hook holds a `prevElementsRef` of canonicalized
 * elements from the last `onChange`. On every new `onChange` it calls
 * this function with `prevRef.current` and the new canonicalized list,
 * appends the returned events to the log, and updates the ref.
 *
 * `t` is supplied by the caller (audio-clock ms — see plan blocker
 * #2) so we don't reach for `Date.now()` here.
 */
export function diffScenes(
  prev: ReadonlyArray<WBElement>,
  next: ReadonlyArray<WBElement>,
  t: number
): WBEvent[] {
  const events: WBEvent[] = [];
  const prevById = new Map<string, WBElement>();
  for (const el of prev) prevById.set(el.id, el);

  const seenIds = new Set<string>();

  for (const nextEl of next) {
    seenIds.add(nextEl.id);
    const prevEl = prevById.get(nextEl.id);
    if (!prevEl) {
      events.push({ t, type: "add", element: nextEl });
      continue;
    }
    const patch = diffElement(prevEl, nextEl);
    if (patch) {
      events.push({ t, type: "update", elementId: nextEl.id, patch });
    }
  }

  for (const prevEl of prev) {
    if (!seenIds.has(prevEl.id)) {
      events.push({ t, type: "remove", elementId: prevEl.id });
    }
  }

  return events;
}

/**
 * Convenience for the "first frame after start" case: emit a single
 * `snapshot` event capturing the entire scene, then update the ref.
 * Used at session start, after pause/resume, and as the welcome
 * packet sent to a joining student client.
 */
export function snapshotEvent(
  elements: ReadonlyArray<WBElement>,
  t: number
): WBEvent {
  return { t, type: "snapshot", elements: [...elements] };
}

/**
 * Map an array of Excalidraw elements through the canonical
 * conversion, dropping nulls. Preserves order — Excalidraw guarantees
 * ascending fractional index order in its `onChange` payload, so we
 * inherit that.
 */
export function canonicalizeScene(
  src: ReadonlyArray<ExcalidrawLikeElement>
): WBElement[] {
  const out: WBElement[] = [];
  for (const el of src) {
    const c = toCanonical(el);
    if (c) out.push(c);
  }
  return out;
}
