import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pdfcpuAvailable, pdfcpuPageSizes } from "@snapotter/doc-engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";

import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

// The fixture is portrait A5 (419.53 x 595.28 pt).
const PDF = readFixture(fixtures.document.pdf3);

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
});

afterAll(async () => {
  await testApp.cleanup();
});

async function runTool(settings: Record<string, unknown>) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename: "label.pdf", contentType: "application/pdf", content: PDF },
    { name: "settings", content: JSON.stringify(settings) },
  ]);
  return testApp.app.inject({
    method: "POST",
    url: "/api/v1/tools/pdf/resize-pdf-pages",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

async function outputPageSizes(settings: Record<string, unknown>) {
  const res = await runTool(settings);
  expect(res.statusCode).toBe(200);
  const envelope = JSON.parse(res.body);
  expect(envelope.downloadUrl).toMatch(/label_resized\.pdf$/);
  const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
  expect(dl.statusCode).toBe(200);
  const dir = mkdtempSync(join(tmpdir(), "resize-pdf-pages-"));
  try {
    const out = join(dir, "out.pdf");
    writeFileSync(out, dl.rawPayload);
    return await pdfcpuPageSizes(out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe.skipIf(!pdfcpuAvailable())("resize-pdf-pages (requires pdfcpu)", () => {
  it("resizes every page to a 4x6 in label by default", async () => {
    expect(await outputPageSizes({})).toEqual([{ width: 288, height: 432 }]);
  }, 60_000);

  it("resizes to a custom size given in millimetres", async () => {
    const sizes = await outputPageSizes({
      pageSize: "custom",
      width: 100,
      height: 150,
      unit: "mm",
    });
    expect(sizes).toHaveLength(1);
    expect(sizes[0].width).toBeCloseTo(283.46, 1);
    expect(sizes[0].height).toBeCloseTo(425.2, 1);
  }, 60_000);

  it("forces the requested orientation unless keepOrientation is set", async () => {
    const custom = { pageSize: "custom", width: 6, height: 4, unit: "in" };
    expect(await outputPageSizes(custom)).toEqual([{ width: 432, height: 288 }]);
    // The fixture is portrait, so pdfcpu turns the landscape target to match it.
    expect(await outputPageSizes({ ...custom, keepOrientation: true })).toEqual([
      { width: 288, height: 432 },
    ]);
  }, 60_000);
});

describe("resize-pdf-pages validation (ungated)", () => {
  it("rejects an unknown page size with 400", async () => {
    const res = await runTool({ pageSize: "b5" });
    expect(res.statusCode).toBe(400);
  }, 30_000);

  it("rejects a custom side over 200 in with 400", async () => {
    const res = await runTool({ pageSize: "custom", width: 201, height: 6, unit: "in" });
    expect(res.statusCode).toBe(400);
  }, 30_000);

  it("rejects a custom side under 12.7 mm with 400", async () => {
    const res = await runTool({ pageSize: "custom", width: 100, height: 10, unit: "mm" });
    expect(res.statusCode).toBe(400);
  }, 30_000);

  it("ignores an out-of-range custom size when a preset is picked", async () => {
    const res = await runTool({ pageSize: "a4", width: 0, height: 99999, unit: "mm" });
    expect(res.statusCode).not.toBe(400);
  }, 30_000);
});
