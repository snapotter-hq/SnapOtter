import { PassThrough } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * S3's DeleteObject succeeds for a key that isn't there, so the old catch-all
 * around it could only ever hide a real failure: AccessDenied, expired
 * credentials, a network error. Only an explicit "already gone" (NoSuchKey or a
 * 404, which some S3-compatible stores send) may pass quietly (#1455).
 */
const send = vi.hoisted(() => vi.fn());
const s3ClientConfigs = vi.hoisted(() => [] as Record<string, unknown>[]);

vi.mock("@aws-sdk/client-s3", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aws-sdk/client-s3")>();
  return {
    ...actual,
    S3Client: class {
      send = send;
      constructor(opts: Record<string, unknown>) {
        s3ClientConfigs.push(opts);
      }
    },
  };
});

const {
  S3_CONNECTION_TIMEOUT_MS,
  S3_SOCKET_TIMEOUT_MS,
  configureS3,
  deleteGenericPrefix,
  deleteObject,
  deleteThumbnail,
  getObject,
} = await import("../../../packages/enterprise/src/storage-s3.js");

configureS3({
  bucket: "b",
  region: "us-east-1",
  endpoint: "",
  accessKeyId: "k",
  secretAccessKey: "s",
  forcePathStyle: true,
  prefix: "",
});

function s3Error(name: string, httpStatusCode: number): Error {
  return Object.assign(new Error(name), { name, $metadata: { httpStatusCode } });
}

beforeEach(() => {
  send.mockReset();
});

describe.each([
  ["deleteObject", deleteObject],
  ["deleteThumbnail", deleteThumbnail],
])("%s (#1455)", (_name, del) => {
  it("resolves when the delete succeeds", async () => {
    send.mockResolvedValue({});
    await expect(del("a.png")).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("resolves when the object is already gone", async () => {
    send.mockRejectedValueOnce(s3Error("NoSuchKey", 404));
    await expect(del("a.png")).resolves.toBeUndefined();
    send.mockRejectedValueOnce(s3Error("NotFound", 404));
    await expect(del("a.png")).resolves.toBeUndefined();
  });

  it("rejects when S3 refuses the delete", async () => {
    send.mockRejectedValueOnce(s3Error("AccessDenied", 403));
    await expect(del("a.png")).rejects.toMatchObject({ name: "AccessDenied" });
  });

  it("rejects when the bucket is gone", async () => {
    send.mockRejectedValueOnce(s3Error("NoSuchBucket", 404));
    await expect(del("a.png")).rejects.toMatchObject({ name: "NoSuchBucket" });
  });

  it("rejects on a network failure", async () => {
    send.mockRejectedValueOnce(Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }));
    await expect(del("a.png")).rejects.toThrow("socket hang up");
  });
});

