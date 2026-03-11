import { authOptions } from "@/auth-options";

test("credentials authorize accepts only configured admin", async () => {
  process.env.ADMIN_EMAIL = "admin@example.com";
  process.env.ADMIN_PASSWORD = "replace-me";
  process.env.NEXTAUTH_SECRET = "test-secret";
  process.env.DATABASE_URL = "file:./test.db";

  const provider: any = authOptions.providers?.[0];
  expect(provider).toBeTruthy();
  const authorize = provider.options?.authorize ?? provider.authorize;
  expect(typeof authorize).toBe("function");

  const ok = await authorize({ email: "admin@example.com", password: "replace-me" });
  const bad = await authorize({ email: "admin@example.com", password: "wrong" });

  expect(ok).toBeTruthy();
  expect(bad).toBeNull();
});

