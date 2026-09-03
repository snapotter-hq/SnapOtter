/**
 * S3 error classification predicates (#937).
 *
 * The download route needs to tell "S3 says the object is gone" (keep the
 * 404 mapping) apart from "S3 is refusing or failing the read" (a storage
 * fault that must reach the error handler). The predicates live on the
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

  it("recognizes an unmodeled 404 from an S3-compatible store", () => {
    expect(s3.isMissingObjectError(sdkError("NotFound", 404))).toBe(true);
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

  it("rejects non-SDK errors", () => {
    expect(s3.isMissingObjectError(new Error("boom"))).toBe(false);
    expect(s3.isMissingObjectError(null)).toBe(false);
    expect(s3.isMissingObjectError(undefined)).toBe(false);
    expect(s3.isMissingObjectError("NoSuchKey")).toBe(false);
  });
});

describe("isS3ServiceError", () => {
  it("recognizes SDK-shaped errors by their $metadata", () => {
    expect(s3.isS3ServiceError(sdkError("AccessDenied", 403))).toBe(true);
    expect(s3.isS3ServiceError(sdkError("NoSuchKey", 404))).toBe(true);
    // Network faults dispatched by the SDK carry $metadata without a status
    expect(s3.isS3ServiceError(sdkError("TimeoutError", undefined))).toBe(true);
  });

  it("rejects everything that did not come from the SDK", () => {
    expect(s3.isS3ServiceError(new Error("boom"))).toBe(false);
    expect(s3.isS3ServiceError({ code: "ENOENT", syscall: "open" })).toBe(false);
    expect(s3.isS3ServiceError(null)).toBe(false);
    expect(s3.isS3ServiceError(undefined)).toBe(false);
    expect(s3.isS3ServiceError(42)).toBe(false);
  });
});
