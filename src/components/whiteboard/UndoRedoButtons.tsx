"use client";

/**
 * Visible Undo / Redo buttons for the whiteboard toolbar.
 *
 * Sarah's pilot ask (Apr 24, 2026): she expected an undo button on the
 * whiteboard. Excalidraw's bottom-left toolbar has tiny undo/redo
 * icons, but a touch user (her future Chromebook / iPad students) is
 * unlikely to spot them. This component renders chunky labelled
 * buttons in our own toolbar that route to Excalidraw via synthetic
 * Ctrl-Z / Ctrl-Shift-Z keyboard events. See `lib/whiteboard/undo-redo.ts`
 * for why the synthetic-keystroke path (the imperative API doesn't
 * expose undo/redo in 0.18).
 *
 * Keep this component dumb — no Excalidraw imports. The shortcut
 * dispatcher works against the live DOM, so this component just wires
 * the button to the helper.
 */

import { triggerRedo, triggerUndo } from "@/lib/whiteboard/undo-redo";

export type UndoRedoButtonsProps = {
  /**
   * Disable while ending session / other state where the canvas
   * shouldn't accept input. Doesn't affect the visual prominence —
   * Sarah needs to see the button always exists.
   */
  disabled?: boolean;
};

export function UndoRedoButtons({ disabled }: UndoRedoButtonsProps) {
  return (
    <div className="row" style={{ gap: 4, alignItems: "center" }}>
      <button
        type="button"
        className="btn"
        onClick={() => {
          triggerUndo();
        }}
        disabled={disabled}
        aria-label="Undo last action"
        title="Undo (Ctrl+Z)"
        data-testid="wb-undo"
        style={{ minWidth: 64 }}
      >
        ↶ Undo
      </button>
      <button
        type="button"
        className="btn"
        onClick={() => {
          triggerRedo();
        }}
        disabled={disabled}
        aria-label="Redo last undone action"
        title="Redo (Ctrl+Shift+Z)"
        data-testid="wb-redo"
        style={{ minWidth: 64 }}
      >
        ↷ Redo
      </button>
    </div>
  );
}
