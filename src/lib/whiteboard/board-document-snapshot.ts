/**
 * Multi–board-page snapshot for **local** recovery (sessionStorage draft +
 * IndexedDB checkpoint `boardDocument` field). This is the tutor UI model:
 * one Excalidraw scene at a time, with per-tab element arrays in memory.
 * The WB event log remains a separate single-stream log for replay.
 */

export type WhiteboardBoardDocumentV1 = {
  v: 1;
  pageList: { id: string; title: string }[];
  activePageId: string;
  /** Excalidraw-serializable element arrays (JSON) per page id. */
  pages: Record<string, ReadonlyArray<unknown>>;
};

export function isWhiteboardBoardDocumentV1(
  v: unknown
): v is WhiteboardBoardDocumentV1 {
  if (!v || typeof v !== "object") return false;
  const o = v as { v?: unknown; pageList?: unknown; activePageId?: unknown; pages?: unknown };
  if (o.v !== 1) return false;
  if (typeof o.activePageId !== "string") return false;
  if (!Array.isArray(o.pageList)) return false;
  if (!o.pages || typeof o.pages !== "object") return false;
  for (const p of o.pageList) {
    if (!p || typeof p !== "object") return false;
    const row = p as { id?: unknown; title?: unknown };
    if (typeof row.id !== "string" || typeof row.title !== "string") return false;
  }
  return true;
}
