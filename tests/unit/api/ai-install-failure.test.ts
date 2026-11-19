import { AI_INSTALL_ERROR_KINDS, isSafeMessageError } from "@snapotter/shared";
import { describe, expect, it } from "vitest";
import {
  aiInstallFailureError,
  classifyAiInstallFailure,
} from "../../../apps/api/src/lib/ai-install-failure.js";

describe("classifyAiInstallFailure (#4821)", () => {
  it("calls a watchdog kill a timeout, even when it escalated to SIGKILL", () => {
    expect(classifyAiInstallFailure({ watchdogKilled: true, signal: "SIGKILL" })).toBe("timeout");
  });

  it.each([
    [{ exitCode: 137 }, "oom"],
    [{ exitCode: null, signal: "SIGKILL" as const }, "oom"],
    [{ exitCode: 132 }, "cpu_unsupported"],
    [{ exitCode: null, signal: "SIGILL" as const }, "cpu_unsupported"],
  ])("maps the exit %o to %s", (failure, kind) => {
    expect(classifyAiInstallFailure(failure)).toBe(kind);
  });

  it.each([
    ["Insufficient disk space: need 3.1 GB, have 0.4 GB free. Free up space and retry.", "disk"],
    ["Ran out of disk space while extracting the bundle. Free up space and retry.", "disk"],
    ["OSError: [Errno 28] No space left on device", "disk"],
    ["PermissionError: [Errno 13] Permission denied: '/data/ai/cache'", "disk"],
    [
      "Checksum mismatch on the first download (expected a, got b), and the sequential re-download then failed: x",
      "checksum",
    ],
    ["SHA256 checksum mismatch for local file.", "checksum"],
    ["Failed to download after 5 attempts: <urlopen error timed out>", "network"],
    ["Download failed with HTTP 404 (Not Found). The archive URL may be wrong.", "network"],
    ["Installation verification timed out. Please retry the install.", "timeout"],
    ["Fatal Python error: Illegal instruction", "cpu_unsupported"],
    ["No matching distribution found for torch", "other"],
    ["Install failed with exit code 5", "other"],
  ])("classifies %j as %s", (message, kind) => {
    expect(classifyAiInstallFailure({ exitCode: 1, message })).toBe(kind);
  });

  it("reads a storage errno anywhere in the cause chain", () => {
    const error = new Error("activation failed", {
      cause: Object.assign(new Error("write"), { code: "EROFS" }),
    });
    expect(classifyAiInstallFailure({ message: error.message, error })).toBe("disk");
  });

  it("calls a connectivity error network whatever its message says", () => {
    const error = Object.assign(new Error("socket hang up"), { code: "ECONNRESET" });
    expect(classifyAiInstallFailure({ message: error.message, error })).toBe("network");
  });

  it("falls back to other with nothing to go on", () => {
    expect(classifyAiInstallFailure({})).toBe("other");
  });
});

describe("aiInstallFailureError (#4821)", () => {
  it("is an operational SafeError with a constant message and the kind in its code", () => {
    for (const kind of AI_INSTALL_ERROR_KINDS) {
      const err = aiInstallFailureError(kind);
      expect(isSafeMessageError(err)).toBe(true);
      expect(err.message).toBe("AI bundle install failed");
      expect(err.kind).toBe("operational");
      expect(err.code).toBe(`AI_INSTALL_${kind.toUpperCase()}`);
      expect(err.cause).toBeUndefined();
    }
  });
});
