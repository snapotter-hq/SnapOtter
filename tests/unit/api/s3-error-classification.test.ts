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
