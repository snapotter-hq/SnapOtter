import type { Browser, Page } from "@playwright/test";
import { expect, login, openSettings, test } from "./helpers";

// ---------------------------------------------------------------------------
// Settings Dialog: Security (change password) and API Keys tabs
//
// Selector note: the Settings dialog is an overlay, so the home page stays in
// the DOM behind it. The home grid renders the PDF "Security" tool category as
// an <h3>, which collides with the Security section's own <h3>. Every heading
// assertion is therefore scoped to the dialog (getByRole("dialog")) and uses an
// exact name match so it cannot resolve to the background heading.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// createThrowawayUser() - register a disposable non-admin user via the API.
//
// The change-password form acts on the *current session user*. Driving it as
// admin would mutate the shared admin password, and the policy (>= 8 chars,
// upper/lower/digit) makes it impossible to restore the seeded "admin" value,
// poisoning every later test that logs in as admin. So the success-path tests
// create a throwaway user, change *its* password in a separate browser context,
// then delete it. MAX_USERS defaults to 0 (unlimited) and
// SKIP_MUST_CHANGE_PASSWORD=true in the e2e env, so the login lands on "/".
// ---------------------------------------------------------------------------
// Monotonic suffix for unique throwaway usernames. A counter avoids Math.random
// (flagged by CodeQL as insecure randomness in a security-adjacent context) and
// is collision-free within a run.
let throwawayUserSeq = 0;

async function createThrowawayUser(adminPage: Page, password: string) {
  const username = `pwtest-${Date.now()}-${++throwawayUserSeq}`;
  const token = await adminPage.evaluate(() => localStorage.getItem("snapotter-token"));
  const headers = token ? { authorization: `Bearer ${token}` } : {};

  const res = await adminPage.request.post("/api/auth/register", {
    headers,
    data: { username, password, role: "user" },
  });
  expect(res.ok()).toBeTruthy();
  const { id } = (await res.json()) as { id: string };

  // register always sets mustChangePassword, which would redirect the user's
  // first login to /change-password. Clear it by changing the password to
  // itself via the API so the later UI login lands on "/".
  const userLogin = await adminPage.request.post("/api/auth/login", {
    data: { username, password },
  });
  const { token: userToken } = (await userLogin.json()) as { token: string };
  await adminPage.request.post("/api/auth/change-password", {
    headers: { authorization: `Bearer ${userToken}` },
    data: { currentPassword: password, newPassword: password },
  });

  return {
    username,
    id,
    async remove() {
      const freshToken = await adminPage.evaluate(() => localStorage.getItem("snapotter-token"));
      await adminPage.request.delete(`/api/auth/users/${id}`, {
        headers: freshToken ? { authorization: `Bearer ${freshToken}` } : {},
      });
    },
  };
}

// Open Security, then change the throwaway user's password through the UI in a
// fresh context. Returns the user's page so the caller can assert on it, plus a
// cleanup that closes the context and deletes the user.
async function changeThrowawayPasswordViaUi(
  adminPage: Page,
  browser: Browser,
  currentPassword: string,
  newPassword: string,
) {
  const user = await createThrowawayUser(adminPage, currentPassword);
  const context = await browser.newContext();
  const userPage = await context.newPage();

  await login(userPage, user.username, currentPassword);
  await openSettings(userPage);
  await userPage.getByRole("button", { name: /security/i }).click();

  await userPage.getByPlaceholder("Current Password").fill(currentPassword);
  await userPage.getByPlaceholder("New Password").first().fill(newPassword);
  await userPage.getByPlaceholder("Confirm New Password").fill(newPassword);
  await userPage
    .getByRole("dialog")
    .getByRole("button", { name: /change password/i })
    .click();

  return {
    userPage,
    async cleanup() {
      await context.close();
      await user.remove();
    },
  };
}

