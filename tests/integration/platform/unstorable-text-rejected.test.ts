/**
 * #2184: three endpoints store what the client sent, and read it back as data,
 * in a Postgres column that refuses a NUL byte (and, in jsonb, a lone UTF-16
 * surrogate). They answered 500, or a bare-catch 409 that blamed a conflict.
 * They now answer 400 and say why. #2177 covers the job rows, where the stored
 * copy is bookkeeping and is sanitized instead.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, loginAsAdmin, type TestApp } from "../test-server.js";

const NUL = String.fromCharCode(0);
const LONE_HIGH = String.fromCharCode(0xd800);

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

const auth = () => ({ authorization: `Bearer ${adminToken}` });

function expectRejected(res: { statusCode: number; body: string }) {
  expect(res.statusCode, res.body).toBe(400);
  expect(JSON.parse(res.body)).toMatchObject({ code: "VALIDATION_ERROR" });
}

describe("preferences refuse text Postgres cannot store", () => {
  const put = (payload: unknown) =>
    app.inject({ method: "PUT", url: "/api/v1/preferences", headers: auth(), payload });

  it.each([
    ["a NUL in a key", { [`a${NUL}b`]: "x" }],
    ["a NUL in a value", { a: `x${NUL}y` }],
    ["a lone surrogate in a value", { a: LONE_HIGH }],
    ["a lone surrogate in a key", { [`k${LONE_HIGH}`]: "x" }],
    ["a NUL deep inside a nested value", { a: { b: [`x${NUL}`] } }],
  ])("answers 400 for %s", async (_name, payload) => {
    expectRejected(await put(payload));
  });

  it("saves a deeply nested value instead of overflowing the stack", async () => {
    // Sent as text: inject's own JSON.stringify of a nested object would overflow first.
    const body = `{"deep":${'{"a":'.repeat(3000)}1${"}".repeat(3000)}}`;
    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/preferences",
      headers: { ...auth(), "content-type": "application/json" },
      payload: body,
    });
    expect(res.statusCode, res.body).toBe(200);
  });

  it("stores nothing from a refused body, even the valid keys beside the bad one", async () => {
    expectRejected(await put({ okKey: "fine", [`bad${NUL}`]: "x" }));

    const get = await app.inject({ method: "GET", url: "/api/v1/preferences", headers: auth() });
    expect(JSON.parse(get.body).preferences).not.toHaveProperty("okKey");
  });

  it("still saves ordinary text, including non-Latin text", async () => {
    const res = await put({ greeting: "こんにちは", nested: { list: ["a", "b"] } });
    expect(res.statusCode).toBe(200);

    const get = await app.inject({ method: "GET", url: "/api/v1/preferences", headers: auth() });
    expect(JSON.parse(get.body).preferences.greeting).toBe("こんにちは");
  });
});

describe("saved pipelines refuse text Postgres cannot store", () => {
  const save = (payload: unknown) =>
    app.inject({ method: "POST", url: "/api/v1/pipeline/save", headers: auth(), payload });
  const step = (settings: Record<string, unknown>) => ({ toolId: "rotate", settings });

  it.each([
    ["a lone surrogate in a step's settings", { name: "p", steps: [step({ angle: LONE_HIGH })] }],
    ["a NUL in a setting's key", { name: "p", steps: [step({ [`a${NUL}b`]: 1 })] }],
    ["a NUL in the name", { name: `p${NUL}q`, steps: [step({ angle: 90 })] }],
    ["a lone surrogate in the name", { name: `p${LONE_HIGH}`, steps: [step({ angle: 90 })] }],
    [
      "a NUL in the description",
      { name: "p", description: `d${NUL}`, steps: [step({ angle: 90 })] },
    ],
  ])("answers 400 for %s, not a misleading 409", async (_name, payload) => {
    expectRejected(await save(payload));
  });

  it("still saves a pipeline and keeps its settings as sent", async () => {
    const res = await save({ name: "kept-as-sent", steps: [step({ angle: 90 })] });
    expect(res.statusCode).toBe(201);

    const list = await app.inject({ method: "GET", url: "/api/v1/pipeline/list", headers: auth() });
    const saved = JSON.parse(list.body).pipelines.find(
      (p: { name: string }) => p.name === "kept-as-sent",
    );
    expect(saved.steps[0].settings).toEqual({ angle: 90 });
  });
});

describe("API-key names refuse text Postgres cannot store", () => {
  const create = (payload: unknown) =>
    app.inject({ method: "POST", url: "/api/v1/api-keys", headers: auth(), payload });

  it.each([
    ["a NUL in the name", { name: `k${NUL}ey` }],
    ["a lone surrogate in the name", { name: `k${LONE_HIGH}` }],
  ])("answers 400 for %s, not a stored key or a misleading 409", async (_name, payload) => {
    expectRejected(await create(payload));
  });

  it("creates no key and no half-written audit trail for a refused name", async () => {
    expectRejected(await create({ name: `ghost${LONE_HIGH}` }));

    const list = await app.inject({ method: "GET", url: "/api/v1/api-keys", headers: auth() });
    const names = JSON.parse(list.body).apiKeys.map((k: { name: string }) => k.name);
    expect(names.some((n: string) => n.startsWith("ghost"))).toBe(false);
  });

  it("still creates a key with an ordinary name", async () => {
    const res = await create({ name: "ordinary key" });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).name).toBe("ordinary key");
  });
});
