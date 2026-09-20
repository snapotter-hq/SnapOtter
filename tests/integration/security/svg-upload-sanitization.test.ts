/**
 * SVG uploads must be sanitized whether or not Sharp can parse them.
 *
 * Both the standalone upload (/api/v1/upload) and the library upload
 * (/api/v1/files/upload) accept every file type, so a file Sharp rejects is
 * stored anyway. The sanitizer used to run only after a successful image
 * validation, which meant any SVG that made Sharp fail (a DOCTYPE with an
 * external entity, say) was persisted with its payload intact and served back
 * as image/svg+xml. Two sibling gaps ride along: the sanitizer skipped
 * namespace-prefixed element names, and SVG detection missed files whose
 * first construct is a DOCTYPE or a comment.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { validateImageBuffer } from "../../../apps/api/src/lib/file-validation.js";
import { fixtures, readFixture } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

let testApp: TestApp;
let adminToken: string;

const PAYLOADS = [
  {
    label: "a DOCTYPE with an external entity, which Sharp rejects",
    filename: "xxe.svg",
    content: readFixture(fixtures.security.svgXxeFile),
    mustNotMatch: [/<!DOCTYPE/i, /<!ENTITY/i],
  },
  {
    label: "an XHTML-namespaced script element, which Sharp accepts",
    filename: "namespace.svg",
    content: readFixture(fixtures.security.svgXssNamespace),
    mustNotMatch: [/<x:script/i, /alert\(/],
  },
  {
    label: "a DOCTYPE before the root element, which detection used to miss",
    filename: "doctype-first.svg",
    content: readFixture(fixtures.security.svgDoctypeFirst),
    mustNotMatch: [/<script/i, /alert\(/],
  },
];

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

function upload(url: string, filename: string, content: Buffer) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename, contentType: "image/svg+xml", content },
  ]);
  return testApp.app.inject({
    method: "POST",
    url,
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    payload: body,
  });
}

function expectSanitized(stored: string, patterns: RegExp[]): void {
  // Still an SVG document, not an emptied file.
  expect(stored).toContain("<svg");
  for (const pattern of patterns) expect(stored).not.toMatch(pattern);
}

describe("standalone upload sanitizes SVG regardless of image validation", () => {
  for (const payload of PAYLOADS) {
    it(`strips ${payload.label}`, async () => {
      const uploadRes = await upload("/api/v1/upload", payload.filename, payload.content);
      expect(uploadRes.statusCode).toBe(200);
      const { jobId, files } = JSON.parse(uploadRes.body);

      // /api/v1/download serves staged uploads without auth, so this is
      // exactly what any holder of the job id receives.
      const res = await testApp.app.inject({
        method: "GET",
        url: `/api/v1/download/${jobId}/${files[0].name}`,
      });
      expect(res.statusCode).toBe(200);
      expectSanitized(res.body, payload.mustNotMatch);
    });
  }
});

describe("library upload sanitizes SVG regardless of image validation", () => {
  for (const payload of PAYLOADS) {
    it(`strips ${payload.label}`, async () => {
      const uploadRes = await upload("/api/v1/files/upload", payload.filename, payload.content);
      expect(uploadRes.statusCode).toBe(201);
      const fileId = JSON.parse(uploadRes.body).files[0].id;

      const res = await testApp.app.inject({
        method: "GET",
        url: `/api/v1/files/${fileId}/download`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      expectSanitized(res.body, payload.mustNotMatch);
    });
  }
});

// The gate-removal fix only has teeth if the XXE payload is genuinely one the
// image decoder rejects. Pin that premise so a future libvips/librsvg that
// tolerates the undefined entity can't quietly turn the case above from "gate
// removed" into "sanitizer happened to run anyway" while still passing.
describe("the XXE payload exercises the removed isValidImage gate", () => {
  it("is rejected by the image validator, so the old gate would have skipped sanitizing", async () => {
    const validation = await validateImageBuffer(
      readFixture(fixtures.security.svgXxeFile),
      "xxe.svg",
    );
    expect(validation.valid).toBe(false);
  });
});

// A too-complex SVG makes sanitizeSvg throw. The route must reject it with a
// 400 that names the reason and must not persist it, rather than swallowing the
// error or storing the file. 5001 <rect/> elements clear the 5000 cap while
// staying well under any byte limit.
const OVER_CAP_SVG = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg">${"<rect/>".repeat(5001)}</svg>`,
);

describe("an SVG over the element cap is rejected, not stored", () => {
  for (const url of ["/api/v1/upload", "/api/v1/files/upload"]) {
    it(`returns 400 with the limit reason from ${url}`, async () => {
      const res = await upload(url, "too-complex.svg", OVER_CAP_SVG);
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toMatch(/element count/i);
      expect(body).not.toHaveProperty("jobId");
      expect(body).not.toHaveProperty("files");
    });
  }
});
