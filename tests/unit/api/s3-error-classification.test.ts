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

  it("rejects TimeoutError and ETIMEDOUT even when deserializerMiddleware stamped httpStatusCode 404 (#3256)", () => {
    expect(s3.isMissingObjectError(sdkError("TimeoutError", 404))).toBe(false);
    expect(
      s3.isMissingObjectError(
        Object.assign(new Error("read ETIMEDOUT"), {
          name: "Error",
          code: "ETIMEDOUT",
          $metadata: { httpStatusCode: 404 },
        }),
      ),
    ).toBe(false);
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

  it("arms the idle socket timeout on S3 response body streams when headers arrive under 3s and rejects mid-body stalls (#2773)", async () => {
    const sockets = new Set<net.Socket>();
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Length": "1000" });
      res.write("hello");
    });
    server.on("connection", (socket) => sockets.add(socket));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as net.AddressInfo;

    try {
      // 1. Default S3_SOCKET_TIMEOUT_MS (30,000 ms >= 6,000 ms): @smithy/node-http-handler
      // defers setSocketTimeout by 3,000 ms and clearTimeouts() cancels it when headers
      // arrive in <3s. Verify the response body stream still arms socket.timeout.
      s3.configureS3({
        bucket: "stalled-body-bucket",
        region: "us-east-1",
        endpoint: `http://127.0.0.1:${port}`,
        accessKeyId: "k",
        secretAccessKey: "s",
        forcePathStyle: true,
        prefix: "",
      });

      const objStream = await s3.getObjectStream("photo.png");
      expect((objStream as { socket?: { timeout?: number } }).socket?.timeout).toBe(
        s3.S3_SOCKET_TIMEOUT_MS,
      );
      objStream.destroy();

      const genericStream = await s3.getGenericObjectStream("outputs/job-1/result.png");
      expect((genericStream as { socket?: { timeout?: number } }).socket?.timeout).toBe(
        s3.S3_SOCKET_TIMEOUT_MS,
      );
      genericStream.destroy();

      // 2. Short socketTimeout: mid-body stalls after fast 200 OK headers reject with
      // TimeoutError (code: ETIMEDOUT) across getObject, getThumbnail, getObjectStream,
      // and getGenericObjectStream.
      s3.configureS3({
        bucket: "stalled-body-bucket",
        region: "us-east-1",
        endpoint: `http://127.0.0.1:${port}`,
        accessKeyId: "k",
        secretAccessKey: "s",
        forcePathStyle: true,
        prefix: "",
        socketTimeout: 80,
      });

      const getObjectErr = await Promise.race([
        s3.getObject("photo.png").then(
          () => null,
          (err: unknown) => err,
        ),
        new Promise<string>((resolve) => setTimeout(() => resolve("HUNG"), 5000)),
      ]);
      expect(getObjectErr).toBeInstanceOf(Error);
      expect(getObjectErr).toMatchObject({ name: "TimeoutError", code: "ETIMEDOUT" });
      expect(s3.isMissingObjectError(getObjectErr)).toBe(false);

      const getThumbErr = await Promise.race([
        s3.getThumbnail("photo.png").then(
          () => null,
          (err: unknown) => err,
        ),
        new Promise<string>((resolve) => setTimeout(() => resolve("HUNG"), 5000)),
      ]);
      expect(getThumbErr).toBeInstanceOf(Error);
      expect(getThumbErr).toMatchObject({ name: "TimeoutError", code: "ETIMEDOUT" });
      expect(s3.isMissingObjectError(getThumbErr)).toBe(false);

      const streamToConsume = await s3.getGenericObjectStream("outputs/job-1/result.png");
      const streamErr = await Promise.race([
        (async () => {
          for await (const _chunk of streamToConsume) {
            // consume until stalled body times out
          }
          return null;
        })().catch((err: unknown) => err),
        new Promise<string>((resolve) => setTimeout(() => resolve("HUNG"), 5000)),
      ]);
      expect(streamErr).toBeInstanceOf(Error);
      expect(streamErr).toMatchObject({ name: "TimeoutError", code: "ETIMEDOUT" });
      expect(s3.isMissingObjectError(streamErr)).toBe(false);
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("arms the idle socket timeout on XML response bodies inside deserializerMiddleware when headers arrive under 3s and socketTimeout >= 6000 (#3256)", async () => {
    const sockets = new Set<net.Socket>();
    let observedClientTimeout: number | undefined;
    let statusCode = 200;
    let xmlMode: "fast-list" | "stalled-list" | "list-then-stalled-delete" | "stalled-404" =
      "fast-list";
    let requestCount = 0;

    const server = http.createServer((req, res) => {
      requestCount += 1;
      if (
        xmlMode === "fast-list" ||
        (xmlMode === "list-then-stalled-delete" && req.method === "GET")
      ) {
        const listXml =
          '<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><IsTruncated>false</IsTruncated><Contents><Key>uploads/job-1/a.png</Key><Size>1</Size></Contents></ListBucketResult>';
        res.writeHead(200, {
          "Content-Length": String(Buffer.byteLength(listXml)),
          "Content-Type": "application/xml",
        });
        res.end(listXml);
        return;
      }
      res.writeHead(statusCode, {
        "Content-Length": "1000",
        "Content-Type": "application/xml",
      });
      res.write(
        statusCode === 404
          ? '<?xml version="1.0"?><Error><Code>NoSuchBucket'
          : '<?xml version="1.0"?>',
      );
    });
    server.on("connection", (socket) => sockets.add(socket));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as net.AddressInfo;

    const origSetTimeout = http.IncomingMessage.prototype.setTimeout;
    http.IncomingMessage.prototype.setTimeout = function (msecs: number, cb?: () => void) {
      observedClientTimeout = msecs;
      return origSetTimeout.call(this, msecs, cb);
    };

    try {
      // 1. socketTimeout >= 6000 (default 30_000 ms): verify the deserialize middleware
      // arms IncomingMessage.setTimeout(30_000) before deserializerMiddleware reads the XML body.
      s3.configureS3({
        bucket: "stalled-xml-bucket",
        region: "us-east-1",
        endpoint: `http://127.0.0.1:${port}`,
        accessKeyId: "k",
        secretAccessKey: "s",
        forcePathStyle: true,
        prefix: "",
      });

      await expect(s3.listGenericObjects("uploads/job-1/")).resolves.toEqual([
        { key: "uploads/job-1/a.png", size: 1, mtimeMs: 0 },
      ]);
      expect(observedClientTimeout).toBe(s3.S3_SOCKET_TIMEOUT_MS);

      // 2. Short socketTimeout: verify listGenericObjects, listGenericJobDirs,
      // deleteGenericPrefix (DeleteObjectsCommand), and stalled 404 XML error responses
      // time out with TimeoutError (ETIMEDOUT) and are not misclassified as missing objects.
      xmlMode = "stalled-list";
      s3.configureS3({
        bucket: "stalled-xml-bucket",
        region: "us-east-1",
        endpoint: `http://127.0.0.1:${port}`,
        accessKeyId: "k",
        secretAccessKey: "s",
        forcePathStyle: true,
        prefix: "",
        socketTimeout: 80,
      });

      const listObjectsErr = await s3.listGenericObjects("uploads/job-1/").then(
        () => null,
        (err: unknown) => err,
      );
      expect(listObjectsErr).toMatchObject({ name: "TimeoutError", code: "ETIMEDOUT" });
      expect(s3.isMissingObjectError(listObjectsErr)).toBe(false);

      const listDirsErr = await s3.listGenericJobDirs("outputs").then(
        () => null,
        (err: unknown) => err,
      );
      expect(listDirsErr).toMatchObject({ name: "TimeoutError", code: "ETIMEDOUT" });
      expect(s3.isMissingObjectError(listDirsErr)).toBe(false);

      xmlMode = "list-then-stalled-delete";
      const deletePrefixErr = await s3.deleteGenericPrefix("uploads/job-1/").then(
        () => null,
        (err: unknown) => err,
      );
      expect(deletePrefixErr).toMatchObject({ name: "TimeoutError", code: "ETIMEDOUT" });
      expect(s3.isMissingObjectError(deletePrefixErr)).toBe(false);

      xmlMode = "stalled-404";
      statusCode = 404;
      requestCount = 0;
      const stalled404ThumbErr = await s3.getThumbnail("photo.png").then(
        () => null,
        (err: unknown) => err,
      );
      expect(requestCount).toBeGreaterThan(0);
      expect(stalled404ThumbErr).toMatchObject({
        name: "TimeoutError",
        code: "ETIMEDOUT",
        $metadata: { httpStatusCode: 404 },
      });
      expect(s3.isMissingObjectError(stalled404ThumbErr)).toBe(false);

      const stalled404DeleteErr = await s3.deleteObject("photo.png").then(
        () => null,
        (err: unknown) => err,
      );
      expect(stalled404DeleteErr).toMatchObject({
        name: "TimeoutError",
        code: "ETIMEDOUT",
        $metadata: { httpStatusCode: 404 },
      });
    } finally {
      http.IncomingMessage.prototype.setTimeout = origSetTimeout;
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
