/**
 * Per-session whiteboard recovery in `sessionStorage` (not E2E encrypted;
 * never leaves the browser). Supports **multi–board-page** v1 shape plus
 * legacy single–elements-array rows.
 *
 * Cleared on session end and after a successful event blob upload.
 */

import {
  isWhiteboardBoardDocumentV1,
  type WhiteboardBoardDocumentV1,
} from "@/lib/whiteboard/board-document-snapshot";

const KEY_PREFIX = "wn_wb_session_elements_v1:";
const BOARD_KEY_PREFIX = "wn_wb_session_board_v1:";

const MAX_DRAFT_BYTES = 4_000_000;

export function sessionSceneDraftKey(whiteboardSessionId: string): string {
  return `${KEY_PREFIX}${whiteboardSessionId}`;
}

function boardDraftKey(whiteboardSessionId: string): string {
  return `${BOARD_KEY_PREFIX}${whiteboardSessionId}`;
}

/** @deprecated prefer {@link loadTutorSessionRecoveryDraft} */
export function loadSessionSceneDraft(
  whiteboardSessionId: string
): ReadonlyArray<unknown> | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(sessionSceneDraftKey(whiteboardSessionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function loadSessionBoardDocument(
  whiteboardSessionId: string
): WhiteboardBoardDocumentV1 | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(boardDraftKey(whiteboardSessionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isWhiteboardBoardDocumentV1(parsed)) return null;
    if (parsed.pageList.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Board v1 in sessionStorage, or legacy one-array draft upgraded to a
 * single-page document (Page 1 only).
 */
export function loadTutorSessionRecoveryDraft(
  whiteboardSessionId: string
): WhiteboardBoardDocumentV1 | null {
  const board = loadSessionBoardDocument(whiteboardSessionId);
  if (board) return board;
  const legacy = loadSessionSceneDraft(whiteboardSessionId);
  if (!legacy || legacy.length === 0) return null;
  return {
    v: 1,
    pageList: [{ id: "p1", title: "Page 1" }],
    activePageId: "p1",
    pages: { p1: [...legacy] },
  };
}

export function saveSessionBoardDocument(
  whiteboardSessionId: string,
  doc: WhiteboardBoardDocumentV1
): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    const json = JSON.stringify(doc);
    if (json.length > MAX_DRAFT_BYTES) return;
    sessionStorage.setItem(boardDraftKey(whiteboardSessionId), json);
    // Avoid stale single-array key fighting multi-page
    try {
      sessionStorage.removeItem(sessionSceneDraftKey(whiteboardSessionId));
    } catch {
      // ignore
    }
  } catch {
    // Quota or private mode — ignore.
  }
}

/** @deprecated use {@link saveSessionBoardDocument} for tutor workspace */
export function saveSessionSceneDraft(
  whiteboardSessionId: string,
  elements: ReadonlyArray<unknown>
): void {
  if (typeof sessionStorage === "undefined") return;
  if (elements.length === 0) {
    clearSessionSceneDraft(whiteboardSessionId);
    return;
  }
  try {
    const json = JSON.stringify(elements);
    if (json.length > MAX_DRAFT_BYTES) return;
    sessionStorage.setItem(sessionSceneDraftKey(whiteboardSessionId), json);
  } catch {
    // Quota or private mode — ignore.
  }
}

export function clearSessionSceneDraft(whiteboardSessionId: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(sessionSceneDraftKey(whiteboardSessionId));
    sessionStorage.removeItem(boardDraftKey(whiteboardSessionId));
  } catch {
    // ignore
  }
}
