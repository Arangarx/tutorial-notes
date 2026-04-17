import { buildOperatorEmailSet } from "@/lib/operator";

describe("buildOperatorEmailSet", () => {
  it("parses comma-separated OPERATOR_EMAILS and merges ADMIN_EMAIL", () => {
    const set = buildOperatorEmailSet(" A@x.com , b@y.com ", "owner@z.com");
    expect(set.has("a@x.com")).toBe(true);
    expect(set.has("b@y.com")).toBe(true);
    expect(set.has("owner@z.com")).toBe(true);
  });

  it("returns empty when both inputs are empty", () => {
    expect(buildOperatorEmailSet(undefined, undefined).size).toBe(0);
  });

  it("allows ADMIN_EMAIL only", () => {
    const set = buildOperatorEmailSet(undefined, "solo@example.com");
    expect([...set]).toEqual(["solo@example.com"]);
  });
});
