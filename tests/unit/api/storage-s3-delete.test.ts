import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * S3's DeleteObject succeeds for a key that isn't there, so the old catch-all
 * around it could only ever hide a real failure: AccessDenied, expired
 * credentials, a network error. Only an explicit "already gone" (NoSuchKey or a
 * 404, which some S3-compatible stores send) may pass quietly (#1455).
 */
const send = vi.hoisted(() => vi.fn());

vi.mock("@aws-sdk/client-s3", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aws-sdk/client-s3")>();
  return {
    ...actual,
    S3Client: class {
      send = send;
    },
  };
});

const { configureS3, deleteGenericPrefix, deleteObject, deleteThumbnail } = await import(
  "../../../packages/enterprise/src/storage-s3.js"
);

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