describe("deleteGenericPrefix (#2632)", () => {
  it("resolves without calling DeleteObjects when ListObjectsV2 returns no keys", async () => {
    send.mockResolvedValueOnce({ Contents: [], IsTruncated: false });
    await expect(deleteGenericPrefix("uploads/job-empty/")).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("resolves when ListObjectsV2 returns keys and DeleteObjects deletes them cleanly", async () => {
    send
      .mockResolvedValueOnce({
        Contents: [{ Key: "uploads/job-ok/a.png" }, { Key: "uploads/job-ok/b.png" }],
        IsTruncated: false,
      })
      .mockResolvedValueOnce({
        Deleted: [{ Key: "uploads/job-ok/a.png" }, { Key: "uploads/job-ok/b.png" }],
      });
    await expect(deleteGenericPrefix("uploads/job-ok/")).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("rejects when ListObjectsV2 is refused by S3", async () => {
    send.mockRejectedValueOnce(s3Error("AccessDenied", 403));
    await expect(deleteGenericPrefix("uploads/job-denied/")).rejects.toMatchObject({
      name: "AccessDenied",
    });
  });

  it("stamps $metadata on a DeleteObjects partial failure so s3WriteFault classifies it as a 503 storage fault", async () => {
    send
      .mockResolvedValueOnce({
        Contents: [{ Key: "uploads/job-1/a.png" }],
        IsTruncated: false,
      })
      .mockResolvedValueOnce({
        Errors: [{ Key: "uploads/job-1/a.png", Code: "AccessDenied" }],
        $metadata: { httpStatusCode: 200 },
      });

    const err = await deleteGenericPrefix("uploads/job-1/").then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain(
      "S3 DeleteObjects partial failure: uploads/job-1/a.png: AccessDenied",
    );
    expect(err).toHaveProperty("$metadata", { httpStatusCode: 200 });
  });

  it("falls back to an empty $metadata object when a DeleteObjects partial failure omits $metadata", async () => {
    send
      .mockResolvedValueOnce({
        Contents: [{ Key: "uploads/job-1/a.png" }],
        IsTruncated: false,
      })
      .mockResolvedValueOnce({
        Errors: [{ Key: "uploads/job-1/a.png", Code: "InternalError" }],
      });

    const err = await deleteGenericPrefix("uploads/job-1/").then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(Error);
    expect(err).toHaveProperty("$metadata", {});
  });
});

describe("getObject abort signal support (#1497)", () => {
  it("omits send options when no signal is passed", async () => {
    send.mockResolvedValueOnce({
      Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) },
    });

    const buf = await getObject("photo.png");

    expect(buf).toEqual(Buffer.from([1, 2, 3]));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]).toHaveLength(1);
  });

  it("forwards abortSignal to S3Client.send when a signal is passed", async () => {
    const ac = new AbortController();
    send.mockResolvedValueOnce({
      Body: { transformToByteArray: async () => new Uint8Array([4, 5]) },
    });

    const buf = await getObject("photo.png", ac.signal);

    expect(buf).toEqual(Buffer.from([4, 5]));
    expect(send).toHaveBeenCalledWith(expect.anything(), { abortSignal: ac.signal });
  });

  it("rejects without calling S3Client.send when the signal is already aborted", async () => {
    const ac = new AbortController();
    ac.abort(new Error("already timed out"));

    await expect(getObject("photo.png", ac.signal)).rejects.toThrow("already timed out");
    expect(send).not.toHaveBeenCalled();
  });

  it("destroys the response body stream if the signal aborts while reading the body", async () => {
    const ac = new AbortController();
    let rejectTransform!: (err: unknown) => void;
    const body = {
      destroy: vi.fn((err?: Error) => {
        rejectTransform(err ?? new Error("stream destroyed"));
      }),
      transformToByteArray: () =>
        new Promise<Uint8Array>((_resolve, reject) => {
          rejectTransform = reject;
          const timeoutReason = Object.assign(
            new Error("The operation was aborted due to timeout"),
            {
              name: "TimeoutError",
            },
          );
          ac.abort(timeoutReason);
        }),
    };
    send.mockResolvedValueOnce({ Body: body });

    await expect(getObject("photo.png", ac.signal)).rejects.toMatchObject({
      name: "TimeoutError",
      message: "The operation was aborted due to timeout",
    });
    expect(body.destroy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "TimeoutError",
      }),
    );
  });

  it("detaches the abort listener after getObject resolves so a later abort does not destroy the body", async () => {
    const ac = new AbortController();
    const body = {
      destroy: vi.fn(),
      transformToByteArray: async () => new Uint8Array([9, 8]),
    };
    send.mockResolvedValueOnce({ Body: body });

    const buf = await getObject("photo.png", ac.signal);
    expect(buf).toEqual(Buffer.from([9, 8]));

    ac.abort(new Error("later abort"));
    expect(body.destroy).not.toHaveBeenCalled();
  });

  it("destroys a real Readable body without an uncaught error event when the signal aborts as send() resolves", async () => {
    const ac = new AbortController();
    const stream = Object.assign(new PassThrough(), {
      transformToByteArray: vi.fn(async () => new Uint8Array([1])),
    });
    send.mockImplementationOnce(async () => {
      ac.abort(new Error("aborted on headers"));
      return { Body: stream };
    });

    const uncaught: unknown[] = [];
    const onUncaught = (err: unknown) => uncaught.push(err);
    process.on("uncaughtException", onUncaught);
    try {
      await expect(getObject("photo.png", ac.signal)).rejects.toThrow("aborted on headers");
      await new Promise((r) => setImmediate(r));
    } finally {
      process.off("uncaughtException", onUncaught);
    }

    expect(uncaught).toEqual([]);
    expect(stream.destroyed).toBe(true);
    expect(stream.transformToByteArray).not.toHaveBeenCalled();
  });

  it("rejects if transformToByteArray resolves after the signal aborted", async () => {
    const ac = new AbortController();
    const body = {
      destroy: vi.fn(),
      transformToByteArray: async () => {
        ac.abort(new Error("aborted before byte array returned"));
        return new Uint8Array([7]);
      },
    };
    send.mockResolvedValueOnce({ Body: body });

    await expect(getObject("photo.png", ac.signal)).rejects.toThrow(
      "aborted before byte array returned",
    );
  });
});

