/**
 * Integration tests for the optimize-svg tool (/api/v1/tools/image/optimize-svg).
 *
 * Covers SVG in and SVG out over HTTP, .svgz intake, before and after sizes,
 * script stripped from the download, and the up-front 400 for a raster upload
 * or an oversized SVG that the image handler would otherwise accept.
 */

import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MAX_OPTIMIZE_SVG_BYTES } from "../../../../apps/api/src/routes/tools/optimize-svg.js";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const PNG = readFixture(fixtures.image.base.png200);

const VERBOSE_SVG = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<!-- Generator: Some Editor 1.0 -->
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">
  <title>Badge</title>
  <metadata><rdf>editor data</rdf></metadata>
  <g><g><rect x="10.123456" y="10.987654" width="80.555555" height="80.444444" fill="#ff0000"/></g></g>
</svg>
`);

let testApp: TestApp;
let app: TestApp["app"];
let adminToken: string;

async function run(file: Buffer, filename: string, settings: Record<string, unknown> = {}) {
  const contentType = filename.endsWith(".png") ? "image/png" : "image/svg+xml";
  const { body, contentType: ct } = createMultipartPayload([
    { name: "file", filename, contentType, content: file },
    { name: "settings", content: JSON.stringify(settings) },
  ]);
  return app.inject({
    method: "POST",
    url: "/api/v1/tools/image/optimize-svg",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": ct },
    body,
  });
}

async function download(url: string): Promise<string> {
  const res = await app.inject({
    method: "GET",
    url,
    headers: { authorization: `Bearer ${adminToken}` },
  });
  expect(res.statusCode).toBe(200);
  return res.rawPayload.toString("utf-8");
}

beforeAll(async () => {
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);
});

afterAll(async () => {
  await testApp.cleanup();
});

describe("optimize-svg", () => {
  it("returns a smaller SVG that keeps its viewBox", async () => {
    const res = await run(VERBOSE_SVG, "badge.svg");
    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toMatch(/badge\.svg$/);
    expect(json.processedSize).toBeLessThan(json.originalSize);

    const svg = await download(json.downloadUrl);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('viewBox="0 0 200 100"');
    expect(svg).not.toContain("<metadata");
  });

  it("accepts .svgz and writes plain .svg", async () => {
    const res = await run(gzipSync(VERBOSE_SVG), "badge.svgz");
    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.downloadUrl).toMatch(/badge\.svg$/);
    expect(await download(json.downloadUrl)).toContain("<svg");
  });

  it("strips script from the download", async () => {
    const res = await run(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="alert(1)"><script>alert(2)</script><rect width="10" height="10"/></svg>',
      ),
      "evil.svg",
    );
    expect(res.statusCode).toBe(200);
    const svg = await download(JSON.parse(res.body).downloadUrl);
    expect(svg).not.toMatch(/script|onload|alert/i);
  });

  it("refuses a raster upload with 400 before queuing a job", async () => {
    const res = await run(PNG, "photo.png");
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe("IMAGE_UNDECODABLE");
  });

  it("refuses an SVG over the optimize size cap with 400 before queuing a job", async () => {
    const path = `<path d="M0 0${" L1 1".repeat(MAX_OPTIMIZE_SVG_BYTES / 5)}"/>`;
    const res = await run(
      Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1">${path}</svg>`),
      "big.svg",
    );
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe("SVG_TOO_LARGE");
  });

  it("rejects out-of-range settings", async () => {
    const res = await run(VERBOSE_SVG, "badge.svg", { precision: 12 });
    expect(res.statusCode).toBe(400);
  });
});
