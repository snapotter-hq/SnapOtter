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

const { configureS3, deleteObject, deleteThumbnail } = await import(
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
