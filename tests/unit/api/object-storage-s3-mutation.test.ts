// S3-backend dispatch tests for object-storage.ts (source: isS3Enabled branches
// at L171/209/241/350/368/380/392/417 and the getS3 configure/memoize at L49-65).
// STORAGE_MODE is forced to "s3" by mocking the config module, so every public
// call must route to the lazily-loaded S3 module with the EXACT key/prefix/range
// and never touch the local filesystem. This complements the local-backend
// mutation file, which cannot run under STORAGE_MODE="s3".

import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const s3 = vi.hoisted(() => ({
  configure: vi.fn(),
  putObject: vi.fn(),
  putStream: vi.fn(),
  getStream: vi.fn(),
  getSize: vi.fn(),
  deleteObject: vi.fn(),
  deletePrefix: vi.fn(),
  listObjects: vi.fn(),
  listJobDirs: vi.fn(),
}));

// Exact S3_* values so we can assert configureS3 receives them verbatim. Wrapped
// in vi.hoisted because vi.mock's factory is hoisted above module-level consts.
const S3_ENV = vi.hoisted(() => ({
  STORAGE_MODE: "s3",
  WORKSPACE_PATH: "/should-never-be-touched",
  S3_BUCKET: "snap-bucket",
  S3_REGION: "eu-west-2",
  S3_ENDPOINT: "https://s3.example.test",
  S3_ACCESS_KEY_ID: "AKIA-TEST",
  S3_SECRET_ACCESS_KEY: "secret-shhh",
  S3_FORCE_PATH_STYLE: true,
  S3_PREFIX: "tenant-a",
  MAX_WORKSPACE_SIZE_GB: 10,
}));

vi.mock("../../../apps/api/src/config.js", () => ({ env: S3_ENV }));

vi.mock("@snapotter/enterprise", () => ({
  loadS3Storage: vi.fn(async () => ({
    configureS3: s3.configure,
    putGenericObject: s3.putObject,
    putGenericObjectStream: s3.putStream,
    getGenericObjectStream: s3.getStream,
    getGenericObjectSize: s3.getSize,
    deleteGenericObject: s3.deleteObject,
    deleteGenericPrefix: s3.deletePrefix,
    listGenericObjects: s3.listObjects,
    listGenericJobDirs: s3.listJobDirs,
  })),
}));

import {
  deleteObject,
  deletePrefix,
  getObjectSize,
  getObjectStream,
  listJobDirs,
  listObjects,
  putObject,
  putObjectStream,
} from "../../../apps/api/src/lib/object-storage.js";

