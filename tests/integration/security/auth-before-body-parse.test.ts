/**
 * Requests without valid credentials are refused before their body is read
 * (#4543). A malformed JSON body is the probe: a 400 means Fastify parsed it,
 * a 401 means the auth hook answered first.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, loginAsAdmin, type TestApp } from "../test-server.js";

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
});

afterAll(async () => {
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

  it("leaves SCIM to its own bearer check, after the body is parsed", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/scim/v2/Users",
      headers: { ...json, authorization: "Bearer scim-token-not-a-session" },
      payload: malformed,
    });
    expect(res.statusCode).toBe(400);
  });
});
