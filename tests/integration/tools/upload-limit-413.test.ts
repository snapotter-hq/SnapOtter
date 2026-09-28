/**
 * Tool routes answered an upload over MAX_UPLOAD_SIZE_MB ("10" in every
 * vitest run) with 400 "Failed to parse multipart request", so a client
 * couldn't tell "too big" from "malformed" (#1341). A factory route, custom
 * routes, and a multi-file route stand in for the rest;
 * tests/unit/api/multipart-failure-drift holds every route to the helper.
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
const SMALL = Buffer.alloc(1024, 1);

async function post(url: string, files: Buffer[]) {
  const { body, contentType } = createMultipartPayload(
    files.map((content, i) => ({
      name: "file",
      filename: `f${i}.png`,
      contentType: "image/png",
      content,
    })),
  );
  return testApp.app.inject({
    method: "POST",
    url,
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    payload: body,
  });
}

describe("tool routes answer 413 for an over-limit upload", () => {
  it.each([
    ["factory route", "/api/v1/tools/image/compress"],
    ["custom route", "/api/v1/tools/image/info"],
    // Used a different error string, so a string-matching guard missed it.
    ["custom route", "/api/v1/tools/image/gif-tools/info"],
  ])("%s %s", async (_kind, url) => {
    const res = await post(url, [OVER_LIMIT]);

    expect(res.statusCode).toBe(413);
    expect(JSON.parse(res.body)).toEqual({ error: "File exceeds the 10 MB upload limit" });
  });

  it("answers 413 when a later file in a multi-file upload is the one over the limit", async () => {
    const res = await post("/api/v1/tools/image/stitch", [SMALL, OVER_LIMIT]);

    expect(res.statusCode).toBe(413);
    expect(JSON.parse(res.body)).toEqual({ error: "File exceeds the 10 MB upload limit" });
  });
});
