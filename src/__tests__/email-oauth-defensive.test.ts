/**
 * Regression: when OAuthEmailConnection table does not exist (e.g. schema added but
 * prisma db push not run), code must not throw — getGmailConnection returns null,
 * isEmailConfiguredAny does not throw. See pipeline learning: Prisma table-missing defensive paths.
 */
import { getGmailConnection, isEmailConfiguredAny } from "@/lib/email";

jest.mock("@/lib/db", () => {
  const err = new Error("The table `main.OAuthEmailConnection` does not exist in the current database.");
  err.name = "PrismaClientKnownRequestError";
  return {
    db: {
      oAuthEmailConnection: {
        findFirst: jest.fn().mockRejectedValue(err),
      },
    },
  };
});

test("getGmailConnection returns null when OAuthEmailConnection table does not exist", async () => {
  const result = await getGmailConnection();
  expect(result).toBeNull();
});

test("isEmailConfiguredAny does not throw when OAuthEmailConnection table does not exist", async () => {
  await expect(isEmailConfiguredAny()).resolves.toBeDefined();
  const result = await isEmailConfiguredAny();
  expect(typeof result).toBe("boolean");
});
