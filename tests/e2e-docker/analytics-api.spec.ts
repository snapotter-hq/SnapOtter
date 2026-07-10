import { expect, test } from "@playwright/test";

// Tests for the analytics config endpoint.
// These run against the Docker container at localhost:1349.

const BASE_URL = "http://localhost:1349";
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    expect(config).toHaveProperty("sentryDsnWeb");
    expect(config).toHaveProperty("posthogSampleRate");
    expect(config).toHaveProperty("instanceId");

    expect(typeof config.enabled).toBe("boolean");
    expect(typeof config.posthogApiKey).toBe("string");
    expect(typeof config.posthogHost).toBe("string");
    expect(typeof config.sentryDsn).toBe("string");
    expect(typeof config.sentryDsnWeb).toBe("string");
    expect(typeof config.posthogSampleRate).toBe("number");
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
