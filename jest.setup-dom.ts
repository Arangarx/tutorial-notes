/**
 * Loaded by the jsdom Jest project (see `jest.config.ts`) after each test
 * file mounts. Wires up `@testing-library/jest-dom` matchers so component
 * tests can use `expect(el).toBeInTheDocument()` etc.
 *
 * Keep this file SMALL — anything heavier (per-test mock setup, fake
 * MediaRecorder factories) belongs in the test file or a co-located
 * `__mocks__/` helper, so failures point at the right place.
 */

import "@testing-library/jest-dom";

// jsdom (under jest-environment-jsdom@29) does not expose
// `structuredClone` on the jsdom global even though Node 18+ has it.
// `fake-indexeddb` 6.x (used by IDB-touching tests like the
// `useWhiteboardRecorder` jsdom suite) calls it on every put / get,
// so we polyfill via Node's v8 serialise round-trip. Same fidelity as
// the browser structuredClone for the JSON-y payloads we put through
// IDB. Doing this in the shared setup file means new jsdom tests
// don't need to remember to add it.
if (typeof globalThis.structuredClone !== "function") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const v8 = require("node:v8") as typeof import("node:v8");
  globalThis.structuredClone = (val: unknown): unknown =>
    v8.deserialize(v8.serialize(val));
}

// jsdom (as of jest-environment-jsdom@30) does not implement
// `URL.createObjectURL` / `URL.revokeObjectURL`. The whiteboard
// asset-insert path uses object URLs to probe image dimensions
// before deciding the on-canvas placement. We provide tiny stubs
// keyed on a counter so the tests can assert without needing a real
// blob URL implementation.
if (typeof URL !== "undefined" && typeof URL.createObjectURL !== "function") {
  let n = 0;
  (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL =
    () => `blob:jsdom-stub/${++n}`;
  (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL =
    () => undefined;
}
