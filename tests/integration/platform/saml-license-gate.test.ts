/**
 * SAML license-gate coverage.
 *
 * saml-auth.test.ts licenses the saml_sso feature so the routes register. This
 * companion drives the *other* branch: SAML_ENABLED is on, but the enterprise
 * saml_sso feature is NOT licensed, so registerSaml() logs a warning and
 * returns early WITHOUT registering any /api/auth/saml/* route. Isolated in its
 * own file because the enterprise gate is mocked to deny (mockNoEnterprise via
 * vi.doMock), the inverse of the sibling suite.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.resetModules();
const { mockNoEnterprise } = await import("../../helpers/enterprise-mock.js");
mockNoEnterprise();

const { env } = await import("../../../apps/api/src/config.js");
const { buildTestApp } = await import("../test-server.js");

import type { TestApp } from "../test-server.js";

let testApp: TestApp;

// SAML env is validated by loadEnv()'s superRefine only at load time; the
// module graph is already loaded here, so mutating the cached env after the
// fact turns SAML on for registerSaml() without tripping that validation.
const saved: Record<string, unknown> = {};
const SAML_ENV = {
  SAML_ENABLED: true,
  EXTERNAL_URL: "http://localhost:9999",
  SAML_IDP_SSO_URL: "http://localhost:0/sso",
  SAML_IDP_CERTIFICATE: "MIIC-test-certificate",
};

beforeAll(async () => {
  for (const [k, v] of Object.entries(SAML_ENV)) {
    saved[k] = (env as Record<string, unknown>)[k];
    (env as Record<string, unknown>)[k] = v;
  }
  testApp = await buildTestApp();
}, 30_000);

afterAll(async () => {
  for (const [k, v] of Object.entries(saved)) {
    (env as Record<string, unknown>)[k] = v;
  }
  await testApp.cleanup();
}, 10_000);

describe("SAML routes when saml_sso is not licensed", () => {
  it("does not register the metadata route (early return, feature unlicensed)", async () => {
    // The route only exists when registerSaml() gets past the license check.
    // With the feature denied it returns early, so Fastify has no handler and
    // falls through to a plain 404 (the path is public, so the auth middleware
    // does not turn it into a 401 first).
    const res = await testApp.app.inject({ method: "GET", url: "/api/auth/saml/metadata" });
    expect(res.statusCode).toBe(404);
  });

  it("does not register the login route", async () => {
    const res = await testApp.app.inject({ method: "GET", url: "/api/auth/saml/login" });
    expect(res.statusCode).toBe(404);
  });

  it("does not register the ACS callback route", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/saml/callback",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: "SAMLResponse=stub",
    });
    expect(res.statusCode).toBe(404);
  });
});
