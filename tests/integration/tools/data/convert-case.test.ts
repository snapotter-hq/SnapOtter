/**
 * Integration tests for the convert-case tool (/api/v1/tools/files/convert-case).
 *
 * Text in, text out over a JSON body: each mode family, the locale option,
 * validation, and the input size limit.
 */

import { CONVERT_CASE_MAX_CHARS } from "@snapotter/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, loginAsAdmin, type TestApp } from "../../test-server.js";

const ROUTE = "/api/v1/tools/files/convert-case";

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

describe("convert-case", () => {
  it.each([
    ["upper", "HELLO BIG WORLD. AGAIN"],
    ["lower", "hello big world. again"],
    ["sentence", "Hello big world. Again"],
    ["title", "Hello Big World. Again"],
    ["capitalized", "Hello Big World. Again"],
    ["inverse", "hELLO BIG wORLD. AGAIN"],
    ["alternating", "hElLo BiG wOrLd. AgAiN"],
    ["camel", "helloBigWorldAgain"],
    ["pascal", "HelloBigWorldAgain"],
    ["snake", "hello_big_world_again"],
    ["kebab", "hello-big-world-again"],
  ])("converts to %s", async (mode, expected) => {
    const res = await post({ text: "Hello big World. again", mode });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ mode, result: expected });
  });

  it("applies the requested locale's casing rules", async () => {
    const tr = await post({ text: "istanbul", mode: "upper", locale: "tr" });
    expect(tr.json().result).toBe("İSTANBUL");
    const neutral = await post({ text: "istanbul", mode: "upper" });
    expect(neutral.json().result).toBe("ISTANBUL");
  });

  it("refuses a malformed locale tag", async () => {
    const res = await post({ text: "hi", mode: "upper", locale: "not a locale!" });
    expect(res.statusCode).toBe(400);
  });

  it("refuses an empty body, empty text, and an unknown mode", async () => {
    expect((await post({})).statusCode).toBe(400);
    expect((await post({ text: "", mode: "upper" })).statusCode).toBe(400);
    expect((await post({ text: "hi", mode: "rot13" })).statusCode).toBe(400);
  });

  it("takes text at the limit and refuses one character more", async () => {
    const atLimit = await post({ text: "a".repeat(CONVERT_CASE_MAX_CHARS), mode: "upper" });
    expect(atLimit.statusCode).toBe(200);
    const over = await post({ text: "a".repeat(CONVERT_CASE_MAX_CHARS + 1), mode: "upper" });
    expect(over.statusCode).toBe(400);
  });

  it("requires authentication", async () => {
    const res = await post({ text: "hi", mode: "upper" }, null);
    expect(res.statusCode).toBe(401);
  });
});
