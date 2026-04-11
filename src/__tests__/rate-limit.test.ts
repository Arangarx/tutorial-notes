import { rateLimit } from "@/lib/rate-limit";

test("allows requests within the limit", () => {
  const key = `test-allow-${Date.now()}`;
  for (let i = 0; i < 5; i++) {
    const result = rateLimit(key, 5, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4 - i);
  }
});

test("blocks requests over the limit", () => {
  const key = `test-block-${Date.now()}`;
  for (let i = 0; i < 3; i++) rateLimit(key, 3, 60_000);

  const over = rateLimit(key, 3, 60_000);
  expect(over.allowed).toBe(false);
  expect(over.remaining).toBe(0);
  expect(over.retryAfterMs).toBeGreaterThan(0);
});

test("resets after window expires", () => {
  const key = `test-reset-${Date.now()}`;
  // Fill the window
  for (let i = 0; i < 3; i++) rateLimit(key, 3, 1);

  // Wait for window to expire (windowMs = 1ms)
  const start = Date.now();
  while (Date.now() - start < 5) { /* spin */ }

  const after = rateLimit(key, 3, 1);
  expect(after.allowed).toBe(true);
});
