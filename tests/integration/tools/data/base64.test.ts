/**
 * Integration tests for the base64 tool (/api/v1/tools/files/base64).
 *
 * Text in, text out over a JSON body: encode, decode, the URL-safe alphabet,
 * wrapped input, the two coded refusals, and the input size limit.
 */

import { BASE64_TEXT_MAX_CHARS } from "@snapotter/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, loginAsAdmin, type TestApp } from "../../test-server.js";

const ROUTE = "/api/v1/tools/files/base64";

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

describe("base64", () => {
  it("encodes UTF-8 text", async () => {
    const res = await post({ text: "Hello, World! 🦦", mode: "encode" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      mode: "encode",
      result: Buffer.from("Hello, World! 🦦").toString("base64"),
    });
  });

  it("encodes with the URL-safe alphabet and no padding", async () => {
    const res = await post({ text: "~~~?>?a", mode: "encode", urlSafe: true });
    expect(res.statusCode).toBe(200);
    expect(res.json().result).toBe("fn5-Pz4_YQ");
  });

  it("decodes standard Base64", async () => {
    const res = await post({ text: "SGVsbG8sIFdvcmxkIQ==", mode: "decode" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ mode: "decode", result: "Hello, World!" });
  });

  it("decodes URL-safe Base64 without padding", async () => {
    const res = await post({ text: "fn5-Pz4_YQ", mode: "decode" });
    expect(res.statusCode).toBe(200);
    expect(res.json().result).toBe("~~~?>?a");
  });

  it("decodes Base64 wrapped across lines", async () => {
    const res = await post({ text: "SGVsbG8s\r\nIFdvcmxk\nIQ==\n", mode: "decode" });
    expect(res.statusCode).toBe(200);
    expect(res.json().result).toBe("Hello, World!");
  });

  it("refuses input that is not Base64 with ENCODED_TEXT_INVALID", async () => {
    const res = await post({ text: "not base64!", mode: "decode" });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("ENCODED_TEXT_INVALID");
  });

  it("refuses Base64 of binary data with DECODED_DATA_NOT_TEXT", async () => {
    const binary = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xff, 0xfe]).toString("base64");
    const res = await post({ text: binary, mode: "decode" });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("DECODED_DATA_NOT_TEXT");
  });

  it("refuses an empty body, empty text, and an unknown mode", async () => {
    expect((await post({})).statusCode).toBe(400);
    expect((await post({ text: "", mode: "encode" })).statusCode).toBe(400);
    expect((await post({ text: "hi", mode: "rot13" })).statusCode).toBe(400);
  });

  it("takes text at the limit and refuses one character more", async () => {
    const atLimit = await post({ text: "a".repeat(BASE64_TEXT_MAX_CHARS), mode: "encode" });
    expect(atLimit.statusCode).toBe(200);
    const over = await post({ text: "a".repeat(BASE64_TEXT_MAX_CHARS + 1), mode: "encode" });
    expect(over.statusCode).toBe(400);
  });

  it("requires authentication", async () => {
    const res = await post({ text: "hi", mode: "encode" }, null);
    expect(res.statusCode).toBe(401);
  });
});
