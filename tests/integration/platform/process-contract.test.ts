/**
 * Integration tests for the ref-based v2 process contract.
 *
 * Registers a native-v2 tool that receives TWO input refs and writes
 * a scratch-dir output (concatenation of both inputs). Verifies the
 * worker loads all refs, invokes processV2 (not the legacy path), and
 * resolves scratchPath outputs correctly.
 */
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { enqueueToolJob, waitForJob } from "../../../apps/api/src/jobs/enqueue.js";
import type { ToolJobData } from "../../../apps/api/src/jobs/types.js";
import { getObjectBuffer, putObject } from "../../../apps/api/src/lib/object-storage.js";
import { registerToolProcessFn } from "../../../apps/api/src/routes/tool-factory.js";
import { buildTestApp, type TestApp } from "../test-server.js";

// Register a native-v2 test tool that concatenates two inputs via scratchPath
registerToolProcessFn({
  toolId: "contract-v2",
  settingsSchema: { parse: (v: unknown) => v } as never,
  process: async () => {
    throw new Error("legacy path must not run");
  },
  processV2: async (ctx) => {
    if (ctx.inputs.length !== 2) throw new Error(`expected 2 inputs, got ${ctx.inputs.length}`);
    const outPath = join(ctx.scratchDir, "combined.txt");
    await writeFile(outPath, Buffer.concat(ctx.inputs.map((i) => i.buffer)));
    return { scratchPath: outPath, filename: "combined.txt", contentType: "text/plain" };
  },
});

// Register a legacy-only test tool (no processV2) to verify the adapter
registerToolProcessFn({
  toolId: "contract-legacy-echo",
  settingsSchema: { parse: (v: unknown) => v } as never,
  process: async (inputBuffer: Buffer, _settings: unknown, filename: string) => {
    return { buffer: inputBuffer, filename, contentType: "application/octet-stream" };
  },
});

let testApp: TestApp;

beforeAll(async () => {
  testApp = await buildTestApp();
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

describe("V2 process contract", () => {
  it("loads all inputRefs and invokes processV2 with scratchPath output", async () => {
    const jobId = randomUUID();
    const bufA = Buffer.from("AAAA");
    const bufB = Buffer.from("BBBB");

    // Store two inputs in object storage
    const refA = `uploads/${jobId}/input-a.txt`;
    const refB = `uploads/${jobId}/input-b.txt`;
    await putObject(refA, bufA);
    await putObject(refB, bufB);

    const data: ToolJobData = {
      jobId,
      toolId: "contract-v2",
      userId: null,
      pool: "image",
      inputRefs: [refA, refB],
      filename: "input-a.txt",
      settings: {},
      kind: "tool",
    };

    await enqueueToolJob(data);

    const result = await waitForJob("image", jobId, 10_000);
    expect(result).not.toBeNull();
    expect(result!.filename).toBe("combined.txt");
    expect(result!.outputRefs.length).toBeGreaterThan(0);

    // Verify the output is the concatenation of both inputs
    const outputBuffer = await getObjectBuffer(result!.outputRefs[0]);
    expect(outputBuffer.toString()).toBe("AAAABBBB");

    // Verify sizes: original is the primary input, processed is the concatenated output
    expect(result!.originalSize).toBe(4); // bufA.length
    expect(result!.processedSize).toBe(8); // bufA.length + bufB.length

    // Verify the durable DB row
    const [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
    expect(row).toBeDefined();
    expect(row!.status).toBe("completed");
    expect(row!.bytesIn).toBe(4);
    expect(row!.bytesOut).toBe(8);
    expect(row!.outputRefs).toBeDefined();
    expect((row!.outputRefs as string[]).length).toBeGreaterThan(0);
  });

  it("passes input refs and filenames correctly to processV2", async () => {
    const jobId = randomUUID();
    const bufA = Buffer.from("first");
    const bufB = Buffer.from("second");

    const refA = `uploads/${jobId}/primary.bin`;
    const refB = `uploads/${jobId}/secondary.bin`;
    await putObject(refA, bufA);
    await putObject(refB, bufB);

    // Register a tool that returns metadata about what it received
    registerToolProcessFn({
      toolId: "contract-v2-meta",
      settingsSchema: { parse: (v: unknown) => v } as never,
      process: async () => {
        throw new Error("legacy path must not run");
      },
      processV2: async (ctx) => {
        const meta = {
          count: ctx.inputs.length,
          refs: ctx.inputs.map((i) => i.ref),
          filenames: ctx.inputs.map((i) => i.filename),
          sizes: ctx.inputs.map((i) => i.buffer.length),
        };
        return {
          buffer: Buffer.from(JSON.stringify(meta)),
          filename: "meta.json",
          contentType: "application/json",
          resultPayload: meta,
        };
      },
    });

    const data: ToolJobData = {
      jobId,
      toolId: "contract-v2-meta",
      userId: null,
      pool: "image",
      inputRefs: [refA, refB],
      filename: "my-file.bin",
      settings: {},
      kind: "tool",
    };

    await enqueueToolJob(data);

    const result = await waitForJob("image", jobId, 10_000);
    expect(result).not.toBeNull();

    // Primary filename is data.filename, secondary derives from the ref basename
    expect(result!.resultPayload).toBeDefined();
    const meta = result!.resultPayload as {
      count: number;
      refs: string[];
      filenames: string[];
      sizes: number[];
    };
    expect(meta.count).toBe(2);
    expect(meta.refs).toEqual([refA, refB]);
    expect(meta.filenames[0]).toBe("my-file.bin"); // primary keeps client name
    expect(meta.filenames[1]).toBe("secondary.bin"); // derived from ref basename
    expect(meta.sizes).toEqual([5, 6]);
  });

  it("legacy adapter routes single-input tools through processV2", async () => {
    const jobId = randomUUID();
    const buf = Buffer.from("echo-me");

    const ref = `uploads/${jobId}/test.bin`;
    await putObject(ref, buf);

    // contract-legacy-echo was registered with only a legacy process
    // function. registerToolProcessFn should have wrapped it via
    // adaptLegacyProcess so the worker calls processV2 internally.
    const data: ToolJobData = {
      jobId,
      toolId: "contract-legacy-echo",
      userId: null,
      pool: "image",
      inputRefs: [ref],
      filename: "test.bin",
      settings: {},
      kind: "tool",
    };

    await enqueueToolJob(data);

    const result = await waitForJob("image", jobId, 10_000);
    expect(result).not.toBeNull();
    const outputBuffer = await getObjectBuffer(result!.outputRefs[0]);
    expect(outputBuffer.toString()).toBe("echo-me");
  });
});
