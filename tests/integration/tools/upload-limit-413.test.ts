/**
 * Tool routes answered an upload over MAX_UPLOAD_SIZE_MB ("10" in every
 * vitest run) with 400 "Failed to parse multipart request", so a client
 * couldn't tell "too big" from "malformed" (#1341). One factory route and two
 * custom ones stand in for the rest; tests/unit/api/multipart-failure-drift
 * holds every route to the shared helper.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

const OVER_LIMIT = Buffer.alloc(11 * 1024 * 1024, 1);

describe("tool routes answer 413 for an over-limit upload", () => {
  it.each([
    ["factory route", "/api/v1/tools/image/compress"],
    ["custom route", "/api/v1/tools/image/info"],
    ["multi-file custom route", "/api/v1/tools/image/stitch"],
  ])("%s %s", async (_kind, url) => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "big.png", contentType: "image/png", content: OVER_LIMIT },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url,
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      payload: body,
    });

    expect(res.statusCode).toBe(413);
    expect(JSON.parse(res.body)).toEqual({ error: "File exceeds the 10 MB upload limit" });
  });
});