describe("S3Client requestHandler timeouts (#2755)", () => {
  beforeEach(() => {
    s3ClientConfigs.length = 0;
  });

  it("configures default connectionTimeout and socketTimeout on S3Client.requestHandler", async () => {
    configureS3({
      bucket: "b",
      region: "us-east-1",
      endpoint: "",
      accessKeyId: "k",
      secretAccessKey: "s",
      forcePathStyle: true,
      prefix: "",
    });
    send.mockResolvedValueOnce({});
    await deleteObject("a.png");

    expect(S3_CONNECTION_TIMEOUT_MS).toBeGreaterThan(0);
    expect(S3_SOCKET_TIMEOUT_MS).toBeGreaterThan(0);
    expect(s3ClientConfigs).toHaveLength(1);
    expect(s3ClientConfigs[0]?.requestHandler).toEqual({
      connectionTimeout: S3_CONNECTION_TIMEOUT_MS,
      socketTimeout: S3_SOCKET_TIMEOUT_MS,
    });
  });

  it("forwards custom connectionTimeout, socketTimeout, and requestTimeout overrides to S3Client.requestHandler", async () => {
    configureS3({
      bucket: "b",
      region: "us-east-1",
      endpoint: "http://127.0.0.1:9000",
      accessKeyId: "k",
      secretAccessKey: "s",
      forcePathStyle: true,
      prefix: "",
      connectionTimeout: 250,
      socketTimeout: 500,
      requestTimeout: 750,
    });
    send.mockResolvedValueOnce({});
    await deleteObject("a.png");

    expect(s3ClientConfigs).toHaveLength(1);
    expect(s3ClientConfigs[0]?.requestHandler).toEqual({
      connectionTimeout: 250,
      socketTimeout: 500,
      requestTimeout: 750,
      throwOnRequestTimeout: true,
    });
  });

  it("preserves explicit 0 timeout overrides when disabling connection or socket timeouts", async () => {
    configureS3({
      bucket: "b",
      region: "us-east-1",
      endpoint: "",
      accessKeyId: "k",
      secretAccessKey: "s",
      forcePathStyle: true,
      prefix: "",
      connectionTimeout: 0,
      socketTimeout: 0,
      requestTimeout: 0,
    });
    send.mockResolvedValueOnce({});
    await deleteObject("a.png");

    expect(s3ClientConfigs).toHaveLength(1);
    expect(s3ClientConfigs[0]?.requestHandler).toEqual({
      connectionTimeout: 0,
      socketTimeout: 0,
    });
  });
});
