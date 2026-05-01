import { test as base, expect } from "@playwright/test";
import { openSettings, test as uiTest } from "./helpers";

const API = process.env.API_URL || "http://localhost:13490";

async function getAuthToken(): Promise<string> {
  const res = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin" }),
  });
  const data = await res.json();
  return data.token;
}

/** Auth header only — for GET and DELETE (no body). */
function authOnly(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/** Auth + JSON content-type — for POST/PUT with body. */
function authJson(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

/** Delete all non-admin users (cleanup helper). */
async function cleanupTestUsers(token: string) {
  const listRes = await fetch(`${API}/api/auth/users`, {
    headers: authOnly(token),
  });
  if (!listRes.ok) return;
  const { users } = await listRes.json();
  for (const u of users) {
    if (u.username === "admin") continue;
    await fetch(`${API}/api/auth/users/${u.id}`, {
      method: "DELETE",
      headers: authOnly(token),
    });
  }
}

/** Ensure a team exists by name (create if missing). */
async function ensureTeam(token: string, name: string) {
  const res = await fetch(`${API}/api/v1/teams`, {
    method: "POST",
    headers: authJson(token),
    body: JSON.stringify({ name }),
  });
  // 201 = created, 409 = already exists — both are fine
  if (res.status !== 201 && res.status !== 409) {
    throw new Error(`Failed to ensure team "${name}": ${res.status}`);
  }
}

base.describe("People Management — API", () => {
  let token: string;

  base.beforeAll(async () => {
    token = await getAuthToken();
    // Create teams used by the tests
    await ensureTeam(token, "Engineering");
    await ensureTeam(token, "Design");
  });

  base.beforeEach(async () => {
    await cleanupTestUsers(token);
  });

  base.afterAll(async () => {
    await cleanupTestUsers(token);
  });

  // ── GET /api/auth/users ───────────────────────────────────────────

  base.test("GET /api/auth/users returns users with team and maxUsers", async () => {
    const res = await fetch(`${API}/api/auth/users`, {
      headers: authOnly(token),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.users)).toBe(true);
    expect(typeof data.maxUsers).toBe("number");
    expect(data.users[0]).toHaveProperty("team");
  });

  // ── POST /api/auth/register ───────────────────────────────────────

  base.test("register a new user with team", async () => {
    const res = await fetch(`${API}/api/auth/register`, {
      method: "POST",
      headers: authJson(token),
      body: JSON.stringify({
        username: "testuser1",
        password: "Test1234",
        role: "user",
        team: "Engineering",
      }),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.username).toBe("testuser1");
    expect(data.role).toBe("user");
    expect(data.team).toBe("Engineering");
  });

  base.test("register defaults team to Default", async () => {
    const res = await fetch(`${API}/api/auth/register`, {
      method: "POST",
      headers: authJson(token),
      body: JSON.stringify({
        username: "teamdefault",
        password: "Test1234",
        role: "user",
      }),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.team).toBe("Default");
  });

  base.test("register allows unlimited users when MAX_USERS=0", async () => {
    for (let i = 1; i <= 3; i++) {
      const res = await fetch(`${API}/api/auth/register`, {
        method: "POST",
        headers: authJson(token),
        body: JSON.stringify({
          username: `limituser${i}`,
          password: "Test1234",
          role: "user",
        }),
      });
      expect(res.status).toBe(201);
    }
  });

  base.test("register rejects duplicate username", async () => {
    await fetch(`${API}/api/auth/register`, {
      method: "POST",
      headers: authJson(token),
      body: JSON.stringify({ username: "dupuser", password: "Test1234" }),
    });

    const res = await fetch(`${API}/api/auth/register`, {
      method: "POST",
      headers: authJson(token),
      body: JSON.stringify({ username: "dupuser", password: "Test1234" }),
    });
    expect(res.status).toBe(409);
  });

  base.test("register rejects weak password", async () => {
    const res = await fetch(`${API}/api/auth/register`, {
      method: "POST",
      headers: authJson(token),
      body: JSON.stringify({ username: "weakpw", password: "weak" }),
    });
    expect(res.status).toBe(400);
  });

  // ── PUT /api/auth/users/:id ───────────────────────────────────────

  base.test("update user role and team", async () => {
    const createRes = await fetch(`${API}/api/auth/register`, {
      method: "POST",
      headers: authJson(token),
      body: JSON.stringify({ username: "editable", password: "Test1234", role: "user" }),
    });
    const { id } = await createRes.json();

    const updateRes = await fetch(`${API}/api/auth/users/${id}`, {
      method: "PUT",
      headers: authJson(token),
      body: JSON.stringify({ role: "admin", team: "Design" }),
    });
    expect(updateRes.status).toBe(200);

    // Verify
    const listRes = await fetch(`${API}/api/auth/users`, {
      headers: authOnly(token),
    });
    const { users } = await listRes.json();
    const updated = users.find((u: { id: string }) => u.id === id);
    expect(updated.role).toBe("admin");
    expect(updated.team).toBe("Design");
  });

  base.test("cannot demote yourself", async () => {
    const sessionRes = await fetch(`${API}/api/auth/session`, {
      headers: authOnly(token),
    });
    const { user } = await sessionRes.json();

    const res = await fetch(`${API}/api/auth/users/${user.id}`, {
      method: "PUT",
      headers: authJson(token),
      body: JSON.stringify({ role: "user" }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe("SELF_DEMOTE");
  });

  base.test("update nonexistent user returns 404", async () => {
    const res = await fetch(`${API}/api/auth/users/nonexistent-id`, {
      method: "PUT",
      headers: authJson(token),
      body: JSON.stringify({ role: "admin" }),
    });
    expect(res.status).toBe(404);
  });

  // ── POST /api/auth/users/:id/reset-password ──────────────────────

  base.test("admin can reset another user password", async () => {
    const createRes = await fetch(`${API}/api/auth/register`, {
      method: "POST",
      headers: authJson(token),
      body: JSON.stringify({ username: "resetme", password: "Test1234" }),
    });
    const { id } = await createRes.json();

    const res = await fetch(`${API}/api/auth/users/${id}/reset-password`, {
      method: "POST",
      headers: authJson(token),
      body: JSON.stringify({ newPassword: "NewPass123" }),
    });
    expect(res.status).toBe(200);

    // Verify new password works
    const loginRes = await fetch(`${API}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "resetme", password: "NewPass123" }),
    });
    expect(loginRes.status).toBe(200);
  });

  base.test("reset password rejects weak password", async () => {
    const createRes = await fetch(`${API}/api/auth/register`, {
      method: "POST",
      headers: authJson(token),
      body: JSON.stringify({ username: "weakreset", password: "Test1234" }),
    });
    const { id } = await createRes.json();

    const res = await fetch(`${API}/api/auth/users/${id}/reset-password`, {
      method: "POST",
      headers: authJson(token),
      body: JSON.stringify({ newPassword: "weak" }),
    });
    expect(res.status).toBe(400);
  });

  base.test("reset password for nonexistent user returns 404", async () => {
    const res = await fetch(`${API}/api/auth/users/nonexistent-id/reset-password`, {
      method: "POST",
      headers: authJson(token),
      body: JSON.stringify({ newPassword: "Test1234" }),
    });
    expect(res.status).toBe(404);
  });

  // ── DELETE /api/auth/users/:id ────────────────────────────────────

  base.test("delete a user", async () => {
    const createRes = await fetch(`${API}/api/auth/register`, {
      method: "POST",
      headers: authJson(token),
      body: JSON.stringify({ username: "deleteme", password: "Test1234" }),
    });
    const { id } = await createRes.json();

    const res = await fetch(`${API}/api/auth/users/${id}`, {
      method: "DELETE",
      headers: authOnly(token),
    });
    expect(res.status).toBe(200);

    // Verify deleted
    const listRes = await fetch(`${API}/api/auth/users`, {
      headers: authOnly(token),
    });
    const { users } = await listRes.json();
    expect(users.find((u: { id: string }) => u.id === id)).toBeUndefined();
  });

  base.test("cannot delete yourself", async () => {
    const sessionRes = await fetch(`${API}/api/auth/session`, {
      headers: authOnly(token),
    });
    const { user } = await sessionRes.json();

    const res = await fetch(`${API}/api/auth/users/${user.id}`, {
      method: "DELETE",
      headers: authOnly(token),
    });
    expect(res.status).toBe(400);
  });

  // ── Non-admin access ──────────────────────────────────────────────

  base.test("non-admin cannot access user management", async () => {
    await fetch(`${API}/api/auth/register`, {
      method: "POST",
      headers: authJson(token),
      body: JSON.stringify({ username: "regularuser", password: "Test1234", role: "user" }),
    });

    const loginRes = await fetch(`${API}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "regularuser", password: "Test1234" }),
    });
    const { token: userToken } = await loginRes.json();

    const res = await fetch(`${API}/api/auth/users`, {
      headers: authOnly(userToken),
    });
    // 403 — MUST_CHANGE_PASSWORD blocks non-auth API calls
    expect(res.status).toBe(403);
  });
});

uiTest.describe("People Management — UI", () => {
  uiTest("People section displays user count and table", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /people/i }).click();
    await page.waitForTimeout(500);

    // Should show user count
    await expect(page.getByText(/\d+ users?/)).toBeVisible();

    // Should show table headers
    await expect(page.getByText("User").first()).toBeVisible();
    await expect(page.getByText("Role").first()).toBeVisible();
    await expect(page.getByText("Team").first()).toBeVisible();

    // Should show admin user in table
    await expect(page.getByText("admin").first()).toBeVisible();
    await expect(page.getByText("ADMIN").first()).toBeVisible();
    await expect(page.getByText("Default").first()).toBeVisible();
  });

  uiTest("Search filters users", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /people/i }).click();
    await page.waitForTimeout(500);

    // Search for nonexistent user
    await page.getByPlaceholder("Search members...").fill("zzzznonexistent");
    await expect(page.getByText("No members match your search.")).toBeVisible();

    // Clear search shows admin again
    await page.getByPlaceholder("Search members...").fill("");
    await expect(page.getByText("admin").first()).toBeVisible();
  });

  uiTest("Add Members button is visible and interactive", async ({ loggedInPage: page }) => {
    await openSettings(page);
    await page.getByRole("button", { name: /people/i }).click();
    await page.waitForTimeout(500);

    // The Add Members button should be visible
    const addBtn = page.getByRole("button", { name: /add members/i });
    await expect(addBtn).toBeVisible();

    // If at limit, it should be disabled; if not, clicking should show form
    const isDisabled = await addBtn.isDisabled();
    if (!isDisabled) {
      await addBtn.click();
      await expect(page.getByPlaceholder("Username")).toBeVisible();
      await expect(page.getByPlaceholder("Password")).toBeVisible();
      // Team is a <select> dropdown, not a text input with placeholder
      await expect(page.locator("select").first()).toBeVisible();
      await expect(page.getByRole("button", { name: /create/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /cancel/i })).toBeVisible();
    }
  });

  uiTest(
    "Three-dot menu shows edit, reset password, and delete options",
    async ({ loggedInPage: page }) => {
      await openSettings(page);
      await page.getByRole("button", { name: /people/i }).click();
      await page.waitForTimeout(500);

      await page.getByTitle("Actions").first().click();

      await expect(page.getByText("Edit Role / Team")).toBeVisible();
      await expect(page.getByText("Reset Password")).toBeVisible();
      await expect(page.getByText("Delete User")).toBeVisible();
    },
  );
});
