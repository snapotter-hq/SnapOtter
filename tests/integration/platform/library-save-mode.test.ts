/**
 * Integration tests for the library saveMode choice (issue #495).
 *
 * When a tool run references a library file (multipart fileId), the worker
 * auto-saves the result. The saveMode field controls how:
 *   - "new" (default): insert an independent root file; the original stays
 *     visible in the library list.
 *   - "overwrite": insert a new version linked to the original, which then
 *     supersedes it in the leaf-only listing (pre-#495 behavior).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sharedRedis } from "../../../apps/api/src/jobs/connection.js";
import { bullPrefix } from "../../../apps/api/src/jobs/types.js";
import { fixtures, readFixture } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

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

/** Upload a PNG into the library, return its file id. */
async function uploadLibraryFile(filename: string): Promise<string> {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename, contentType: "image/png", content: PNG },
  ]);
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/files/upload",
    headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
    body,
  });
  expect(res.statusCode).toBe(201);
  return JSON.parse(res.body).files[0].id;
}

interface ToolRunResult {
  statusCode: number;
  savedFileId?: string;
  error?: string;
}

/**
 * Run the resize tool with optional fileId/saveMode fields. Tolerates the
 * 202 async fallback by polling the terminal SSE replay key in Redis.
 */
async function runResize(opts: {
  filename: string;
  fileId?: string;
  saveMode?: string;
  toolPath?: string;
  settings?: Record<string, unknown>;
}): Promise<ToolRunResult> {
  const parts: Parameters<typeof createMultipartPayload>[0] = [
    {
      name: "file",
      filename: opts.filename,
      contentType: "image/png",
      content: PNG,
    },
    { name: "settings", content: JSON.stringify(opts.settings ?? { width: 100 }) },
  ];
  if (opts.fileId) parts.push({ name: "fileId", content: opts.fileId });
  if (opts.saveMode !== undefined) parts.push({ name: "saveMode", content: opts.saveMode });

  const { body, contentType } = createMultipartPayload(parts);
  const res = await app.inject({
    method: "POST",
    url: opts.toolPath ?? "/api/v1/tools/image/resize",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });

  if (res.statusCode === 200) {
    const parsed = JSON.parse(res.body);
    return { statusCode: 200, savedFileId: parsed.savedFileId };
  }
  if (res.statusCode === 202) {
    // Async fallback: wait for the terminal SSE replay frame in Redis
    const jobId = JSON.parse(res.body).jobId;
    const key = `${bullPrefix()}:terminal:${jobId}`;
    for (let i = 0; i < 150; i++) {
      const cached = await sharedRedis().get(key);
      if (cached) {
        const frame = JSON.parse(cached);
        expect(frame.phase).toBe("complete");
        return { statusCode: 200, savedFileId: frame.result?.savedFileId };
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error("Timed out waiting for async job result");
  }
  let error: string | undefined;
  try {
    error = JSON.parse(res.body).error;
  } catch {
    // Non-JSON error body
  }
  return { statusCode: res.statusCode, error };
}

/** Fetch file detail (metadata + version chain). */
async function getFileDetail(id: string) {
  const res = await app.inject({
    method: "GET",
    url: `/api/v1/files/${id}`,
    headers: { authorization: `Bearer ${adminToken}` },
  });
  expect(res.statusCode).toBe(200);
  return JSON.parse(res.body);
}

/** List library files matching a search term, return their ids. */
async function listFileIds(search: string): Promise<string[]> {
  const res = await app.inject({
    method: "GET",
    url: `/api/v1/files?search=${encodeURIComponent(search)}`,
    headers: { authorization: `Bearer ${adminToken}` },
  });
  expect(res.statusCode).toBe(200);
  return JSON.parse(res.body).files.map((f: { id: string }) => f.id);
}

describe("Library saveMode: default (save as new file)", () => {
  it("saves the result as an independent file and keeps the original listed", async () => {
    const originalId = await uploadLibraryFile("lsmdef.png");

    const run = await runResize({ filename: "lsmdef.png", fileId: originalId });
    expect(run.statusCode).toBe(200);
    expect(run.savedFileId).toBeDefined();
    expect(run.savedFileId).not.toBe(originalId);

    const detail = await getFileDetail(run.savedFileId!);
    expect(detail.file.version).toBe(1);
    expect(detail.file.parentId).toBeNull();
    expect(detail.file.toolChain).toContain("resize");

    // Both the original and the new file remain visible in the library list
    const listed = await listFileIds("lsmdef");
    expect(listed).toContain(originalId);
    expect(listed).toContain(run.savedFileId!);
  });

  it("treats an explicit saveMode=new like the default", async () => {
    const originalId = await uploadLibraryFile("lsmexp.png");

    const run = await runResize({ filename: "lsmexp.png", fileId: originalId, saveMode: "new" });
    expect(run.statusCode).toBe(200);
    expect(run.savedFileId).toBeDefined();

    const detail = await getFileDetail(run.savedFileId!);
    expect(detail.file.version).toBe(1);
    expect(detail.file.parentId).toBeNull();

    const listed = await listFileIds("lsmexp");
    expect(listed).toContain(originalId);
    expect(listed).toContain(run.savedFileId!);
  });

  it("carries the parent's toolChain into the new file for provenance", async () => {
    const originalId = await uploadLibraryFile("lsmchain.png");

    // First edit overwrites the original (version chain)
    const first = await runResize({
      filename: "lsmchain.png",
      fileId: originalId,
      saveMode: "overwrite",
    });
    expect(first.statusCode).toBe(200);
    expect(first.savedFileId).toBeDefined();

    // Second edit saves as new from the version; chain accumulates
    const second = await runResize({
      filename: "lsmchain.png",
      fileId: first.savedFileId!,
      saveMode: "new",
      toolPath: "/api/v1/tools/image/compress",
      settings: { mode: "quality", quality: 90 },
    });
    expect(second.statusCode).toBe(200);
    expect(second.savedFileId).toBeDefined();

    const detail = await getFileDetail(second.savedFileId!);
    expect(detail.file.version).toBe(1);
    expect(detail.file.parentId).toBeNull();
    expect(detail.file.toolChain).toEqual(["resize", "compress"]);
  });
});

describe("Library saveMode: overwrite", () => {
  it("creates a new version that supersedes the original in the list", async () => {
    const originalId = await uploadLibraryFile("lsmover.png");

    const run = await runResize({
      filename: "lsmover.png",
      fileId: originalId,
      saveMode: "overwrite",
    });
    expect(run.statusCode).toBe(200);
    expect(run.savedFileId).toBeDefined();
    expect(run.savedFileId).not.toBe(originalId);

    const detail = await getFileDetail(run.savedFileId!);
    expect(detail.file.version).toBe(2);
    expect(detail.file.parentId).toBe(originalId);
    expect(detail.file.toolChain).toContain("resize");

    // The original is superseded: only the new version appears in the list
    const listed = await listFileIds("lsmover");
    expect(listed).toContain(run.savedFileId!);
    expect(listed).not.toContain(originalId);
  });
});

describe("Library saveMode: validation and guards", () => {
  it("rejects an invalid saveMode with 400", async () => {
    const originalId = await uploadLibraryFile("lsmbad.png");

    const run = await runResize({
      filename: "lsmbad.png",
      fileId: originalId,
      saveMode: "destroy-everything",
    });
    expect(run.statusCode).toBe(400);
    expect(run.error).toMatch(/saveMode/i);
  });

  it("does not save to the library when no fileId is sent", async () => {
    const run = await runResize({ filename: "lsmnone.png" });
    expect(run.statusCode).toBe(200);
    expect(run.savedFileId).toBeUndefined();

    const listed = await listFileIds("lsmnone");
    expect(listed).toHaveLength(0);
  });

  it("silently skips the save for an unknown fileId", async () => {
    const run = await runResize({
      filename: "lsmghost.png",
      fileId: "00000000-0000-0000-0000-000000000000",
    });
    expect(run.statusCode).toBe(200);
    expect(run.savedFileId).toBeUndefined();
  });
});