test.describe("GUI Settings - Security Tab", () => {
  test("shows Change Password form with required inputs", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /security/i }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Security", exact: true })).toBeVisible();
    await expect(dialog.getByText("Change Password").first()).toBeVisible();

    // Three password fields
    await expect(page.getByPlaceholder("Current Password")).toBeVisible();
    await expect(page.getByPlaceholder("New Password").first()).toBeVisible();
    await expect(page.getByPlaceholder("Confirm New Password")).toBeVisible();

    // Submit button
    await expect(dialog.getByRole("button", { name: /change password/i })).toBeVisible();
  });

  test("mismatched passwords show error message", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /security/i }).click();

    // Mismatch is checked before the value ever reaches the API, so no password
    // is actually changed here.
    await page.getByPlaceholder("Current Password").fill("admin");
    await page.getByPlaceholder("New Password").first().fill("NewPass123");
    await page.getByPlaceholder("Confirm New Password").fill("DifferentPass456");

    await page
      .getByRole("dialog")
      .getByRole("button", { name: /change password/i })
      .click();

    await expect(page.getByText("Passwords do not match")).toBeVisible();
  });

  test("password visibility toggles work", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /security/i }).click();

    const currentPwInput = page.getByPlaceholder("Current Password");
    await expect(currentPwInput).toHaveAttribute("type", "password");

    // Click the eye toggle button next to the current password field
    const toggleButtons = page.getByRole("dialog").locator("form button[type='button']");
    await toggleButtons.first().click();

    await expect(currentPwInput).toHaveAttribute("type", "text");
  });

  test("short password shows validation error", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /security/i }).click();

    // Too short fails the client-side length check (minimum 8) before any
    // request is sent, so no password is changed.
    await page.getByPlaceholder("Current Password").fill("admin");
    await page.getByPlaceholder("New Password").first().fill("ab");
    await page.getByPlaceholder("Confirm New Password").fill("ab");

    await page
      .getByRole("dialog")
      .getByRole("button", { name: /change password/i })
      .click();

    // Should show validation error about minimum length
    await expect(page.getByText(/at least 8 characters/i)).toBeVisible({ timeout: 5_000 });
  });

  test("wrong current password shows error message", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /security/i }).click();

    // Wrong current password: the API rejects with 401 and never updates the
    // stored hash, so the admin password is left untouched.
    await page.getByPlaceholder("Current Password").fill("wrongpassword");
    await page.getByPlaceholder("New Password").first().fill("NewPass123");
    await page.getByPlaceholder("Confirm New Password").fill("NewPass123");

    await page
      .getByRole("dialog")
      .getByRole("button", { name: /change password/i })
      .click();

    // The API returns 401 which maps to "Current password is incorrect"
    await expect(page.getByText("Current password is incorrect")).toBeVisible({ timeout: 5_000 });
  });

  test("successful password change shows success message", async ({
    loggedInPage: page,
    browser,
  }) => {
    // Run against a throwaway user so the shared admin password is never mutated.
    const { userPage, cleanup } = await changeThrowawayPasswordViaUi(
      page,
      browser,
      "Initpass123",
      "Newpass456",
    );
    try {
      await expect(userPage.getByText("Password changed successfully")).toBeVisible({
        timeout: 5_000,
      });
    } finally {
      await cleanup();
    }
  });

  test("form fields are cleared after successful password change", async ({
    loggedInPage: page,
    browser,
  }) => {
    const { userPage, cleanup } = await changeThrowawayPasswordViaUi(
      page,
      browser,
      "Initpass123",
      "Newpass456",
    );
    try {
      await expect(userPage.getByText("Password changed successfully")).toBeVisible({
        timeout: 5_000,
      });

      // All fields should be cleared after success
      await expect(userPage.getByPlaceholder("Current Password")).toHaveValue("");
      await expect(userPage.getByPlaceholder("New Password").first()).toHaveValue("");
      await expect(userPage.getByPlaceholder("Confirm New Password")).toHaveValue("");
    } finally {
      await cleanup();
    }
  });

  test("section heading and description are displayed", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /security/i }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Security", exact: true })).toBeVisible();
    await expect(dialog.getByText("Password and authentication settings.")).toBeVisible();
  });

  test("security section shows login attempt limit reference", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /security/i }).click();

    await expect(
      page.getByText("Login attempt limits can be configured in System Settings."),
    ).toBeVisible();
  });
});

