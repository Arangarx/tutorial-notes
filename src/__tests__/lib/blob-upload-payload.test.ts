/**
 * Spec lock for parseClientPayload — canonical blob upload clientPayload parse.
 *
 * Independent oracle: JSON.parse + plain-object guard (not derived from the
 * implementation under test). Kind-specific field validation lives in the route
 * handler after parse; this module only parses structure.
 */

import {
  parseClientPayload,
  type ClientUploadPayload,
  type UploadKind,
} from "@/lib/blob-upload-payload";

/** Oracle: same plain-object JSON parse policy as the historical route copies. */
function oracleParse(raw: string | null): ClientUploadPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as ClientUploadPayload;
    }
  } catch {
    // fall through
  }
  return null;
}

describe("parseClientPayload", () => {
  describe("matches independent oracle", () => {
    const cases: Array<{ name: string; raw: string | null }> = [
      { name: "null input", raw: null },
      { name: "empty string", raw: "" },
      { name: "invalid JSON", raw: "not-json" },
      { name: "JSON null literal", raw: "null" },
      { name: "JSON string", raw: JSON.stringify("hello") },
      { name: "JSON number", raw: JSON.stringify(42) },
      { name: "JSON boolean true", raw: JSON.stringify(true) },
      { name: "JSON boolean false", raw: JSON.stringify(false) },
      { name: "empty object", raw: "{}" },
      { name: "audio payload", raw: JSON.stringify({ kind: "audio", studentId: "stu-1" }) },
      {
        name: "whiteboard-events payload",
        raw: JSON.stringify({
          kind: "whiteboard-events",
          whiteboardSessionId: "wbs-1",
        }),
      },
      {
        name: "whiteboard-snapshot payload",
        raw: JSON.stringify({
          kind: "whiteboard-snapshot",
          whiteboardSessionId: "wbs-2",
        }),
      },
      {
        name: "whiteboard-asset with joinToken",
        raw: JSON.stringify({
          kind: "whiteboard-asset",
          whiteboardSessionId: "wbs-3",
          joinToken: "jt-abc",
          assetTag: "pdf-page-1",
        }),
      },
      { name: "JSON array (object guard passes arrays)", raw: JSON.stringify([1, 2]) },
      { name: "nested object", raw: JSON.stringify({ kind: "audio", extra: { nested: true } }) },
    ];

    for (const { name, raw } of cases) {
      test(name, () => {
        const expected = oracleParse(raw);
        expect(parseClientPayload(raw)).toEqual(expected);
      });
    }
  });

  test("preserves all UploadKind discriminators on round-trip", () => {
    const kinds: UploadKind[] = [
      "audio",
      "whiteboard-events",
      "whiteboard-snapshot",
      "whiteboard-asset",
    ];
    for (const kind of kinds) {
      const raw = JSON.stringify({ kind });
      expect(parseClientPayload(raw)).toEqual({ kind });
    }
  });

  test("does not mutate or normalise field values", () => {
    const payload = {
      kind: "whiteboard-asset" as UploadKind,
      whiteboardSessionId: "wbs-exact",
      joinToken: "token-with-special=chars",
      assetTag: "equation-π",
      studentId: "stu-should-stay",
    };
    const raw = JSON.stringify(payload);
    expect(parseClientPayload(raw)).toEqual(payload);
  });
});