beforeEach(() => {
  vi.clearAllMocks();
  s3.putObject.mockResolvedValue(undefined);
  s3.deleteObject.mockResolvedValue(undefined);
  s3.deletePrefix.mockResolvedValue(undefined);
  s3.getSize.mockResolvedValue(0);
  s3.getStream.mockResolvedValue(Readable.from([Buffer.from("")]));
  s3.listObjects.mockResolvedValue([]);
  s3.listJobDirs.mockResolvedValue([]);
  s3.putStream.mockImplementation(async (_key: string, source: AsyncIterable<Buffer>) => {
    // Drain the counter so putObjectStream's byte tally reflects the input.
    for await (const _chunk of source) {
      /* consume */
    }
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("object-storage S3 dispatch (STORAGE_MODE=s3)", () => {
  it("routes putObject to the S3 backend with the exact key and buffer", async () => {
    const data = Buffer.from("payload");
    await putObject("uploads/job-put/file.bin", data);
    expect(s3.putObject).toHaveBeenCalledTimes(1);
    expect(s3.putObject).toHaveBeenCalledWith("uploads/job-put/file.bin", data);
  });

  it("routes getObjectSize to the S3 backend and returns its exact number", async () => {
    s3.getSize.mockResolvedValueOnce(9182);
    expect(await getObjectSize("outputs/job-size/out.bin")).toBe(9182);
    expect(s3.getSize).toHaveBeenCalledWith("outputs/job-size/out.bin");
  });

  it("routes an unranged getObjectStream to the S3 backend with range undefined", async () => {
    const body = Readable.from([Buffer.from("s3-bytes")]);
    s3.getStream.mockResolvedValueOnce(body);
    const out = await getObjectStream("outputs/job-get/out.bin");
    expect(out).toBe(body);
    expect(s3.getStream).toHaveBeenCalledWith("outputs/job-get/out.bin", undefined);
  });

  it("forwards a byte range to the S3 backend verbatim", async () => {
    await getObjectStream("outputs/job-get/out.bin", { start: 6, end: 10 });
    expect(s3.getStream).toHaveBeenCalledWith("outputs/job-get/out.bin", { start: 6, end: 10 });
  });

  it("routes deleteObject to the S3 backend with the exact key", async () => {
    await deleteObject("uploads/job-del/gone.bin");
    expect(s3.deleteObject).toHaveBeenCalledWith("uploads/job-del/gone.bin");
  });

  it("routes deletePrefix to the S3 backend with the exact prefix", async () => {
    await deletePrefix("outputs/job-prefix");
    expect(s3.deletePrefix).toHaveBeenCalledWith("outputs/job-prefix");
  });

  it("routes listObjects to the S3 backend and returns its result unchanged", async () => {
    const rows = [{ key: "uploads/j/a", size: 3, mtimeMs: 0 }];
    s3.listObjects.mockResolvedValueOnce(rows);
    expect(await listObjects("uploads/j")).toBe(rows);
    expect(s3.listObjects).toHaveBeenCalledWith("uploads/j");
  });

  it("routes listJobDirs to the S3 backend with the prefix and returns its result", async () => {
    const rows = [{ key: "outputs/j1", size: 0, mtimeMs: 0 }];
    s3.listJobDirs.mockResolvedValueOnce(rows);
    expect(await listJobDirs("outputs")).toBe(rows);
    expect(s3.listJobDirs).toHaveBeenCalledWith("outputs");
  });

  it("streams to S3 and returns the exact byte count written", async () => {
    const written = await putObjectStream(
      "uploads/job-stream/scan.bin",
      Readable.from([Buffer.alloc(1000, 1), Buffer.alloc(24, 2)]),
      { maxBytes: 4096 },
    );
    expect(written).toBe(1024);
    expect(s3.putStream).toHaveBeenCalledWith(
      "uploads/job-stream/scan.bin",
      expect.anything(),
      undefined,
    );
    // The local capacity guard must never run on the S3 path.
    expect(s3.putObject).not.toHaveBeenCalled();
  });

  it("still validates the key before dispatching to S3 (rejects traversal)", async () => {
    await expect(putObject("uploads/../etc/passwd", Buffer.from("x"))).rejects.toThrow(
      /Invalid object key/,
    );
    expect(s3.putObject).not.toHaveBeenCalled();
  });

  it("configures the S3 client once with the exact env credentials, then memoizes", async () => {
    // The module-level s3Mod singleton is likely already warm from earlier tests
    // in this file, so reset the module registry to get a fresh copy whose cache
    // starts null. The static vi.mock factories above re-apply on re-import.
    vi.resetModules();
    s3.configure.mockClear();
    const fresh = await import("../../../apps/api/src/lib/object-storage.js");

    // Two calls, one configureS3: proves getS3 memoizes the loaded module.
    await fresh.getObjectSize("outputs/job-a/x.bin");
    await fresh.getObjectSize("outputs/job-b/y.bin");
    expect(s3.configure).toHaveBeenCalledTimes(1);
    expect(s3.configure).toHaveBeenCalledWith({
      bucket: "snap-bucket",
      region: "eu-west-2",
      endpoint: "https://s3.example.test",
      accessKeyId: "AKIA-TEST",
      secretAccessKey: "secret-shhh",
      forcePathStyle: true,
      prefix: "tenant-a",
    });
  });
});
