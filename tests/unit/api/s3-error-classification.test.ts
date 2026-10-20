/**
 * S3 error classification (#937).
 *
 * The download route needs to tell "S3 says the object is gone" (keep the
 * 404 mapping) apart from "S3 is refusing or failing the read" (a storage
 * fault that must reach the error handler). The predicate lives on the
 * enterprise S3 module so core never inspects AWS error shapes. The minio
 * harness in tests/integration/platform/s3-download-fault.test.ts covers the
 * route end to end; CI has no minio, so the shapes are pinned here.
 */

import http from "node:http";
import net from "node:net";
import { Readable } from "node:stream";
import { loadS3Storage, type S3StorageModule } from "@snapotter/enterprise";
import { beforeAll, describe, expect, it } from "vitest";

let s3: S3StorageModule;

beforeAll(async () => {
  s3 = await loadS3Storage();
});

function sdkError(name: string, httpStatusCode?: number): Error {
  return Object.assign(new Error(name), { name, $metadata: { httpStatusCode } });
}

describe("isMissingObjectError", () => {
  it("recognizes NoSuchKey", () => {
    expect(s3.isMissingObjectError(sdkError("NoSuchKey", 404))).toBe(true);
  });

  it("recognizes NoSuchKey even without an HTTP status", () => {
    expect(s3.isMissingObjectError(sdkError("NoSuchKey", undefined))).toBe(true);
  });

  it("recognizes an unmodeled 404 from an S3-compatible store", () => {
    expect(s3.isMissingObjectError(sdkError("NotFound", 404))).toBe(true);
  });

  it("treats a vanished bucket as a fault, not a missing object", () => {
    // NoSuchBucket arrives as HTTP 404 but means the whole bucket is gone:
    // a storage outage that must not read as per-file deletion (#937).
    expect(s3.isMissingObjectError(sdkError("NoSuchBucket", 404))).toBe(false);
  });

  it("rejects auth faults", () => {
    expect(s3.isMissingObjectError(sdkError("AccessDenied", 403))).toBe(false);
    expect(s3.isMissingObjectError(sdkError("SignatureDoesNotMatch", 403))).toBe(false);
    expect(s3.isMissingObjectError(sdkError("InvalidAccessKeyId", 403))).toBe(false);
  });

  it("rejects S3 5xx", () => {
    expect(s3.isMissingObjectError(sdkError("InternalError", 500))).toBe(false);
    expect(s3.isMissingObjectError(sdkError("SlowDown", 503))).toBe(false);
  });

  it("rejects SDK network faults, which carry $metadata but no status", () => {
    expect(s3.isMissingObjectError(sdkError("TimeoutError", undefined))).toBe(false);
  });

  it("rejects non-SDK errors", () => {
    expect(s3.isMissingObjectError(new Error("boom"))).toBe(false);
    expect(s3.isMissingObjectError({ code: "ENOENT", syscall: "open" })).toBe(false);
    expect(s3.isMissingObjectError(null)).toBe(false);
    expect(s3.isMissingObjectError(undefined)).toBe(false);
    expect(s3.isMissingObjectError("NoSuchKey")).toBe(false);
  });
});

