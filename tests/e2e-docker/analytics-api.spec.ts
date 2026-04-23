import { expect, test } from "@playwright/test";

// ─── Analytics API Endpoints ────────────────────────────────────────
// Tests for the analytics config and user consent API endpoints.
// These run against the Docker container at localhost:1349.

const BASE_URL = "http://localhost:1349";
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Login and return a Bearer token for authenticated requests. */
async function getAuthToken(): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin" }),
  });
  const data = await res.json();
  return data.token;
}

test.describe("GET /api/v1/config/analytics (public)", () => {
  test("returns 200 without auth token", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/config/analytics`);
    expect(res.status).toBe(200);
  });

  test("response has correct analytics config shape", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/config/analytics`);
    const config = await res.json();

    expect(config).toHaveProperty("enabled");
    expect(config).toHaveProperty("posthogApiKey");
    expect(config).toHaveProperty("posthogHost");
    expect(config).toHaveProperty("sentryDsn");
    expect(config).toHaveProperty("sampleRate");
    expect(config).toHaveProperty("instanceId");

    expect(typeof config.enabled).toBe("boolean");
    expect(typeof config.posthogApiKey).toBe("string");
    expect(typeof config.posthogHost).toBe("string");
    expect(typeof config.sentryDsn).toBe("string");
    expect(typeof config.sampleRate).toBe("number");
    expect(typeof config.instanceId).toBe("string");
  });

  test("instanceId is a valid UUID when analytics enabled", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/config/analytics`);
    const config = await res.json();

    if (config.enabled) {
      expect(config.instanceId).toMatch(UUID_REGEX);
    } else {
      // When disabled, instanceId is empty string
      expect(config.instanceId).toBe("");
    }
  });

  test("instanceId is consistent across multiple fetches", async () => {
    const res1 = await fetch(`${BASE_URL}/api/v1/config/analytics`);
    const config1 = await res1.json();

    const res2 = await fetch(`${BASE_URL}/api/v1/config/analytics`);
    const config2 = await res2.json();

    expect(config1.instanceId).toBe(config2.instanceId);
  });
});

test.describe("PUT /api/v1/user/analytics (auth required)", () => {
  test("returns 401 without auth token", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/user/analytics`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });
    expect(res.status).toBe(401);
  });

  test("accepts consent with enabled: true", async () => {
    const token = await getAuthToken();

    const res = await fetch(`${BASE_URL}/api/v1/user/analytics`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ enabled: true }),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({ ok: true, analyticsEnabled: true });
  });

  test("declines consent with enabled: false", async () => {
    const token = await getAuthToken();

    const res = await fetch(`${BASE_URL}/api/v1/user/analytics`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ enabled: false }),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({ ok: true, analyticsEnabled: false });
  });

  test("remind later sets analyticsEnabled to null", async () => {
    const token = await getAuthToken();

    const res = await fetch(`${BASE_URL}/api/v1/user/analytics`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ remindLater: true }),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({ ok: true, analyticsEnabled: null });
  });
});

test.describe("GET /api/auth/session includes analytics fields", () => {
  test("session response contains analytics consent fields", async () => {
    const token = await getAuthToken();

    // First set a consent preference so the fields are populated
    await fetch(`${BASE_URL}/api/v1/user/analytics`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ enabled: true }),
    });

    // Fetch session
    const sessionRes = await fetch(`${BASE_URL}/api/auth/session`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(sessionRes.status).toBe(200);

    const session = await sessionRes.json();

    // The user object should include analytics fields
    expect(session.user).toHaveProperty("analyticsEnabled");
    expect(session.user).toHaveProperty("analyticsConsentShownAt");
    expect(session.user).toHaveProperty("analyticsConsentRemindAt");

    // After accepting, analyticsEnabled should be true
    expect(session.user.analyticsEnabled).toBe(true);
    // analyticsConsentShownAt should be a timestamp (number)
    expect(typeof session.user.analyticsConsentShownAt).toBe("number");
    // analyticsConsentRemindAt should be null after explicit accept
    expect(session.user.analyticsConsentRemindAt).toBeNull();
  });

  test("session reflects remind-later state", async () => {
    const token = await getAuthToken();

    // Set remind later
    await fetch(`${BASE_URL}/api/v1/user/analytics`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ remindLater: true }),
    });

    // Fetch session
    const sessionRes = await fetch(`${BASE_URL}/api/auth/session`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const session = await sessionRes.json();

    expect(session.user.analyticsEnabled).toBeNull();
    expect(typeof session.user.analyticsConsentShownAt).toBe("number");
    // analyticsConsentRemindAt should be a future timestamp
    expect(typeof session.user.analyticsConsentRemindAt).toBe("number");
    expect(session.user.analyticsConsentRemindAt).toBeGreaterThan(Date.now());
  });
});