test.describe("GUI Settings - API Keys Tab", () => {
  test("shows Generate API Key button and name input", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /api keys/i }).click();

    await expect(
      page.getByRole("dialog").getByRole("heading", { name: "API Keys", exact: true }),
    ).toBeVisible();
    await expect(page.getByPlaceholder("Key name (optional)")).toBeVisible();
    await expect(page.getByRole("button", { name: /generate api key/i })).toBeVisible();
  });

  test("generating an API key displays the key once", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /api keys/i }).click();

    // Give a unique name so we can identify and clean it up
    const keyName = `guiTest-${Date.now()}`;
    await page.getByPlaceholder("Key name (optional)").fill(keyName);
    await page.getByRole("button", { name: /generate api key/i }).click();

    // The key should appear in a code element
    const keyDisplay = page.locator("code.font-mono");
    await expect(keyDisplay).toBeVisible({ timeout: 5_000 });

    // The "Store this key" warning should be visible
    await expect(page.getByText("Store this key securely")).toBeVisible();

    // Clean up: delete the key we just created
    const deleteBtn = page.locator("button[title='Delete key']").first();
    if (await deleteBtn.isVisible()) {
      page.on("dialog", (d) => d.accept());
      await deleteBtn.click();
    }
  });

  test("generated key appears in existing keys list", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /api keys/i }).click();

    const keyName = `listTest-${Date.now()}`;
    await page.getByPlaceholder("Key name (optional)").fill(keyName);
    await page.getByRole("button", { name: /generate api key/i }).click();

    // Wait for key to appear
    await expect(page.locator("code.font-mono")).toBeVisible({ timeout: 5_000 });

    // The key name should appear in the "Existing Keys" section
    await expect(page.getByText("Existing Keys")).toBeVisible();
    await expect(page.getByText(keyName)).toBeVisible();

    // Clean up
    page.on("dialog", (d) => d.accept());
    await page.locator("button[title='Delete key']").first().click();
    await page.waitForTimeout(500);
  });

  test("permission scoping toggle reveals checkboxes", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /api keys/i }).click();

    const scopingToggle = page.getByText("Restrict permissions (optional)");
    await expect(scopingToggle).toBeVisible();

    await scopingToggle.click();

    // After expanding, the collapse text and permission checkboxes appear
    await expect(page.getByText("Remove permission scoping")).toBeVisible();
    await expect(page.locator("input[type='checkbox']").first()).toBeVisible();
    await expect(page.getByText("tools:use")).toBeVisible();
  });

  test("deleting an API key removes it from the list", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /api keys/i }).click();

    // Create a key to delete
    const keyName = `deleteTest-${Date.now()}`;
    await page.getByPlaceholder("Key name (optional)").fill(keyName);
    await page.getByRole("button", { name: /generate api key/i }).click();
    await expect(page.locator("code.font-mono")).toBeVisible({ timeout: 5_000 });

    // Confirm the key appears
    await expect(page.getByText(keyName)).toBeVisible();

    // Delete it
    page.on("dialog", (d) => d.accept());
    await page.locator("button[title='Delete key']").first().click();

    // Key name should disappear
    await expect(page.getByText(keyName)).not.toBeVisible({ timeout: 5_000 });
  });

  test("expiration date input is available", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /api keys/i }).click();

    await expect(page.getByText("Expires:")).toBeVisible();
    await expect(page.locator("input[type='datetime-local']")).toBeVisible();
  });
});
