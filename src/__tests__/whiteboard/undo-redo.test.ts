/**
 * @jest-environment jsdom
 */

/**
 * Contract tests for the synthetic Ctrl-Z dispatcher used by the
 * visible Undo / Redo toolbar buttons.
 *
 * Sarah's pilot ask (Apr 24, 2026): visible undo button on the
 * whiteboard, including for touch users with no keyboard. The button
 * routes to Excalidraw via a synthetic keydown — we MUST keep:
 *
 *   - both `ctrlKey` and `metaKey` set (cross-platform)
 *   - `shiftKey: true` for Redo, false for Undo
 *   - dispatch on the `.excalidraw` container (not window) so we
 *     don't accidentally trigger Next.js / browser shortcuts
 *
 * A regression in any of those silently bricks the button on at
 * least one platform.
 */

import { triggerRedo, triggerUndo } from "@/lib/whiteboard/undo-redo";

function mountExcalidrawContainer(): {
  container: HTMLElement;
  cleanup: () => void;
} {
  const container = document.createElement("div");
  container.className = "excalidraw";
  document.body.appendChild(container);
  return {
    container,
    cleanup: () => {
      container.remove();
    },
  };
}

describe("triggerUndo / triggerRedo", () => {
  let cleanup: () => void = () => {};

  afterEach(() => {
    cleanup();
  });

  it("dispatches keydown on the .excalidraw container (not window)", () => {
    const mounted = mountExcalidrawContainer();
    cleanup = mounted.cleanup;
    const onContainerKey = jest.fn();
    const onWindowKey = jest.fn();
    mounted.container.addEventListener("keydown", onContainerKey);
    window.addEventListener("keydown", onWindowKey);

    const result = triggerUndo();

    expect(result).toEqual({ ok: true });
    expect(onContainerKey).toHaveBeenCalledTimes(1);
    // Bubbling means window also sees it once — that's fine; the
    // important part is the container saw it FIRST.
    expect(onWindowKey).toHaveBeenCalled();

    window.removeEventListener("keydown", onWindowKey);
    mounted.container.removeEventListener("keydown", onContainerKey);
  });

  it("Undo: sets ctrlKey AND metaKey (cross-platform) but NOT shiftKey", () => {
    const mounted = mountExcalidrawContainer();
    cleanup = mounted.cleanup;
    let captured: KeyboardEvent | null = null;
    mounted.container.addEventListener("keydown", (e) => {
      captured = e as KeyboardEvent;
    });

    triggerUndo();

    expect(captured).not.toBeNull();
    const ev = captured as unknown as KeyboardEvent;
    expect(ev.key).toBe("z");
    expect(ev.code).toBe("KeyZ");
    expect(ev.ctrlKey).toBe(true);
    expect(ev.metaKey).toBe(true);
    expect(ev.shiftKey).toBe(false);
    expect(ev.bubbles).toBe(true);
  });

  it("Redo: same modifiers as Undo PLUS shiftKey=true", () => {
    const mounted = mountExcalidrawContainer();
    cleanup = mounted.cleanup;
    let captured: KeyboardEvent | null = null;
    mounted.container.addEventListener("keydown", (e) => {
      captured = e as KeyboardEvent;
    });

    triggerRedo();

    expect(captured).not.toBeNull();
    const ev = captured as unknown as KeyboardEvent;
    expect(ev.key).toBe("z");
    expect(ev.code).toBe("KeyZ");
    expect(ev.ctrlKey).toBe(true);
    expect(ev.metaKey).toBe(true);
    expect(ev.shiftKey).toBe(true);
  });

  it("matches the alternate `.excalidraw-container` selector", () => {
    // Excalidraw 0.18 uses `.excalidraw`; some integrations and
    // older versions use `.excalidraw-container`. The dispatcher
    // accepts either so a future Excalidraw upgrade doesn't quietly
    // break the button.
    const container = document.createElement("div");
    container.className = "excalidraw-container";
    document.body.appendChild(container);
    cleanup = () => {
      container.remove();
    };
    const onKey = jest.fn();
    container.addEventListener("keydown", onKey);

    const r = triggerUndo();

    expect(r).toEqual({ ok: true });
    expect(onKey).toHaveBeenCalledTimes(1);
  });

  it("returns reason='excalidraw-container-not-found' when the canvas isn't mounted", () => {
    // No container in the DOM — clicking Undo before Excalidraw has
    // hydrated should return a structured error, not throw. The UI
    // treats this as a no-op (the button is enabled before hydration
    // completes; clicking earlier is just lost).
    const r = triggerUndo();
    expect(r).toEqual({ ok: false, reason: "excalidraw-container-not-found" });
  });
});
