/**
 * Per-route coverage for the clientJobId multipart field (#1329). The value
 * becomes a jobs.id primary key, and a NUL byte in it made Postgres reject the
 * insert, which surfaced as a 500. These are the routes that used to accept any
 * 1-128 character string.
 *
 * Every other route that takes the field used to drop a value it didn't like
 * and carry on under a generated id, so the caller watched an SSE channel
 * nothing would ever write to. They now share the same rule and the same 400
 * (#1691).
 *
 * The parse-and-400 gate runs before file validation, so a lone clientJobId
 * field pins each route's field capture and error contract.
 */

import { apiToolPath } from "@snapotter/shared";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  INVALID_CLIENT_JOB_ID_ERROR,
  parseClientJobIdField,
} from "../../../apps/api/src/jobs/types.js";
import { fixtures, readFixture } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

const CLIENT_JOB_ID_ROUTES = [
  { name: "tool-factory (resize)", url: apiToolPath("resize") },
  { name: "tool batch", url: `${apiToolPath("resize")}/batch` },
  { name: "pipeline execute", url: "/api/v1/pipeline/execute" },
  { name: "pipeline batch", url: "/api/v1/pipeline/batch" },
  { name: "passport-photo analyze", url: `${apiToolPath("passport-photo")}/analyze` },
  { name: "svg-to-raster batch", url: `${apiToolPath("svg-to-raster")}/batch` },
];

// Routes that used to drop a clientJobId they didn't like (a UUID-only check
// on the AI routes and sign-pdf, a looser regex on pdf-to-image batch).
const FORMERLY_SILENT_ROUTES = [
  "ai-canvas-expand",
  "auto-subtitles",
  "background-replace",
  "blur-background",
  "blur-faces",
  "colorize",
  "enhance-faces",
  "erase-object",
  "noise-removal",
  "ocr",
  "ocr-pdf",
  "red-eye-removal",
  "remove-background",
  "remove-gif-background",
  "restore-photo",
  "sign-pdf",
  "transcribe-audio",
  "transparency-fixer",
  "upscale",
]
  .map((toolId) => ({ name: toolId, url: apiToolPath(toolId) }))
  .concat([{ name: "pdf-to-image batch", url: `${apiToolPath("pdf-to-image")}/batch` }]);

// Force the bundle gates open so passport-photo (face-detection +
// background-removal) reaches its multipart parse without AI bundles.
vi.mock("../../../apps/api/src/lib/feature-status.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/feature-status.js")>();
  return {
    ...actual,
    isToolInstalled: () => true,
    getFirstMissingBundleForTool: () => null,
  };
});

const PNG = readFixture(fixtures.image.base.png200);

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

async function postClientJobId(url: string, clientJobId: string) {
  const { body, contentType } = createMultipartPayload([
    { name: "clientJobId", content: clientJobId },
  ]);
  return app.inject({
    method: "POST",
    url,
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe("clientJobId 400 gate", () => {
  for (const route of CLIENT_JOB_ID_ROUTES) {
    it(`${route.name} rejects a NUL byte with 400, not a 500`, async () => {
      // The value the nightly Schemathesis run sent.
      const res = await postClientJobId(route.url, "\u0000çãú");

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toBe(INVALID_CLIENT_JOB_ID_ERROR);
    });

    it(`${route.name} accepts a UUID clientJobId and moves on to the file check`, async () => {
      const res = await postClientJobId(route.url, "3f2b8c1e-9d4a-4e6b-8f0c-1a2b3c4d5e6f");

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toMatch(/^No (image |SVG )?files? provided$/);
    });
  }

  it("answers 400 for the nightly Schemathesis repro (a real file plus a NUL clientJobId)", async () => {
    // With a file attached, tool-factory used to write the NUL into jobs.id,
    // Postgres rejected the insert, and the error handler answered 500.
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "image.png", contentType: "image/png", content: PNG },
      { name: "clientJobId", content: "\u0000çãú" },
    ]);
    const res = await app.inject({
      method: "POST",
      url: apiToolPath("resize"),
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe(INVALID_CLIENT_JOB_ID_ERROR);
  });
});

describe("clientJobId 400 gate on the routes that used to drop it (#1691)", () => {
  for (const route of FORMERLY_SILENT_ROUTES) {
    it(`${route.name} rejects a malformed clientJobId with 400 instead of ignoring it`, async () => {
      const res = await postClientJobId(route.url, "my job");

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toBe(INVALID_CLIENT_JOB_ID_ERROR);
    });

    it(`${route.name} rejects a NUL byte with 400`, async () => {
      const res = await postClientJobId(route.url, "\u0000çãú");

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toBe(INVALID_CLIENT_JOB_ID_ERROR);
    });

    // A non-UUID id the shared rule allows gets past the gate like any other,
    // and the request stops at the missing file instead.
    it(`${route.name} accepts a non-UUID clientJobId and moves on to the file check`, async () => {
      const res = await postClientJobId(route.url, "job_42");

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).not.toBe(INVALID_CLIENT_JOB_ID_ERROR);
    });
  }
});

describe("parseClientJobIdField", () => {
  it("returns undefined when the field was absent", () => {
    expect(parseClientJobIdField(null)).toBeUndefined();
  });

  it.each([
    "3f2b8c1e-9d4a-4e6b-8f0c-1a2b3c4d5e6f",
    "job_42",
    "client.job-7",
    "007a",
    "a".repeat(128),
  ])("accepts %j", (value) => {
    expect(parseClientJobIdField(value)).toBe(value);
  });

  it.each([
    "",
    "\u0000abc",
    "abc\u0000",
    "line\nbreak",
    "tab\tchar",
    "has space",
    "../etc/passwd",
    "çãú",
    "a".repeat(129),
    // BullMQ rejects integer and ':' custom ids; object keys need an
    // alphanumeric first character and no '..'. The batch routes use both.
    "12345",
    "client.job:7",
    "_run",
    "-run",
    ".run",
    "a..b",
  ])("rejects %j", (value) => {
    expect(parseClientJobIdField(value)).toBeNull();
  });
});
