/**
 * A tool request the factory rejects after its upload has streamed must not
 * leave the upload behind (#1690). On local storage the TTL sweeper would
 * reach it eventually, but on S3 a prefix with no jobs row is skipped
 * forever, so the route deletes uploads/<jobId>/ itself unless the job was
 * enqueued.
 */

import { readdirSync } from "node:fs";
import path from "node:path";
import { apiToolPath } from "@snapotter/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

const PNG = readFixture(fixtures.image.base.png200);
const RESIZE = apiToolPath("resize");

let testApp: TestApp;
let app: TestApp["app"];
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

function uploadDirs(): Set<string> {
  const root = path.join(process.env.WORKSPACE_PATH as string, "uploads");
  try {
    return new Set(readdirSync(root));
  } catch {
    return new Set();
  }
}

async function post(parts: Parameters<typeof createMultipartPayload>[0]) {
  const { body, contentType } = createMultipartPayload(parts);
  return app.inject({
    method: "POST",
    url: RESIZE,
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

const file = { name: "file", filename: "image.png", contentType: "image/png", content: PNG };

describe("tool-factory discards the upload of a rejected request", () => {
  it.each([
    ["an invalid saveMode", [file, { name: "saveMode", content: "bogus" }]],
    ["an invalid clientJobId", [file, { name: "clientJobId", content: "has space" }]],
    ["settings that aren't JSON", [file, { name: "settings", content: "{not json" }]],
    ["too many files", [file, { ...file, filename: "second.png" }]],
  ] as const)("leaves no uploads dir behind for %s", async (_label, parts) => {
    const before = uploadDirs();

    const res = await post([...parts]);

    expect(res.statusCode).toBe(400);
    const leftover = [...uploadDirs()].filter((dir) => !before.has(dir));
    expect(leftover).toEqual([]);
  });

  it("keeps the upload of a request it accepts", async () => {
    const before = uploadDirs();

    const res = await post([file, { name: "settings", content: JSON.stringify({ width: 50 }) }]);

    expect([200, 202]).toContain(res.statusCode);
    const { jobId } = JSON.parse(res.body) as { jobId: string };
    expect(before.has(jobId)).toBe(false);
    expect(uploadDirs().has(jobId)).toBe(true);
  });
});
