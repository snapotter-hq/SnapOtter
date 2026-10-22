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
import { readdirSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({
  writtenKeys: [] as string[],
  reportError: vi.fn(),
}));

vi.mock("../../../apps/api/src/lib/error-report.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/lib/error-report.js")>();
  return {
    ...actual,
    reportError: (...args: Parameters<typeof actual.reportError>) => {
      hooks.reportError(...args);
      return actual.reportError(...args);
    },
  };
});

vi.mock("../../../apps/api/src/lib/object-storage.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/object-storage.js")>();
  return {
    ...actual,
    putObject: async (key: string, data: Buffer) => {
      await actual.putObject(key, data);
      hooks.writtenKeys.push(key);
    },
  };
});

import { env } from "../../../apps/api/src/config.js";
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
    label: "a DOCTYPE with an external entity inside a gzip compressed SVGZ",
    filename: "xxe.svgz",
    content: readFixture(fixtures.security.svgXxeFileZipped),
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
});

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

function uploadDirs(): Set<string> {
  const root = path.join(env.WORKSPACE_PATH, "uploads");
  try {
    return new Set(readdirSync(root));
  } catch {
    return new Set();
  }
}

describe("failed multi-file standalone upload cleans up earlier parts (#1210)", () => {
  const PNG = readFixture(fixtures.image.base.png200);
  const OVER_LIMIT = Buffer.alloc(11 * 1024 * 1024, 1);

  beforeEach(() => {
    hooks.writtenKeys.length = 0;
  });

  it("removes earlier uploaded parts when a later SVG exceeds the element cap", async () => {
    const before = uploadDirs();
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "first.png", contentType: "image/png", content: PNG },
      {
        name: "file",
        filename: "too-complex.svg",
        contentType: "image/svg+xml",
        content: OVER_CAP_SVG,
      },
    ]);

    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/upload",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      payload: body,
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/element count/i);
    expect(hooks.writtenKeys).toEqual([expect.stringMatching(/^uploads\/[^/]+\/first\.png$/)]);
    expect([...uploadDirs()].filter((dir) => !before.has(dir))).toEqual([]);
  });

  it("removes earlier uploaded parts when a later file exceeds the upload size limit", async () => {
    const before = uploadDirs();
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "first.png", contentType: "image/png", content: PNG },
      {
        name: "file",
        filename: "huge.bin",
        contentType: "application/octet-stream",
        content: OVER_LIMIT,
      },
    ]);

    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/upload",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      payload: body,
    });

    expect(res.statusCode).toBe(413);
    expect(hooks.writtenKeys).toEqual([expect.stringMatching(/^uploads\/[^/]+\/first\.png$/)]);
    expect([...uploadDirs()].filter((dir) => !before.has(dir))).toEqual([]);
  });

  it("rejects an .svgz that decompresses past the 50 MiB cap with 400, cleans up earlier parts, and skips Sentry (#2593)", async () => {
    const svgzBomb = gzipSync(
      Buffer.concat([
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">'),
        Buffer.alloc(51 * 1024 * 1024, 0x20),
        Buffer.from("</svg>"),
      ]),
    );
    hooks.reportError.mockClear();
    const before = uploadDirs();
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "first.png", contentType: "image/png", content: PNG },
      {
        name: "file",
        filename: "bomb.svgz",
        contentType: "image/svg+xml",
        content: svgzBomb,
      },
    ]);

    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/upload",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      payload: body,
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/52428800|larger than/i);
    expect(hooks.reportError).not.toHaveBeenCalled();
    expect(hooks.writtenKeys).toEqual([expect.stringMatching(/^uploads\/[^/]+\/first\.png$/)]);
    expect([...uploadDirs()].filter((dir) => !before.has(dir))).toEqual([]);
  });
});
