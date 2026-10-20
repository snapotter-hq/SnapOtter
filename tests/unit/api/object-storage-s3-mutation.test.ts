// S3-backend dispatch tests for object-storage.ts (source: isS3Enabled branches
// at L171/209/241/350/368/380/392/417 and the getS3 configure/memoize at L49-65).
// STORAGE_MODE is forced to "s3" by mocking the config module, so every public
// call must route to the lazily-loaded S3 module with the EXACT key/prefix/range
// and never touch the local filesystem. This complements the local-backend
// mutation file, which cannot run under STORAGE_MODE="s3".

import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const s3 = vi.hoisted(() => ({
  defaultMod: null as unknown,
  load: vi.fn<() => Promise<unknown>>(),
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

vi.mock("@snapotter/enterprise", async () => {
  // The real predicate, so the wiring in object-storage is tested against the
  // shapes the SDK actually throws (#901).
  const { isMissingObjectError } = await vi.importActual<
    typeof import("../../../packages/enterprise/src/storage-s3.js")
  >("../../../packages/enterprise/src/storage-s3.js");
  s3.defaultMod = {
    isMissingObjectError,
    configureS3: s3.configure,
    putGenericObject: s3.putObject,
    putGenericObjectStream: s3.putStream,
    getGenericObjectStream: s3.getStream,
    getGenericObjectSize: s3.getSize,
    deleteGenericObject: s3.deleteObject,
    deleteGenericPrefix: s3.deletePrefix,
    listGenericObjects: s3.listObjects,
    listGenericJobDirs: s3.listJobDirs,
  };
  s3.load.mockResolvedValue(s3.defaultMod);
  return {
    loadS3Storage: () => s3.load(),
  };
});

import { logger } from "../../../apps/api/src/lib/logger.js";
import {
  copyObjectToFile,
  deleteObject,
  deletePrefix,
  getObjectSize,
  getObjectStream,
  isMissingObjectError,
  listJobDirs,
  listObjects,
  normalizeS3ReadFault,
  putObject,
  putObjectStream,
  STORAGE_UNAVAILABLE_MESSAGE,
} from "../../../apps/api/src/lib/object-storage.js";

beforeEach(() => {
  vi.clearAllMocks();
  s3.load.mockResolvedValue(s3.defaultMod);
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

  describe("a failed S3 buffer write", () => {
    it.each([
      [
        "S3 refusing access",
        Object.assign(new Error("Access Denied"), {
          name: "AccessDenied",
          $metadata: { httpStatusCode: 403 },
        }),
      ],
      [
        "S3 throttling the write",
        Object.assign(new Error("Please reduce your request rate."), {
          name: "SlowDown",
          $metadata: { httpStatusCode: 503 },
        }),
      ],
      [
        "S3 resetting the connection",
        Object.assign(new Error("socket hang up"), {
          name: "TimeoutError",
          code: "ECONNRESET",
          $metadata: { attempts: 3 },
        }),
      ],
      [
        "an unmodeled S3 404 on write",
        Object.assign(new Error("NotFound"), {
          name: "NotFound",
          $metadata: { httpStatusCode: 404 },
        }),
      ],
      [
        "the endpoint unreachable",
        Object.assign(new Error("connect ECONNREFUSED 10.0.0.9:9000"), { code: "ECONNREFUSED" }),
      ],
    ])("answers 503 storage-unavailable for %s", async (_case, cause) => {
      s3.putObject.mockRejectedValueOnce(cause);
      await expect(putObject("uploads/job-put/file.bin", Buffer.from("x"))).rejects.toMatchObject({
        isSafeMessage: true,
        kind: "operational",
        code: "storage-unavailable",
        statusCode: 503,
        cause,
      });
    });

    it("stamps 500 on an unexpected non-S3 error during putObject", async () => {
      const bug = new TypeError("unexpected failure");
      s3.putObject.mockRejectedValueOnce(bug);
      await expect(putObject("uploads/job-put/file.bin", Buffer.from("x"))).rejects.toBe(bug);
      expect((bug as TypeError & { statusCode?: number }).statusCode).toBe(500);
    });
  });

  describe("a failed S3 initialization in getS3 (#2787)", () => {
    it("stamps 500 on putObject, putObjectStream, and deletePrefix when loadS3Storage or configureS3 throws an unexpected error", async () => {
      vi.resetModules();
      const fresh = await import("../../../apps/api/src/lib/object-storage.js");

      const loadBug = new Error("Failed to load S3 storage module");
      s3.load.mockRejectedValueOnce(loadBug);
      await expect(fresh.putObject("uploads/job-init/file.bin", Buffer.from("x"))).rejects.toBe(
        loadBug,
      );
      expect((loadBug as Error & { statusCode?: number }).statusCode).toBe(500);

      const streamController = new AbortController();
      const removeListenerSpy = vi.spyOn(streamController.signal, "removeEventListener");
      const streamSource = Readable.from([Buffer.from("x")]);
      const streamBug = new Error("Failed to load S3 storage for stream");
      s3.load.mockRejectedValueOnce(streamBug);
      await expect(
        fresh.putObjectStream("uploads/job-init/stream.bin", streamSource, {
          signal: streamController.signal,
        }),
      ).rejects.toBe(streamBug);
      expect((streamBug as Error & { statusCode?: number }).statusCode).toBe(500);
      expect(streamSource.destroyed).toBe(true);
      expect(removeListenerSpy).toHaveBeenCalledWith("abort", expect.any(Function));
      expect(s3.deleteObject).not.toHaveBeenCalled();

      const configBug = new TypeError("Invalid S3 configuration");
      s3.configure.mockImplementationOnce(() => {
        throw configBug;
      });
      await expect(fresh.deletePrefix("outputs/job-init")).rejects.toBe(configBug);
      expect((configBug as TypeError & { statusCode?: number }).statusCode).toBe(500);

      const deleteLoadBug = new Error("Failed to load S3 storage for deleteObject");
      s3.load.mockRejectedValueOnce(deleteLoadBug);
      await expect(fresh.deleteObject("uploads/job-init/file.bin")).rejects.toBe(deleteLoadBug);
      expect((deleteLoadBug as Error & { statusCode?: number }).statusCode).toBe(500);
    });

    it("answers 503 storage-unavailable when getS3 fails with a connectivity or S3 error", async () => {
      vi.resetModules();
      const fresh = await import("../../../apps/api/src/lib/object-storage.js");

      const netCause = Object.assign(new Error("connect ECONNREFUSED 10.0.0.9:9000"), {
        code: "ECONNREFUSED",
      });
      s3.load.mockRejectedValueOnce(netCause);
      await expect(
        fresh.putObject("uploads/job-init/file.bin", Buffer.from("x")),
      ).rejects.toMatchObject({
        isSafeMessage: true,
        kind: "operational",
        code: "storage-unavailable",
        statusCode: 503,
        cause: netCause,
      });

      const s3Cause = Object.assign(new Error("Service Unavailable"), {
        name: "ServiceUnavailable",
        $metadata: { httpStatusCode: 503 },
      });
      s3.load.mockRejectedValueOnce(s3Cause);
      const streamSource = Readable.from([Buffer.from("x")]);
      await expect(
        fresh.putObjectStream("uploads/job-init/stream.bin", streamSource),
      ).rejects.toMatchObject({
        isSafeMessage: true,
        kind: "operational",
        code: "storage-unavailable",
        statusCode: 503,
        cause: s3Cause,
      });
      expect(streamSource.destroyed).toBe(true);
      expect(s3.deleteObject).not.toHaveBeenCalled();

      s3.load.mockRejectedValueOnce(netCause);
      await expect(fresh.deletePrefix("outputs/job-init")).rejects.toMatchObject({
        isSafeMessage: true,
        kind: "operational",
        code: "storage-unavailable",
        statusCode: 503,
        cause: netCause,
      });

      s3.load.mockRejectedValueOnce(netCause);
      await expect(fresh.deleteObject("uploads/job-init/file.bin")).rejects.toMatchObject({
        isSafeMessage: true,
        kind: "operational",
        code: "storage-unavailable",
        statusCode: 503,
        cause: netCause,
      });
    });

    it("destroys the source and rejects with AbortError if aborted while getS3 is pending", async () => {
      vi.resetModules();
      const fresh = await import("../../../apps/api/src/lib/object-storage.js");

      const controller = new AbortController();
      const streamSource = Readable.from(
        (async function* () {
          yield Buffer.from("x");
        })(),
      );
      let markLoading!: () => void;
      const loading = new Promise<void>((resolve) => {
        markLoading = resolve;
      });
      let resolveLoad!: (mod: unknown) => void;
      s3.load.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveLoad = resolve;
            markLoading();
          }),
      );

      const pending = fresh.putObjectStream("uploads/job-init/abort.bin", streamSource, {
        signal: controller.signal,
      });
      await loading;
      controller.abort();
      const abortedWhileLoading = streamSource.destroyed;
      resolveLoad(s3.defaultMod);

      const caught = await pending.then(
        () => null,
        (e: unknown) => e,
      );
      expect(caught).toMatchObject({ name: "AbortError" });
      expect((caught as { statusCode?: unknown }).statusCode).toBeUndefined();
      expect(abortedWhileLoading).toBe(true);
      expect(s3.putStream).not.toHaveBeenCalled();
      expect(s3.deleteObject).not.toHaveBeenCalled();
    });
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

  describe("copyObjectToFile S3 read-step fault classification (#2853)", () => {
    it.each([
      [
        "S3 throttling getObjectSize",
        "size" as const,
        Object.assign(new Error("Please reduce your request rate."), {
          name: "SlowDown",
          $metadata: { httpStatusCode: 503 },
        }),
      ],
      [
        "S3 refusing getObjectStream",
        "stream" as const,
        Object.assign(new Error("Access Denied"), {
          name: "AccessDenied",
          $metadata: { httpStatusCode: 403 },
        }),
      ],
      [
        "an unreachable S3 endpoint on getObjectSize",
        "size" as const,
        Object.assign(new Error("connect ECONNREFUSED 10.0.0.9:9000"), { code: "ECONNREFUSED" }),
      ],
      [
        "an S3 stream reset (EIO with read syscall) on getObjectStream",
        "stream" as const,
        Object.assign(new Error("EIO: S3 stream reset"), { code: "EIO", syscall: "read" }),
      ],
      [
        "an S3 premature close on getObjectStream",
        "stream" as const,
        Object.assign(new Error("Premature close"), { code: "ERR_STREAM_PREMATURE_CLOSE" }),
      ],
    ])("answers 503 storage-unavailable for %s", async (_label, step, cause) => {
      if (step === "size") {
        s3.getSize.mockRejectedValueOnce(cause);
      } else {
        s3.getSize.mockResolvedValueOnce(16);
        s3.getStream.mockRejectedValueOnce(cause);
      }
      await expect(
        copyObjectToFile("uploads/job-copy/scan.pdf", "/should-not-write/out.pdf", {
          maxBytes: 1024,
        }),
      ).rejects.toMatchObject({
        isSafeMessage: true,
        kind: "operational",
        code: "storage-unavailable",
        statusCode: 503,
        cause,
      });
    });

    it.each([
      [
        "mid-stream premature close",
        Object.assign(new Error("Premature close"), { code: "ERR_STREAM_PREMATURE_CLOSE" }),
      ],
      ["mid-stream aborted message", new Error("aborted")],
      [
        "mid-stream EIO with read syscall",
        Object.assign(new Error("EIO: S3 stream reset"), { code: "EIO", syscall: "read" }),
      ],
    ])(
      "classifies an S3 source stream failure (%s) during copyObjectToFile as 503 storage-unavailable and cleans up staging",
      async (_label, streamCause) => {
        const scratch = mkdtempSync(join(tmpdir(), "snapotter-s3-copy-mid-"));
        const destination = join(scratch, "out.pdf");
        s3.getSize.mockResolvedValueOnce(16);
        s3.getStream.mockResolvedValueOnce(
          Readable.from(
            (async function* () {
              yield Buffer.from("partial");
              throw streamCause;
            })(),
          ),
        );
        try {
          await expect(
            copyObjectToFile("uploads/job-copy/scan.pdf", destination, { maxBytes: 1024 }),
          ).rejects.toMatchObject({
            isSafeMessage: true,
            kind: "operational",
            code: "storage-unavailable",
            statusCode: 503,
            cause: streamCause,
          });
          expect(existsSync(destination)).toBe(false);
        } finally {
          rmSync(scratch, { recursive: true, force: true });
        }
      },
    );

    it("keeps a local scratch write failure during S3 copyObjectToFile classified as 503 storage-write-failed", async () => {
      const scratch = mkdtempSync(join(tmpdir(), "snapotter-s3-copy-localfault-"));
      const blocker = join(scratch, "file-blocker");
      writeFileSync(blocker, "not-a-dir");
      const destination = join(blocker, "nested", "out.pdf");
      s3.getSize.mockResolvedValueOnce(7);
      s3.getStream.mockResolvedValueOnce(Readable.from([Buffer.from("payload")]));
      try {
        await expect(
          copyObjectToFile("uploads/job-copy/scan.pdf", destination, { maxBytes: 1024 }),
        ).rejects.toMatchObject({
          isSafeMessage: true,
          kind: "operational",
          code: "storage-write-failed",
          statusCode: 503,
          cause: expect.objectContaining({ syscall: "mkdir" }),
        });
      } finally {
        rmSync(scratch, { recursive: true, force: true });
      }
    });

    it("rejects before getObjectStream when declared S3 size exceeds maxBytes", async () => {
      s3.getSize.mockResolvedValueOnce(1025);
      await expect(
        copyObjectToFile("uploads/job-copy/big.pdf", "/should-not-write/out.pdf", {
          maxBytes: 1024,
        }),
      ).rejects.toMatchObject({
        statusCode: 413,
        limitBytes: 1024,
      });
      expect(s3.getStream).not.toHaveBeenCalled();
    });

    it("rejects an invalid key in copyObjectToFile before calling S3 and without stamping 500", async () => {
      const err = await copyObjectToFile("uploads/../etc/passwd", "/should-not-write/out.pdf", {
        maxBytes: 1024,
      }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toMatch(/Invalid object key/);
      expect((err as { statusCode?: unknown }).statusCode).toBeUndefined();
      expect(s3.getSize).not.toHaveBeenCalled();
    });

    it("preserves a non-AbortError signal reason in copyObjectToFile when aborted during getObjectSize", async () => {
      const controller = new AbortController();
      s3.getSize.mockImplementationOnce(async () => {
        controller.abort("timeout");
        return 16;
      });
      const err = await copyObjectToFile("uploads/job-copy/scan.pdf", "/should-not-write/out.pdf", {
        maxBytes: 1024,
        signal: controller.signal,
      }).catch((e: unknown) => e);
      expect(err).toBe("timeout");
      expect(s3.getStream).not.toHaveBeenCalled();
    });

    it("passes a missing-object NoSuchKey rejection through untouched so isMissingObjectError accepts it", async () => {
      const noSuchKey = Object.assign(new Error("The specified key does not exist."), {
        name: "NoSuchKey",
        $metadata: { httpStatusCode: 404 },
      });
      s3.getSize.mockRejectedValueOnce(noSuchKey);
      const err = await copyObjectToFile("uploads/job-copy/gone.pdf", "/should-not-write/out.pdf", {
        maxBytes: 1024,
      }).catch((e: unknown) => e);
      expect(err).toBe(noSuchKey);
      expect(isMissingObjectError(err)).toBe(true);
    });

    it("stamps 500 on an unexpected non-S3 error during copyObjectToFile read setup", async () => {
      const bug = new TypeError("unexpected S3 size defect");
      s3.getSize.mockRejectedValueOnce(bug);
      await expect(
        copyObjectToFile("uploads/job-copy/scan.pdf", "/should-not-write/out.pdf", {
          maxBytes: 1024,
        }),
      ).rejects.toBe(bug);
      expect((bug as TypeError & { statusCode?: number }).statusCode).toBe(500);
    });
  });

  it("routes deleteObject to the S3 backend with the exact key", async () => {
    await deleteObject("uploads/job-del/gone.bin");
    expect(s3.deleteObject).toHaveBeenCalledWith("uploads/job-del/gone.bin");
  });

  describe("a failed S3 object delete (#976, #2835)", () => {
    it.each([
      [
        "S3 refusing access",
        Object.assign(new Error("Access Denied"), {
          name: "AccessDenied",
          $metadata: { httpStatusCode: 403 },
        }),
      ],
      [
        "S3 throttling the delete",
        Object.assign(new Error("Please reduce your request rate."), {
          name: "SlowDown",
          $metadata: { httpStatusCode: 503 },
        }),
      ],
      [
        "S3 reporting a missing bucket",
        Object.assign(new Error("The specified bucket does not exist"), {
          name: "NoSuchBucket",
          $metadata: { httpStatusCode: 404 },
        }),
      ],
      [
        "S3 resetting the connection",
        Object.assign(new Error("socket hang up"), {
          name: "TimeoutError",
          code: "ECONNRESET",
          $metadata: { attempts: 3 },
        }),
      ],
      [
        "the endpoint unreachable",
        Object.assign(new Error("connect ECONNREFUSED 10.0.0.9:9000"), { code: "ECONNREFUSED" }),
      ],
    ])("answers 503 storage-unavailable for %s", async (_case, cause) => {
      s3.deleteObject.mockRejectedValueOnce(cause);
      await expect(deleteObject("uploads/job-del/denied.bin")).rejects.toMatchObject({
        isSafeMessage: true,
        kind: "operational",
        code: "storage-unavailable",
        statusCode: 503,
        cause,
      });
    });

    it("stamps 500 on an unexpected non-S3 error during deleteObject", async () => {
      const bug = new TypeError("unexpected failure");
      s3.deleteObject.mockRejectedValueOnce(bug);
      await expect(deleteObject("uploads/job-del/denied.bin")).rejects.toBe(bug);
      expect((bug as TypeError & { statusCode?: number }).statusCode).toBe(500);
    });

    it("rejects an invalid key in deleteObject before calling S3 and without stamping 500", async () => {
      const err = await deleteObject("uploads/../etc/passwd").catch((e: unknown) => e);
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toMatch(/Invalid object key/);
      expect((err as { statusCode?: unknown }).statusCode).toBeUndefined();
      expect(s3.deleteObject).not.toHaveBeenCalled();
    });
  });

  it("routes deletePrefix to the S3 backend with the exact prefix", async () => {
    await deletePrefix("outputs/job-prefix");
    expect(s3.deletePrefix).toHaveBeenCalledWith("outputs/job-prefix");
  });

  describe("a failed S3 prefix delete (#2632)", () => {
    it.each([
      [
        "S3 refusing access",
        Object.assign(new Error("Access Denied"), {
          name: "AccessDenied",
          $metadata: { httpStatusCode: 403 },
        }),
      ],
      [
        "S3 throttling the delete",
        Object.assign(new Error("Please reduce your request rate."), {
          name: "SlowDown",
          $metadata: { httpStatusCode: 503 },
        }),
      ],
      [
        "an S3 DeleteObjects partial failure",
        Object.assign(
          new Error("S3 DeleteObjects partial failure: outputs/job-prefix/a.bin: AccessDenied"),
          {
            $metadata: { httpStatusCode: 200 },
          },
        ),
      ],
      [
        "the endpoint unreachable",
        Object.assign(new Error("connect ECONNREFUSED 10.0.0.9:9000"), { code: "ECONNREFUSED" }),
      ],
    ])("answers 503 storage-unavailable for %s", async (_case, cause) => {
      s3.deletePrefix.mockRejectedValueOnce(cause);
      await expect(deletePrefix("outputs/job-prefix")).rejects.toMatchObject({
        isSafeMessage: true,
        kind: "operational",
        code: "storage-unavailable",
        statusCode: 503,
        cause,
      });
    });

    it("stamps 500 on an unexpected non-S3 error during deletePrefix", async () => {
      const bug = new TypeError("unexpected failure");
      s3.deletePrefix.mockRejectedValueOnce(bug);
      await expect(deletePrefix("outputs/job-prefix")).rejects.toBe(bug);
      expect((bug as TypeError & { statusCode?: number }).statusCode).toBe(500);
    });
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

  // #1421: an S3 refusal or an unreachable endpoint while an upload streams in
  // is a storage fault, answered 503 like the local backend's full-disk and
  // read-only faults. The client's own faults and aborts, and plain bugs,
  // keep their shape.
  describe("a failed S3 streaming upload", () => {
    async function streamFailure(error: unknown): Promise<unknown> {
      s3.putStream.mockRejectedValueOnce(error);
      const source = Readable.from([Buffer.from("x")]);
      const err = await putObjectStream("uploads/job-s3fault/a.bin", source).then(
        () => null,
        (e: unknown) => e,
      );
      expect(source.destroyed).toBe(true);
      return err;
    }

    it.each([
      [
        "S3 answering with an error",
        Object.assign(new Error("Please reduce your request rate."), {
          name: "SlowDown",
          $metadata: { httpStatusCode: 503 },
        }),
      ],
      [
        "S3 refusing access",
        Object.assign(new Error("Access Denied"), {
          name: "AccessDenied",
          $metadata: { httpStatusCode: 403 },
        }),
      ],
      [
        "the endpoint unreachable",
        Object.assign(new Error("connect ECONNREFUSED 10.0.0.9:9000"), { code: "ECONNREFUSED" }),
      ],
      [
        "the network unreachable (#1992)",
        Object.assign(new Error("connect ENETUNREACH 10.0.0.9:9000"), { code: "ENETUNREACH" }),
      ],
    ])("answers 503 for %s", async (_case, cause) => {
      const err = await streamFailure(cause);
      expect(err).toMatchObject({
        isSafeMessage: true,
        kind: "operational",
        code: "storage-unavailable",
        statusCode: 503,
        cause,
      });
      expect(s3.deleteObject).toHaveBeenCalledWith("uploads/job-s3fault/a.bin");
    });

    it.each([
      ["a malformed body", Object.assign(new Error("Unexpected end of form"), { statusCode: 400 })],
      ["an over-limit file", Object.assign(new Error("too large"), { statusCode: 413 })],
      ["an abort", Object.assign(new Error("The operation was aborted"), { name: "AbortError" })],
      [
        // The SDK's retry layer stamps $metadata on whatever passes through it.
        "an abort the SDK stamped",
        Object.assign(new Error("Request aborted"), { name: "AbortError", $metadata: {} }),
      ],
      [
        // The upload's own client dropping out: ECONNRESET looks like an
        // unreachable endpoint, but the 400 set upstream says whose it is.
        "a client abort the SDK wrapped",
        new Error("Upload failed", {
          cause: Object.assign(new Error("aborted"), { code: "ECONNRESET", statusCode: 400 }),
        }),
      ],
    ])("passes %s through unchanged", async (_case, original) => {
      expect(await streamFailure(original)).toBe(original);
    });

    it("makes anything else ours: a 500, not a malformed request", async () => {
      const bug = new TypeError("Cannot read properties of undefined");
      expect(await streamFailure(bug)).toBe(bug);
      expect((bug as TypeError & { statusCode?: number }).statusCode).toBe(500);
    });

    it("keeps the client's 413 when S3 replaces it with its own abort failure", async () => {
      // lib-storage aborts the multipart upload when the body fails; if that
      // abort is refused, it throws the refusal instead of the body's error.
      s3.putStream.mockImplementationOnce(async (_key: string, source: AsyncIterable<Buffer>) => {
        try {
          for await (const _chunk of source) {
            /* consume */
          }
        } catch {
          throw Object.assign(new Error("Access Denied"), {
            name: "AccessDenied",
            $metadata: { httpStatusCode: 403 },
          });
        }
      });

      const err = await putObjectStream(
        "uploads/job-s3fault/big.bin",
        Readable.from([Buffer.alloc(4096, 1)]),
        { maxBytes: 1024 },
      ).then(
        () => null,
        (e: unknown) => e,
      );

      expect(err).toMatchObject({ statusCode: 413, limitBytes: 1024 });
    });

    it("logs a warning with { err, key } and still throws the write fault when deleteGenericObject rejects during S3 stream error recovery (#2837)", async () => {
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
      const writeCause = Object.assign(new Error("Please reduce your request rate."), {
        name: "SlowDown",
        $metadata: { httpStatusCode: 503 },
      });
      const deleteCause = Object.assign(new Error("Access Denied"), {
        name: "AccessDenied",
        $metadata: { httpStatusCode: 403 },
      });
      s3.deleteObject.mockRejectedValueOnce(deleteCause);

      try {
        const err = await streamFailure(writeCause);

        expect(err).toMatchObject({
          isSafeMessage: true,
          kind: "operational",
          code: "storage-unavailable",
          statusCode: 503,
          cause: writeCause,
        });
        expect(s3.deleteObject).toHaveBeenCalledWith("uploads/job-s3fault/a.bin");
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy).toHaveBeenCalledWith(
          { err: deleteCause, key: "uploads/job-s3fault/a.bin" },
          "Failed to delete partial S3 upload",
        );
      } finally {
        warnSpy.mockRestore();
      }
    });
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

describe("isMissingObjectError with the S3 module loaded (#901)", () => {
  it("delegates to the S3 predicate: NoSuchKey is missing, service faults and local shapes are not", async () => {
    await getObjectSize("uploads/j/a.png"); // loads the lazy singleton
    expect(isMissingObjectError({ name: "NoSuchKey", $metadata: { httpStatusCode: 404 } })).toBe(
      true,
    );
    expect(isMissingObjectError({ name: "AccessDenied", $metadata: { httpStatusCode: 403 } })).toBe(
      false,
    );
    expect(isMissingObjectError({ name: "NoSuchBucket", $metadata: { httpStatusCode: 404 } })).toBe(
      false,
    );
    expect(isMissingObjectError(Object.assign(new Error("ENOENT"), { code: "ENOENT" }))).toBe(
      false,
    );
  });
});

describe("normalizeS3ReadFault (#2808)", () => {
  it.each([
    [
      "AccessDenied",
      Object.assign(new Error("Access Denied"), {
        name: "AccessDenied",
        $metadata: { httpStatusCode: 403 },
      }),
    ],
    [
      "SlowDown",
      Object.assign(new Error("Please reduce your request rate."), {
        name: "SlowDown",
        $metadata: { httpStatusCode: 503 },
      }),
    ],
    [
      "NoSuchBucket",
      Object.assign(new Error("The specified bucket does not exist"), {
        name: "NoSuchBucket",
        $metadata: { httpStatusCode: 404 },
      }),
    ],
    [
      "TimeoutError with ECONNRESET and $metadata",
      Object.assign(new Error("read ECONNRESET"), {
        name: "TimeoutError",
        code: "ECONNRESET",
        syscall: "read",
        $metadata: { attempts: 3 },
      }),
    ],
    [
      "network connectivity error (ECONNREFUSED)",
      Object.assign(new Error("connect ECONNREFUSED 10.0.0.9:9000"), {
        code: "ECONNREFUSED",
        syscall: "connect",
      }),
    ],
    [
      "mid-stream premature close",
      Object.assign(new Error("Premature close"), { code: "ERR_STREAM_PREMATURE_CLOSE" }),
    ],
    ["mid-stream EIO", Object.assign(new Error("S3 stream reset"), { code: "EIO" })],
    ["mid-stream aborted message", new Error("aborted")],
  ])("wraps %s in a 503 storage-unavailable SafeError", (_label, cause) => {
    expect(normalizeS3ReadFault(cause)).toMatchObject({
      message: STORAGE_UNAVAILABLE_MESSAGE,
      isSafeMessage: true,
      kind: "operational",
      code: "storage-unavailable",
      statusCode: 503,
      cause,
    });
  });

  it.each([
    [
      "NoSuchKey missing object",
      Object.assign(new Error("NoSuchKey"), {
        name: "NoSuchKey",
        $metadata: { httpStatusCode: 404 },
      }),
    ],
    [
      "NotFound 404 missing object",
      Object.assign(new Error("NotFound"), {
        name: "NotFound",
        $metadata: { httpStatusCode: 404 },
      }),
    ],
    ["already classified 503 error", Object.assign(new Error("circuit open"), { statusCode: 503 })],
    ["client 400 error", Object.assign(new Error("Invalid stored file name"), { statusCode: 400 })],
    [
      "AbortError with $metadata",
      Object.assign(new Error("Request aborted"), { name: "AbortError", $metadata: {} }),
    ],
    [
      "outer $metadata error with AbortError cause",
      Object.assign(new Error("S3 wrapper"), {
        $metadata: {},
        cause: Object.assign(new Error("The operation was aborted"), { name: "AbortError" }),
      }),
    ],
    [
      "redis connectivity error",
      Object.assign(new Error("MaxRetriesPerRequestError"), { name: "MaxRetriesPerRequestError" }),
    ],
    ["pg connectivity error", Object.assign(new Error("connection failure"), { code: "08006" })],
    ["unexpected TypeError bug", new TypeError("unexpected S3 client defect")],
  ])("passes %s through unchanged", (_label, original) => {
    expect(normalizeS3ReadFault(original)).toBe(original);
  });
});
