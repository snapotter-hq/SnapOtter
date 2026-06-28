import { expect, test } from "./helpers";

// Login rate limiting. This file name matches the serial bucket (SERIAL_SPECS
// in playwright.config.ts contains "security") so it runs isolated: the e2e
// webServer raises LOGIN_ATTEMPT_LIMIT very high so the many sign-ins across the
// RBAC/settings specs do not 429, so this test lowers the limit itself (via the
// admin-only loginAttemptLimit setting, which overrides the env) and restores
// it afterward. Running serial avoids tripping concurrent logins during the
// low-limit window.

const API = "http://localhost:13490";

test.describe("Login rate limiting", () => {
  test("after too many failed attempts, rate limiting kicks in", async ({ page }) => {
    // Get an admin token up front (before the limit is lowered) and use it to
    // change/restore the setting; /v1/settings is not rate limited, so this
    // never trips the login cap.
    const loginRes = await page.request.post(`${API}/api/auth/login`, {
      data: { username: "admin", password: "admin" },
    });
    const adminToken = (await loginRes.json()).token as string;
    expect(adminToken).toBeTruthy();

    const setLimit = (value: string) =>
      page.request.put(`${API}/api/v1/settings`, {
        headers: { authorization: `Bearer ${adminToken}` },
        data: { loginAttemptLimit: value },
      });

    await setLimit("5");

    try {
      // Hammer the login endpoint with bad credentials; once the per-minute cap
      // is exceeded the API must respond 429 instead of a normal 401.
      let got429 = false;
      let saw401 = false;
      for (let i = 0; i < 12; i++) {
        const res = await page.request.post(`${API}/api/auth/login`, {
          data: { username: `wrong-user-${i}`, password: `wrong-pass-${i}` },
        });
        if (res.status() === 429) {
          got429 = true;
          break;
        }
        if (res.status() === 401) saw401 = true;
      }

      // Bad credentials are rejected (401) and the rate limit eventually trips (429).
      expect(saw401).toBe(true);
      expect(got429).toBe(true);
    } finally {
      // Restore a high limit so later tests in the serial run can sign in.
      await setLimit("100000");
    }
  });
});
