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
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fixtures, readFixture } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

const PNG = readFixture(fixtures.image.base.png200);
const PDF = readFixture(fixtures.document.pdf2);
const RESIZE = apiToolPath("resize");
const CREATE_ZIP = apiToolPath("create-zip");
const SIGN_PDF = apiToolPath("sign-pdf");

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

async function post(parts: Parameters<typeof createMultipartPayload>[0], url = RESIZE) {
  const { body, contentType } = createMultipartPayload(parts);
  return app.inject({
    method: "POST",
    url,
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

const file = { name: "file", filename: "image.png", contentType: "image/png", content: PNG };
const pdfFile = {
  name: "file",
  filename: "document.pdf",
  contentType: "application/pdf",
  content: PDF,
};
const sigFile = { name: "sig0", filename: "sig0.png", contentType: "image/png", content: PNG };
const corrupt = { ...file, content: Buffer.from("not a png at all") };

// The discard runs in the handler's finally, after the response is already
// on its way, so the checks below poll or wait past it instead of reading
// the workspace the moment inject resolves.
describe("tool-factory discards the upload of a rejected request", () => {
  it.each([
    ["an invalid saveMode", [file, { name: "saveMode", content: "bogus" }]],
    ["an invalid clientJobId", [file, { name: "clientJobId", content: "has space" }]],
    ["settings that aren't JSON", [file, { name: "settings", content: "{not json" }]],
    ["too many files", [file, { ...file, filename: "second.png" }]],
    ["a file the input handler rejects", [corrupt]],
  ] as const)("leaves no uploads dir behind for %s", async (_label, parts) => {
    const before = uploadDirs();

    const res = await post([...parts]);

    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
    await vi.waitFor(
      () => expect([...uploadDirs()].filter((dir) => !before.has(dir))).toEqual([]),
      { timeout: 5_000 },
    );
  });

  it("leaves no uploads dir behind when a multi-file upload fails on the second file part (#1644)", async () => {
    const before = uploadDirs();
    const { body, contentType } = createMultipartPayload([
      file,
      { ...file, filename: "second.png" },
    ]);
    // Truncate inside the second file part (before the closing boundary) so
    // the first part finishes streaming to uploads/<jobId>/ and the second part
    // fails inside receiveUpload.
    const truncated = body.subarray(0, body.length - 12);

    const res = await app.inject({
      method: "POST",
      url: CREATE_ZIP,
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body: truncated,
    });

    expect(res.statusCode).toBe(400);
    expect([...uploadDirs()].filter((dir) => !before.has(dir))).toEqual([]);
  });

  it("keeps the upload of a request it accepts", async () => {
    const res = await post([file, { name: "settings", content: JSON.stringify({ width: 50 }) }]);

    expect([200, 202]).toContain(res.statusCode);
    const { jobId } = JSON.parse(res.body) as { jobId: string };
    // Give the finally time to run: a misplaced enqueued flag would delete
    // the upload a moment after the response, not before it.
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(uploadDirs().has(jobId)).toBe(true);
  });
});

describe("custom tool route (sign-pdf) discards the upload of a rejected request (#2599)", () => {
  it.each([
    ["an invalid saveMode", [pdfFile, sigFile, { name: "saveMode", content: "bogus" }]],
    ["an invalid clientJobId", [pdfFile, sigFile, { name: "clientJobId", content: "has space" }]],
    ["missing placements", [pdfFile, sigFile]],
    ["placements that aren't JSON", [pdfFile, sigFile, { name: "placements", content: "{bad" }]],
    [
      "a placement referencing a missing signature",
      [
        pdfFile,
        sigFile,
        {
          name: "placements",
          content: JSON.stringify([{ sig: 1, page: 0, x: 0.1, y: 0.1, w: 0.2, h: 0.1 }]),
        },
      ],
    ],
    [
      "a corrupt PDF file",
      [
        { ...pdfFile, content: Buffer.from("not a pdf") },
        sigFile,
        {
          name: "placements",
          content: JSON.stringify([{ sig: 0, page: 0, x: 0.1, y: 0.1, w: 0.2, h: 0.1 }]),
        },
      ],
    ],
    [
      "a corrupt signature image",
      [
        pdfFile,
        { ...sigFile, content: Buffer.from("not a png") },
        {
          name: "placements",
          content: JSON.stringify([{ sig: 0, page: 0, x: 0.1, y: 0.1, w: 0.2, h: 0.1 }]),
        },
      ],
    ],
  ] as const)("leaves no uploads dir behind for %s", async (_label, parts) => {
    const before = uploadDirs();

    const res = await post([...parts], SIGN_PDF);

    expect(res.statusCode).toBe(400);
    await vi.waitFor(
      () => expect([...uploadDirs()].filter((dir) => !before.has(dir))).toEqual([]),
      { timeout: 5_000 },
    );
  });

  it("leaves no uploads dir behind when the signature file part fails mid-upload (#1644)", async () => {
    const before = uploadDirs();
    const { body, contentType } = createMultipartPayload([pdfFile, sigFile]);
    const truncated = body.subarray(0, body.length - 12);

    const res = await app.inject({
      method: "POST",
      url: SIGN_PDF,
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body: truncated,
    });

    expect(res.statusCode).toBe(400);
    expect([...uploadDirs()].filter((dir) => !before.has(dir))).toEqual([]);
  });
});
