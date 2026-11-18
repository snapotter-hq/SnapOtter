/**
 * Requests without valid credentials are refused before their body is read
 * (#4543). A malformed JSON body is the probe: a 400 means Fastify parsed it,
 * a 401 means the auth hook answered first.
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../../apps/api/src/config.js";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { ensureAnonymousUser, hashPassword } from "../../../apps/api/src/plugins/auth.js";
import { SCIM_BODY_LIMIT_BYTES } from "../../../apps/api/src/routes/enterprise/scim.js";
import { buildTestApp, loginAsAdmin, type TestApp } from "../test-server.js";

const SCIM_TOKEN = `so_scim_v2_${"b".repeat(64)}`;

let testApp: TestApp;
let adminToken: string;
let apiKey: string;

const malformed = "{not json";
const json = { "content-type": "application/json" };

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
  const res = await testApp.app.inject({
    method: "POST",
    url: "/api/v1/api-keys",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { name: "auth-before-body-parse" },
  });
  expect(res.statusCode).toBe(201);
  apiKey = JSON.parse(res.body).key;
  const scimTokenHash = await hashPassword(SCIM_TOKEN);
  await db
    .insert(schema.settings)
    .values({ key: "scim_token_hash", value: scimTokenHash })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: scimTokenHash } });
});

afterAll(async () => {
  await db.delete(schema.settings).where(eq(schema.settings.key, "scim_token_hash"));
  await testApp.cleanup();
});

describe("unauthenticated bodies are not parsed", () => {
  const anonymous: Array<{ name: string; headers: Record<string, string> }> = [
    { name: "no credentials", headers: {} },
    { name: "an unknown bearer token", headers: { authorization: "Bearer not-a-session" } },
    { name: "an unknown API key", headers: { authorization: "Bearer si_0000000000000000" } },
    { name: "an unknown session cookie", headers: { cookie: "snapotter-session=not-a-session" } },
  ];

  it.each(anonymous)("PUT /api/v1/settings with $name answers 401", async ({ headers }) => {
    const res = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      headers: { ...json, ...headers },
      payload: malformed,
    });
    expect(res.statusCode).toBe(401);
  });

  it("POST /api/v1/api-keys with no credentials answers 401", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/api-keys",
      headers: json,
      payload: malformed,
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("authenticated and public bodies are still parsed", () => {
  it("parses the body for a bearer session", async () => {
    const res = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      headers: { ...json, authorization: `Bearer ${adminToken}` },
      payload: malformed,
    });
    expect(res.statusCode).toBe(400);
  });

  it("parses the body for a session cookie", async () => {
    const res = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      headers: { ...json, cookie: `snapotter-session=${adminToken}` },
      payload: malformed,
    });
    expect(res.statusCode).toBe(400);
  });

  it("parses the body for an API key", async () => {
    const res = await testApp.app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      headers: { ...json, authorization: `Bearer ${apiKey}` },
      payload: malformed,
    });
    expect(res.statusCode).toBe(400);
  });

  it("accepts a valid body from an API key", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/api-keys",
      headers: { authorization: `Bearer ${apiKey}` },
      payload: { name: "created-by-key" },
    });
    expect(res.statusCode).toBe(201);
  });

  it("accepts a valid body from a session", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/api-keys",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "created-by-session" },
    });
    expect(res.statusCode).toBe(201);
  });

  it("parses the login body with no credentials", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: json,
      payload: malformed,
    });
    expect(res.statusCode).toBe(400);
  });

  it("still logs in with a valid body", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "admin", password: "wrongpass1" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("checks the SCIM bearer token before parsing the body (#4632)", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/scim/v2/Users",
      headers: { ...json, authorization: "Bearer scim-token-not-a-session" },
      payload: malformed,
    });
    expect(res.statusCode).toBe(401);
  });

  it("checks auth on POST /api/v1/jobs/:jobId/cancel before parsing the body (#4632)", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/jobs/some-job-id/cancel",
      headers: json,
      payload: malformed,
    });
    expect(res.statusCode).toBe(401);
  });
});

// SCIM and job cancel sit under public prefixes, so the global hook lets
// them through and each route checks its own credentials (#4632).
describe("SCIM checks its bearer token before the body is read", () => {
  const scim = { ...json, authorization: `Bearer ${SCIM_TOKEN}` };
  // Past the SCIM body cap, so a 413 means the body was read.
  const oversized = JSON.stringify({ filler: "a".repeat(SCIM_BODY_LIMIT_BYTES) });

  it.each([
    { name: "no credentials", headers: {} },
    { name: "a malformed bearer token", headers: { authorization: "Bearer not-a-scim-token" } },
    {
      name: "a well-formed wrong token",
      headers: { authorization: `Bearer so_scim_v2_${"c".repeat(64)}` },
    },
    { name: "an admin session", headers: () => ({ authorization: `Bearer ${adminToken}` }) },
  ])("POST /Users with $name answers 401 to a malformed body", async ({ headers }) => {
    const auth = typeof headers === "function" ? headers() : headers;
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/scim/v2/Users",
      headers: { ...json, ...auth },
      payload: malformed,
    });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).schemas).toContain("urn:ietf:params:scim:api:messages:2.0:Error");
  });

  it.each([
    { method: "PUT" as const, url: `/api/v1/scim/v2/Users/${randomUUID()}` },
    { method: "PATCH" as const, url: `/api/v1/scim/v2/Users/${randomUUID()}` },
    { method: "POST" as const, url: "/api/v1/scim/v2/Groups" },
    { method: "PUT" as const, url: `/api/v1/scim/v2/Groups/${randomUUID()}` },
    { method: "PATCH" as const, url: `/api/v1/scim/v2/Groups/${randomUUID()}` },
  ])("anonymous $method $url answers 401 to a malformed body", async ({ method, url }) => {
    const res = await testApp.app.inject({ method, url, headers: json, payload: malformed });
    expect(res.statusCode).toBe(401);
  });

  it("answers 401 to an anonymous HEAD on a resource list", async () => {
    const res = await testApp.app.inject({ method: "HEAD", url: "/api/v1/scim/v2/Users" });
    expect(res.statusCode).toBe(401);
  });

  it("answers 401, not 413, to an anonymous body over the cap", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/scim/v2/Users",
      headers: json,
      payload: oversized,
    });
    expect(res.statusCode).toBe(401);
  });

  it("parses the body for a valid SCIM token", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/scim/v2/Users",
      headers: scim,
      payload: malformed,
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).schemas).toContain("urn:ietf:params:scim:api:messages:2.0:Error");
  });

  // This app has no SCIM licence, so a request that clears the token check
  // ends at the feature gate in the handler. The licensed create, read, and
  // update flows are in tests/integration/platform/scim.test.ts.
  it("lets a valid SCIM token through to the handler", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/scim/v2/Users",
      headers: { authorization: `Bearer ${SCIM_TOKEN}` },
      payload: { schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"], userName: "scim-body" },
    });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).detail).not.toMatch(/token/i);
  });

  it("refuses a valid token's body over the cap with a SCIM 413", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/scim/v2/Users",
      headers: scim,
      payload: oversized,
    });
    expect(res.statusCode).toBe(413);
    expect(JSON.parse(res.body).schemas).toContain("urn:ietf:params:scim:api:messages:2.0:Error");
  });

  it("keeps the discovery endpoints public", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/scim/v2/ServiceProviderConfig",
    });
    expect(res.statusCode).toBe(200);
  });
});

describe("job cancel checks credentials before the body is read", () => {
  async function insertJob(userId: string): Promise<string> {
    const id = randomUUID();
    await db.insert(schema.jobs).values({ id, userId, type: "tool", status: "completed" });
    return id;
  }

  it("answers 401 to an anonymous malformed body", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: `/api/v1/jobs/${randomUUID()}/cancel`,
      headers: json,
      payload: malformed,
    });
    expect(res.statusCode).toBe(401);
  });

  it("refuses a body over the cancel cap from a signed-in caller", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: `/api/v1/jobs/${randomUUID()}/cancel`,
      headers: { ...json, authorization: `Bearer ${adminToken}` },
      payload: JSON.stringify({ filler: "a".repeat(4096) }),
    });
    expect(res.statusCode).toBe(413);
  });

  it("lets the owner cancel with no body", async () => {
    const [admin] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.username, "admin"));
    const jobId = await insertJob(admin.id);
    const res = await testApp.app.inject({
      method: "POST",
      url: `/api/v1/jobs/${jobId}/cancel`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ canceled: false });
  });

  it("lets anyone cancel in anonymous mode", async () => {
    await ensureAnonymousUser();
    const jobId = await insertJob("anonymous");
    const previous = env.AUTH_ENABLED;
    env.AUTH_ENABLED = false;
    try {
      const res = await testApp.app.inject({
        method: "POST",
        url: `/api/v1/jobs/${jobId}/cancel`,
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ canceled: false });
    } finally {
      env.AUTH_ENABLED = previous;
    }
  });
});
