/**
 * Regression: Vercel + Postgres serverless can drop pooled connections mid-query.
 * Symptom: `prisma:error Error in PostgreSQL connection: Error { kind: Closed, cause: None }`
 * Surface to the user is the generic Next.js "An unexpected response was received from the server."
 *
 * `withDbRetry` retries transient connection-closed errors so the user doesn't see them.
 * See docs/learning-prisma.md.
 */
import { withDbRetry, isTransientDbConnectionError } from "@/lib/db";

describe("isTransientDbConnectionError", () => {
  test.each([
    "Error in PostgreSQL connection: Error { kind: Closed, cause: None }",
    "PrismaClientUnknownRequestError: ... Error { kind: Closed, ... }",
    "server has gone away",
    "Server closed the connection unexpectedly",
    "Connection terminated unexpectedly",
    "ECONNRESET",
    "connection is closed",
  ])("recognizes transient: %s", (msg) => {
    expect(isTransientDbConnectionError(new Error(msg))).toBe(true);
  });

  test.each([
    "Unique constraint failed on the fields: (`email`)",
    "Foreign key constraint failed",
    "Record to update not found.",
    "The table `Student` does not exist in the current database.",
    "Invalid `prisma.student.findUnique()` invocation",
  ])("does not flag legit Prisma errors: %s", (msg) => {
    expect(isTransientDbConnectionError(new Error(msg))).toBe(false);
  });

  test("non-Error throwables are not transient", () => {
    expect(isTransientDbConnectionError("string error")).toBe(false);
    expect(isTransientDbConnectionError(null)).toBe(false);
    expect(isTransientDbConnectionError({ message: "kind: Closed" })).toBe(false);
  });
});

describe("withDbRetry", () => {
  test("returns immediately on success", async () => {
    const fn = jest.fn().mockResolvedValue("ok");
    await expect(withDbRetry(fn)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("retries once and succeeds when first attempt hits closed-connection", async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error("Error in PostgreSQL connection: Error { kind: Closed, cause: None }"))
      .mockResolvedValueOnce("ok-after-retry");

    await expect(withDbRetry(fn, { baseDelayMs: 1 })).resolves.toBe("ok-after-retry");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test("retries up to maxRetries times then rethrows the transient error", async () => {
    const transientErr = new Error("Connection terminated unexpectedly");
    const fn = jest.fn().mockRejectedValue(transientErr);

    await expect(withDbRetry(fn, { maxRetries: 2, baseDelayMs: 1 })).rejects.toBe(transientErr);
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  test("does NOT retry non-transient errors (passes through immediately)", async () => {
    const realErr = new Error("Unique constraint failed on the fields: (`email`)");
    const fn = jest.fn().mockRejectedValue(realErr);

    await expect(withDbRetry(fn, { baseDelayMs: 1 })).rejects.toBe(realErr);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("respects custom maxRetries=0 (no retry, single attempt)", async () => {
    const transientErr = new Error("kind: Closed");
    const fn = jest.fn().mockRejectedValue(transientErr);

    await expect(withDbRetry(fn, { maxRetries: 0, baseDelayMs: 1 })).rejects.toBe(transientErr);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
