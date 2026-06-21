/**
 * Integration tests for multi-file upload support via the factory's
 * maxInputs config. Registers a test tool with maxInputs: 3 that
 * concatenates all inputs; verifies the HTTP multipart path through
 * the factory (route registration, file collection, per-file prepare,
 * inputRefs on the durable row, and the too-many-files rejection).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { apiToolPath, TOOLS } from "@snapotter/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { createToolRoute } from "../../../apps/api/src/routes/tool-factory.js";
import { fixtures, readFixture } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  preReadyHooks,
  type TestApp,
} from "../test-server.js";

const PNG = readFixture(fixtures.image.edge.px1);
const PNG_A = readFixture(fixtures.image.edge.px1);
const PNG_B = readFixture(fixtures.image.base.png200);
const PNG_C = readFixture(fixtures.image.edge.blank);

// Minimal schema stand-in that satisfies the factory's safeParse call
// without pulling in a zod dependency at the test root.
const emptySchema = {
  safeParse: (v: unknown) => ({ success: true as const, data: v }),
  parse: (v: unknown) => v,
} as never;

// Register the test tool via a pre-ready hook so createToolRoute can
// call app.post() before Fastify is ready (Fastify forbids late routes).
preReadyHooks.push((app) => {
  createToolRoute(app, {
    toolId: "multi-concat",
    maxInputs: 3,
    settingsSchema: emptySchema,
    process: async () => {
      throw new Error("legacy path must not run");
    },
    processV2: async (ctx) => ({
      buffer: Buffer.concat(ctx.inputs.map((i) => i.buffer)),
      filename: "combined.bin",
      contentType: "application/octet-stream",
    }),
  });
  // Image-modality multi-input tool: used to verify per-file validation errors
  // are prefixed with the filename. (multi-concat is "file" modality, which
  // passes content through without validating, so it cannot exercise this path.)
  createToolRoute(app, {
    toolId: "multi-validate",
    maxInputs: 2,
    settingsSchema: emptySchema,
    process: async () => {
      throw new Error("legacy path must not run");
    },
    processV2: async (ctx) => ({
      buffer: ctx.inputs[0].buffer,
      filename: "out.png",
      contentType: "image/png",
    }),
  });
});

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  // multi-concat isn't a real catalog tool. resolveToolPool() routes unknown
  // tool IDs to the "system" pool (whose worker only runs system jobs), and the
  // factory would default it to image modality (which re-encodes inputs). Register
  // it as a "file" tool so it routes to the docs pool with raw passthrough, like a
  // real multi-input file tool. Removed again in afterAll.
  TOOLS.push(
    {
      id: "multi-concat",
      name: "Multi Concat (test)",
      description: "Test-only tool that concatenates inputs",
      category: "archives",
      icon: "FolderArchive",
      route: "/multi-concat",
      modality: "file",
      acceptedInputs: [],
      executionHint: "fast",
    } as (typeof TOOLS)[number],
    {
      id: "multi-validate",
      name: "Multi Validate (test)",
      description: "Test-only image multi-input tool",
      category: "archives",
      icon: "Image",
      route: "/multi-validate",
      modality: "image",
      acceptedInputs: [],
      executionHint: "fast",
    } as (typeof TOOLS)[number],
  );
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  for (const id of ["multi-concat", "multi-validate"]) {
    const idx = TOOLS.findIndex((t) => t.id === id);
    if (idx !== -1) TOOLS.splice(idx, 1);
  }
  await testApp.cleanup();
}, 10_000);

describe("Factory multi-input (maxInputs)", () => {
  it("accepts 3 files for a maxInputs:3 tool, concatenates, and records 3 inputRefs", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG_A },
      { name: "file", filename: "b.png", contentType: "image/png", content: PNG_B },
      { name: "file", filename: "c.png", contentType: "image/png", content: PNG_C },
      { name: "settings", content: "{}" },
    ]);

    const res = await testApp.app.inject({
      method: "POST",
      url: apiToolPath("multi-concat"),
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
    expect(result.jobId).toBeDefined();

    // Download and verify the output is the concatenation of three PNGs
    const dl = await testApp.app.inject({
      method: "GET",
      url: result.downloadUrl,
    });
    expect(dl.statusCode).toBe(200);

    const expected = Buffer.concat([PNG_A, PNG_B, PNG_C]);
    expect(dl.rawPayload.length).toBe(expected.length);
    expect(dl.rawPayload.equals(expected)).toBe(true);

    // Verify the durable DB row has 3 inputRefs
    const [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, result.jobId));
    expect(row).toBeDefined();
    expect(row?.status).toBe("completed");
    expect(row?.inputRefs).toBeDefined();
    expect((row?.inputRefs as string[]).length).toBe(3);
  }, 30_000);

  it("rejects 2 files on a tool without maxInputs (default 1)", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ width: 100 }) },
    ]);

    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/image/resize",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/too many files/i);
  });

  it("rejects 4 files on a maxInputs:3 tool with the correct limit message", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "b.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "c.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "d.png", contentType: "image/png", content: PNG },
      { name: "settings", content: "{}" },
    ]);

    const res = await testApp.app.inject({
      method: "POST",
      url: apiToolPath("multi-concat"),
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
    const result = JSON.parse(res.body);
    expect(result.error).toBe("Too many files (max 3)");
  });

  it("prefixes validation error with filename for multi-input tools", async () => {
    const garbage = Buffer.from(Array.from({ length: 64 }, () => Math.floor(Math.random() * 256)));

    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "good.png", contentType: "image/png", content: PNG },
      { name: "file", filename: "bad.png", contentType: "image/png", content: garbage },
      { name: "settings", content: "{}" },
    ]);

    const res = await testApp.app.inject({
      method: "POST",
      url: apiToolPath("multi-validate"),
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
    const result = JSON.parse(res.body);
    expect(result.error).toMatch(/^bad\.png:/);
  });
});
