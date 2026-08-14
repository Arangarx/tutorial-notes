import { expect, test } from "@playwright/test";

import {
  seedParentAccountHolder,
  seedParentConsentFixture,
  TEST_PARENT,
} from "./identity.helpers";
import {
  seedSelfLearnerWbSession,
  seedWbLiveSyncSession,
} from "../whiteboard-live-sync.helpers";

const EMPTY_STATE = { cookies: [] as [], origins: [] as [] };
const LEARNER_STATE = "tests/integration/.auth/learner.json";
const PARENT_STATE = "tests/integration/.auth/parent.json";

test.describe("Login pages are persona-distinct", () => {
  test.use({ storageState: EMPTY_STATE });

  test("learner login page shows child PIN form", async ({ page }) => {
    await page.goto("/students/login");
    await expect(page.getByText("Student sign in", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByLabel("Username")).toBeVisible();
    await expect(page.getByLabel("PIN", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("account-holder login page shows email/password form", async ({ page }) => {
    await page.goto("/account/login");
    await expect(
      page.getByText("Sign in to your account", { exact: true })
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });
});

test.describe("Middleware auth wall", () => {
  test.use({ storageState: EMPTY_STATE });

  test("unauthenticated /account/dashboard redirects to /account/login", async ({
    page,
  }) => {
    await page.goto("/account/dashboard");
    await page.waitForURL(
      (url) => url.pathname === "/account/login",
      { timeout: 15_000 }
    );
    expect(new URL(page.url()).searchParams.get("returnTo")).toBe(
      "/account/dashboard"
    );
    await expect(
      page.getByText("Sign in to your account", { exact: true })
    ).toBeVisible();
  });
});

test.describe("Parent family dashboard routing", () => {
  test.use({ storageState: PARENT_STATE });

  test("parent root / redirects to /account/dashboard", async ({ page }) => {
    await seedParentAccountHolder();
    await page.goto("/");
    await page.waitForURL(
      (url) => url.pathname === "/account/dashboard",
      { timeout: 15_000 }
    );
    expect(new URL(page.url()).pathname).toBe("/account/dashboard");
  });

  test("parent /account/dashboard renders family dashboard", async ({ page }) => {
    await seedParentAccountHolder();
    await seedParentConsentFixture();

    await page.goto("/account/dashboard");
    await expect(page.getByText("Family account")).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByRole("heading", {
        name: `Welcome back, ${TEST_PARENT.displayName}`,
      })
    ).toBeVisible();
  });
});

test.describe("Learner root routing", () => {
  test.use({ storageState: LEARNER_STATE });

  test("learner root / redirects to /join", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL((url) => url.pathname === "/join", {
      timeout: 15_000,
    });
    expect(new URL(page.url()).pathname).toBe("/join");
    await expect(page.getByTestId("join-no-session-message")).toBeVisible();
  });
});

test.describe("JoinAuthGate persona redirect", () => {
  test.use({ storageState: EMPTY_STATE });

  test("child session redirects unauthenticated visitor to /students/login", async ({
    page,
  }) => {
    const session = await seedWbLiveSyncSession();
    const returnTo = `/join/${session.whiteboardSessionId}`;

    await page.goto(returnTo);
    await page.waitForURL(
      (url) =>
        url.pathname === "/students/login" &&
        url.searchParams.get("returnTo") === returnTo,
      { timeout: 15_000 }
    );
    await expect(page.getByText("Student sign in", { exact: true })).toBeVisible();
  });

  test("self-learner session redirects unauthenticated visitor to /account/login", async ({
    page,
  }) => {
    const session = await seedSelfLearnerWbSession();
    const returnTo = `/join/${session.whiteboardSessionId}`;

    await page.goto(returnTo);
    await page.waitForURL(
      (url) =>
        url.pathname === "/account/login" &&
        url.searchParams.get("returnTo") === returnTo,
      { timeout: 15_000 }
    );
    await expect(
      page.getByText("Sign in to your account", { exact: true })
    ).toBeVisible();
  });
});

test.describe("Join wrong-principal denial page", () => {
  test.use({ storageState: PARENT_STATE });

  test("logged-in parent on child session join link sees not-my-session denial + CTAs", async ({
    page,
  }) => {
    await seedParentAccountHolder();
    const session = await seedWbLiveSyncSession();

    await page.goto(`/join/${session.whiteboardSessionId}`);
    await page.waitForURL(
      (url) => url.pathname === "/account/not-my-session",
      { timeout: 15_000 }
    );

    await expect(
      page.getByText("Session not linked to your account", { exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Go to your dashboard" })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Sign in with a different account" })
    ).toBeVisible();
  });

  test("logged-in parent on another adult self-learner session sees not-my-session denial", async ({
    page,
  }) => {
    await seedParentAccountHolder();
    const session = await seedSelfLearnerWbSession();

    await page.goto(`/join/${session.whiteboardSessionId}`);
    await page.waitForURL(
      (url) => url.pathname === "/account/not-my-session",
      { timeout: 15_000 }
    );

    await expect(
      page.getByText("This session link isn't associated with your account.")
    ).toBeVisible();
  });
});
