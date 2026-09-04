/**
 * object-storage isStorageServiceFault invariants (#974).
 *
 * The predicate classifies read-probe rejections for the tool-result
 * download route. The load-bearing direction: in S3 mode, everything not
 * proven missing is a fault, INCLUDING when the lazy enterprise singleton
 * never loaded (a failed import must present as a storage fault, never as
 * every file being deleted). This runs in an isolated fork where no S3
 * operation has executed, so the singleton is genuinely null here; the
 * minio harness cannot reach that state because its uploads populate it.
 */

import { SafeError } from "@snapotter/shared";
import { afterEach, describe, expect, it } from "vitest";
import { env } from "../../../apps/api/src/config.js";
import { isStorageServiceFault } from "../../../apps/api/src/lib/object-storage.js";

const originalMode = env.STORAGE_MODE;

afterEach(() => {
  (env as Record<string, unknown>).STORAGE_MODE = originalMode;
});

function inS3Mode<T>(fn: () => T): T {
  (env as Record<string, unknown>).STORAGE_MODE = "s3";
  return fn();
}

describe("isStorageServiceFault", () => {
  it("classifies everything as a fault in S3 mode while the S3 module is unloaded", () => {
    expect(inS3Mode(() => isStorageServiceFault(new Error("import failed")))).toBe(true);
    expect(inS3Mode(() => isStorageServiceFault({ name: "NotFound" }))).toBe(true);
  });

  it("classifies a SafeError as a fault too: rethrowing preserves its own statusCode", () => {
    const operational = new SafeError("circuit open", {
      kind: "operational",
      code: "s3-circuit",
      statusCode: 503,
    });
    expect(inS3Mode(() => isStorageServiceFault(operational))).toBe(true);
  });

  it("never classifies local-mode rejections", () => {
    expect(isStorageServiceFault(new Error("anything"))).toBe(false);
    expect(
      isStorageServiceFault(
        Object.assign(new Error("denied"), { code: "EACCES", syscall: "stat" }),
      ),
    ).toBe(false);
  });
});
