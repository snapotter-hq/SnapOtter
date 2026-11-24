/**
 * Integration tests for the proportion-calculator tool
 * (/api/v1/tools/files/proportion-calculator).
 *
 * Three numbers in, one number out over a JSON body: both modes, the zero
 * divisor and overflow refusals, validation, and auth.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, loginAsAdmin, type TestApp } from "../../test-server.js";

const ROUTE = "/api/v1/tools/files/proportion-calculator";

let testApp: TestApp;
let app: TestApp["app"];
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);
});

afterAll(async () => {
  await testApp.cleanup();
});

function post(payload: unknown, token: string | null = adminToken) {
  return app.inject({
    method: "POST",
    url: ROUTE,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      "content-type": "application/json",
    },
    payload: payload as Record<string, unknown>,
  });
}

describe("proportion-calculator", () => {
  it("solves a direct proportion, the default mode", async () => {
    const res = await post({ a: 3, b: 6, c: 10 });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ mode: "direct", x: 20 });
  });

  it("solves an inverse proportion", async () => {
    const res = await post({ a: 4, b: 6, c: 8, mode: "inverse" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ mode: "inverse", x: 3 });
  });

  it("answers without floating-point noise", async () => {
    const res = await post({ a: 3, b: 0.1, c: 3 });
    expect(res.json()).toEqual({ mode: "direct", x: 0.1 });
  });

  it("refuses a zero divisor", async () => {
    expect((await post({ a: 0, b: 6, c: 10 })).statusCode).toBe(400);
    expect((await post({ a: 4, b: 6, c: 0, mode: "inverse" })).statusCode).toBe(400);
  });

  it("refuses an answer too large to represent", async () => {
    const res = await post({ a: 1e-300, b: 1e300, c: 1e300 });
    expect(res.statusCode).toBe(400);
  });

  it("refuses missing values, strings, and an unknown mode", async () => {
    expect((await post({})).statusCode).toBe(400);
    expect((await post({ a: 3, b: 6 })).statusCode).toBe(400);
    expect((await post({ a: "3", b: 6, c: 10 })).statusCode).toBe(400);
    expect((await post({ a: 3, b: 6, c: 10, mode: "sideways" })).statusCode).toBe(400);
  });

  it("requires authentication", async () => {
    const res = await post({ a: 3, b: 6, c: 10 }, null);
    expect(res.statusCode).toBe(401);
  });
});
