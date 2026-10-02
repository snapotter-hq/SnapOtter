/**
 * What a real failing HTTP request leaves on a Sentry error event (#1880), with
 * production's default tracing-off config on a diagnostic instance.
 *
 * Before the fix the SDK buffered every incoming request body (its http
 * integration defaults to 10 KB, ungated by sendDefaultPii) and diagnostic mode
 * kept `event.request` whole, so a failing login shipped the password, a
 * failing SAML callback the SAMLResponse, and every request its Authorization
 * header, session cookie, and query string.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  expectNoSecrets,
  expectNothingCollected,
  type Harness,
  QUERY_TOKEN,
  REQUESTS,
  startHarness,
} from "./sentry-request-harness.js";

let harness: Harness;
beforeAll(async () => {
  harness = await startHarness({ tracing: false });
});
afterAll(async () => {
  await harness?.close();
});

describe("a failing request on a diagnostic instance, tracing off (#1880)", () => {
  it("ships no login password, credentials, or query token", async () => {
    const { event, rawRequests } = await harness.send(REQUESTS.login.path, REQUESTS.login.init);
    expectNothingCollected(rawRequests);
    expectNoSecrets(event, REQUESTS.login.secrets);
    // Diagnostic mode still says which request failed, and how.
    const request = event.request as { method?: string; url?: string; headers?: object };
    expect(request.method).toBe("POST");
    expect(request.url).toMatch(/\/api\/auth\/login$/);
    expect(request.headers).toEqual({
      "user-agent": "sentry-capture-test",
      "content-type": "application/json",
      accept: "*/*",
      "accept-language": "*",
      "accept-encoding": expect.any(String),
      "content-length": expect.any(String),
    });
    expect((event.tags as Record<string, string>).route).toBe("/api/auth/login");
    expect(event.transaction).toBe("POST /api/auth/login");
  });

  it("ships no SAMLResponse from a failing SAML callback", async () => {
    const { event, rawRequests } = await harness.send(REQUESTS.saml.path, REQUESTS.saml.init);
    expectNothingCollected(rawRequests);
    expectNoSecrets(event, REQUESTS.saml.secrets);
    expect((event.request as { url?: string }).url).toMatch(/\/api\/auth\/saml\/callback$/);
  });

  it("ships no file bytes or name from a failing multipart tool upload", async () => {
    // An earlier request in the same process, so the event has an http
    // breadcrumb whose url carried a token.
    await harness.ping(`/api/v1/health?token=${QUERY_TOKEN}#frag`);
    const { event, rawRequests } = await harness.send(REQUESTS.upload.path, REQUESTS.upload.init());
    expectNothingCollected(rawRequests);
    expectNoSecrets(event, REQUESTS.upload.secrets);
    expect((event.request as { url?: string }).url).toMatch(/\/api\/v1\/tools\/image\/resize$/);
    // The earlier requests' http breadcrumbs stay, without their query strings.
    const crumbs = event.breadcrumbs as Array<{
      category?: string;
      data?: Record<string, unknown>;
    }>;
    const http = crumbs.filter((b) => b.category === "http");
    expect(http.length).toBeGreaterThan(0);
    expect(http.some((b) => String(b.data?.url).endsWith("/api/v1/health"))).toBe(true);
    for (const b of http) {
      expect(b.data?.["http.query"]).toBeUndefined();
      expect(b.data?.["http.fragment"]).toBeUndefined();
      expect(String(b.data?.url)).not.toMatch(/[?#]/);
    }
  });
});
