import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const s3 = vi.hoisted(() => ({
  configure: vi.fn(),
  deleteObject: vi.fn(),
  getSize: vi.fn(),
  getStream: vi.fn(),
  putStream: vi.fn(),
}));

vi.mock("../../../apps/api/src/config.js", () => ({
  env: {
    STORAGE_MODE: "s3",
    WORKSPACE_PATH: "/unused",
    S3_BUCKET: "test",
    S3_REGION: "us-east-1",
    S3_ENDPOINT: "",
    S3_ACCESS_KEY_ID: "test",
    S3_SECRET_ACCESS_KEY: "test",
    S3_FORCE_PATH_STYLE: true,
    S3_PREFIX: "",
  },
}));

vi.mock("@snapotter/enterprise", () => ({
  loadS3Storage: vi.fn(async () => ({
    configureS3: s3.configure,
    deleteGenericObject: s3.deleteObject,
    getGenericObjectSize: s3.getSize,
    getGenericObjectStream: s3.getStream,
    putGenericObjectStream: s3.putStream,
  })),
}));

import { copyObjectToFile, putObjectStream } from "../../../apps/api/src/lib/object-storage.js";

let scratchDir: string;

beforeEach(() => {
  vi.clearAllMocks();
  s3.deleteObject.mockResolvedValue(undefined);
  scratchDir = mkdtempSync(join(tmpdir(), "snapotter-object-stream-copy-"));
});

afterEach(() => {
  rmSync(scratchDir, { recursive: true, force: true });
});

describe("object-to-file streaming enforcement", () => {
  it("enforces the byte cap when the object stream is larger than its metadata", async () => {
    const destination = join(scratchDir, "oversized.pdf");
    s3.getSize.mockResolvedValueOnce(1);
    s3.getStream.mockResolvedValueOnce(
      Readable.from([Buffer.alloc(2, 0x41), Buffer.alloc(2, 0x42)]),
    );

    await expect(
      copyObjectToFile("uploads/job-1/scan.pdf", destination, { maxBytes: 3 }),
    ).rejects.toMatchObject({ statusCode: 413 });
    // Let a delayed write-stream open run. Cleanup must not be able to return
    // before an asynchronous open recreates the staging path.
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(s3.getStream).toHaveBeenCalledTimes(1);
    expect(existsSync(destination)).toBe(false);
    expect(readdirSync(scratchDir)).toEqual([]);
  });

  it("removes a partially-created S3 object when a streamed upload fails", async () => {
    s3.putStream.mockImplementationOnce(async (_key: string, source: AsyncIterable<Buffer>) => {
      for await (const _chunk of source) {
        throw new Error("multipart upload failed");
      }
    });

    await expect(
      putObjectStream("uploads/job-3/scan.pdf", Readable.from([Buffer.from("partial")]), {
        maxBytes: 10,
      }),
    ).rejects.toThrow("multipart upload failed");

    expect(s3.deleteObject).toHaveBeenCalledWith("uploads/job-3/scan.pdf");
  });

  it("cancels a stalled S3 upload and removes its partial object", async () => {
    let consumedFirstChunk!: () => void;
    const consumed = new Promise<void>((resolve) => {
      consumedFirstChunk = resolve;
    });
    s3.putStream.mockImplementationOnce(async (_key: string, source: AsyncIterable<Buffer>) => {
      for await (const _chunk of source) consumedFirstChunk();
    });
    const source = new PassThrough();
    const controller = new AbortController();
    const uploading = putObjectStream("uploads/job-4/scan.pdf", source, {
      maxBytes: 10,
      signal: controller.signal,
    });
    source.write(Buffer.from("partial"));
    await consumed;
    expect(s3.putStream).toHaveBeenCalledWith(
      "uploads/job-4/scan.pdf",
      expect.anything(),
      controller.signal,
    );
    controller.abort();

    await expect(uploading).rejects.toMatchObject({ name: "AbortError" });
    expect(s3.deleteObject).toHaveBeenCalledWith("uploads/job-4/scan.pdf");
  });

  it("aborts an in-flight object stream and removes its staging file", async () => {
    const destination = join(scratchDir, "canceled.pdf");
    const controller = new AbortController();
    let firstChunkConsumed!: () => void;
    let resumeSource!: () => void;
    const consumed = new Promise<void>((resolve) => {
      firstChunkConsumed = resolve;
    });
    const resume = new Promise<void>((resolve) => {
      resumeSource = resolve;
    });
    s3.getSize.mockResolvedValueOnce(2);
    s3.getStream.mockResolvedValueOnce(
      Readable.from(
        (async function* () {
          yield Buffer.from("a");
          firstChunkConsumed();
          await resume;
          yield Buffer.from("b");
        })(),
      ),
    );

    const copying = copyObjectToFile("uploads/job-2/scan.pdf", destination, {
      maxBytes: 2,
      signal: controller.signal,
    });
    await consumed;
    controller.abort();
    resumeSource();

    await expect(copying).rejects.toMatchObject({ name: "AbortError" });
    expect(existsSync(destination)).toBe(false);
    expect(readdirSync(scratchDir)).toEqual([]);
  });
});