describe("S3Client stalled endpoint timeout (#2755)", () => {
  it("rejects un-signaled S3 helpers with a non-missing TimeoutError when an endpoint accepts TCP and never replies", async () => {
    const sockets = new Set<net.Socket>();
    const server = net.createServer((socket) => {
      sockets.add(socket);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as net.AddressInfo;

    try {
      s3.configureS3({
        bucket: "stalled-bucket",
        region: "us-east-1",
        endpoint: `http://127.0.0.1:${port}`,
        accessKeyId: "k",
        secretAccessKey: "s",
        forcePathStyle: true,
        prefix: "",
        connectionTimeout: 80,
        socketTimeout: 80,
      });

      const headErr = await Promise.race([
        s3.getGenericObjectSize("outputs/job-1/result.png").then(
          () => null,
          (err: unknown) => err,
        ),
        new Promise<string>((resolve) => setTimeout(() => resolve("HUNG"), 5000)),
      ]);
      expect(headErr).toBeInstanceOf(Error);
      expect(headErr).toMatchObject({ name: "TimeoutError" });
      expect(headErr).toHaveProperty("$metadata");
      expect(
        (headErr as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode,
      ).toBeUndefined();
      expect(s3.isMissingObjectError(headErr)).toBe(false);

      const listErr = await Promise.race([
        s3.listGenericJobDirs("outputs").then(
          () => null,
          (err: unknown) => err,
        ),
        new Promise<string>((resolve) => setTimeout(() => resolve("HUNG"), 5000)),
      ]);
      expect(listErr).toBeInstanceOf(Error);
      expect(listErr).toMatchObject({ name: "TimeoutError" });
      expect(listErr).toHaveProperty("$metadata");
      expect(
        (listErr as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode,
      ).toBeUndefined();
      expect(s3.isMissingObjectError(listErr)).toBe(false);

      s3.configureS3({
        bucket: "stalled-bucket",
        region: "us-east-1",
        endpoint: `http://127.0.0.1:${port}`,
        accessKeyId: "k",
        secretAccessKey: "s",
        forcePathStyle: true,
        prefix: "",
        connectionTimeout: 80,
        socketTimeout: 0,
        requestTimeout: 80,
      });

      const reqTimeoutErr = await Promise.race([
        s3.getGenericObjectSize("outputs/job-1/result.png").then(
          () => null,
          (err: unknown) => err,
        ),
        new Promise<string>((resolve) => setTimeout(() => resolve("HUNG"), 5000)),
      ]);
      expect(reqTimeoutErr).toBeInstanceOf(Error);
      expect(reqTimeoutErr).toMatchObject({ name: "TimeoutError", code: "ETIMEDOUT" });
      expect(reqTimeoutErr).toHaveProperty("$metadata");
      expect(s3.isMissingObjectError(reqTimeoutErr)).toBe(false);
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

describe("checkConnection missing-bucket normalization (#996)", () => {
  it("normalizes a HeadBucket 404 NotFound into NoSuchBucket so isMissingObjectError rejects it", async () => {
    let statusToReturn = 404;
    const server = http.createServer((_req, res) => {
      res.writeHead(statusToReturn);
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as net.AddressInfo;

    try {
      s3.configureS3({
        bucket: "vanished-bucket",
        region: "us-east-1",
        endpoint: `http://127.0.0.1:${port}`,
        accessKeyId: "k",
        secretAccessKey: "s",
        forcePathStyle: true,
        prefix: "",
      });

      const missingBucketErr = await s3.checkConnection().then(
        () => null,
        (err: unknown) => err,
      );
      expect(missingBucketErr).toBeInstanceOf(Error);
      expect(missingBucketErr).toMatchObject({
        name: "NoSuchBucket",
        $metadata: { httpStatusCode: 404 },
      });
      expect(s3.isMissingObjectError(missingBucketErr)).toBe(false);

      statusToReturn = 403;
      const forbiddenErr = await s3.checkConnection().then(
        () => null,
        (err: unknown) => err,
      );
      expect(forbiddenErr).toBeInstanceOf(Error);
      expect((forbiddenErr as { name?: string }).name).not.toBe("NoSuchBucket");
      expect(s3.isMissingObjectError(forbiddenErr)).toBe(false);

      statusToReturn = 200;
      await expect(s3.checkConnection()).resolves.toBeUndefined();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

describe("putGenericObjectStream signal.reason preservation (#2881)", () => {
  it("rethrows signal.reason (TimeoutError) instead of @aws-sdk/lib-storage's generic AbortError when a stalled PUT is aborted by AbortSignal.timeout", async () => {
    const sockets = new Set<net.Socket>();
    const server = http.createServer((_req, _res) => {
      // Accept PUT and never respond.
    });
    server.on("connection", (socket) => sockets.add(socket));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as net.AddressInfo;

    try {
      s3.configureS3({
        bucket: "stalled-upload-bucket",
        region: "us-east-1",
        endpoint: `http://127.0.0.1:${port}`,
        accessKeyId: "k",
        secretAccessKey: "s",
        forcePathStyle: true,
        prefix: "",
      });

      const timeoutSignal = AbortSignal.timeout(80);
      const timeoutErr = await s3
        .putGenericObjectStream(
          "outputs/job-1/out.bin",
          Readable.from([Buffer.alloc(64 * 1024, 1)]),
          timeoutSignal,
        )
        .then(
          () => null,
          (err: unknown) => err,
        );
      expect(timeoutErr).toBe(timeoutSignal.reason);
      expect(timeoutErr).toMatchObject({ name: "TimeoutError" });

      const cancelController = new AbortController();
      setTimeout(() => cancelController.abort(), 50);
      const cancelErr = await s3
        .putGenericObjectStream(
          "outputs/job-1/out.bin",
          Readable.from([Buffer.alloc(64 * 1024, 1)]),
          cancelController.signal,
        )
        .then(
          () => null,
          (err: unknown) => err,
        );
      expect(cancelErr).toBe(cancelController.signal.reason);
      expect(cancelErr).toMatchObject({ name: "AbortError" });

      const primitiveAbortController = new AbortController();
      setTimeout(() => primitiveAbortController.abort("canceled"), 50);
      const primitiveAbortErr = await s3
        .putGenericObjectStream(
          "outputs/job-1/out.bin",
          Readable.from([Buffer.alloc(64 * 1024, 1)]),
          primitiveAbortController.signal,
        )
        .then(
          () => null,
          (err: unknown) => err,
        );
      expect(primitiveAbortErr).toMatchObject({ name: "AbortError", message: "Upload aborted." });
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
