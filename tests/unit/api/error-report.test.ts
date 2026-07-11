import { SafeError, ToolInputError } from "@snapotter/shared";
import { beforeEach, describe, expect, it } from "vitest";
import {
  classifyError,
  errorSignature,
  resetThrottleForTests,
  shouldReport,
} from "../../../apps/api/src/lib/error-report.js";

describe("classifyError", () => {
  it("expected: tool input, aborts, worker cancel/timeout strings, zod, upload validation", () => {
    expect(classifyError(new ToolInputError("bad csv"))).toBe("expected");
    expect(classifyError(Object.assign(new Error("aborted"), { code: "ECONNRESET" }))).toBe(
      "expected",
    );
    expect(classifyError(new Error("Canceled"))).toBe("expected");
    expect(classifyError(new Error("Timed out after 120s"))).toBe("expected");
    expect(
      classifyError(Object.assign(new Error("zodish"), { name: "ZodError", issues: [] })),
    ).toBe("expected");
    expect(
      classifyError(Object.assign(new Error("bad png"), { name: "InputValidationError" })),
    ).toBe("expected");
  });
  it("operational: connectivity, disk, perms, operational SafeError, marker-copied SafeError without kind", () => {
    const pg = Object.assign(new Error("Failed query: q"), {
      cause: Object.assign(new Error("57P01"), { code: "57P01" }),
    });
    expect(classifyError(pg)).toBe("operational");
    expect(classifyError(Object.assign(new Error("full"), { code: "ENOSPC" }))).toBe("operational");
    expect(classifyError(new SafeError("AI dispatcher exited", { kind: "operational" }))).toBe(
      "operational",
    );
    expect(classifyError(Object.assign(new Error("copied"), { isSafeMessage: true }))).toBe(
      "operational",
    );
  });
  it("bug: everything else, including bug-kind SafeError and ReplyError", () => {
    expect(classifyError(new Error("undefined is not a function"))).toBe("bug");
    expect(classifyError(new SafeError("Impossible state", { kind: "bug" }))).toBe("bug");
    expect(classifyError(Object.assign(new Error("ERR bad cmd"), { name: "ReplyError" }))).toBe(
      "bug",
    );
  });
  it("worker source: zod is a bug (schema drift) and bare resets are operational", () => {
    const zod = Object.assign(new Error("z"), { name: "ZodError", issues: [] });
    expect(classifyError(zod, "worker")).toBe("bug");
    expect(classifyError(zod, "http")).toBe("expected");
    const reset = Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" });
    expect(classifyError(reset, "worker")).toBe("operational");
    expect(classifyError(reset, "http")).toBe("expected");
  });
});

describe("throttle", () => {
  beforeEach(() => resetThrottleForTests());
  it("operational: 1 per signature per hour; bug: 10", () => {
    expect(shouldReport("operational", "sig-a")).toBe(true);
    expect(shouldReport("operational", "sig-a")).toBe(false);
    expect(shouldReport("operational", "sig-b")).toBe(true);
    for (let i = 0; i < 10; i++) expect(shouldReport("bug", "sig-c")).toBe(true);
    expect(shouldReport("bug", "sig-c")).toBe(false);
  });
  it("window resets after an hour", () => {
    expect(shouldReport("operational", "sig", 1_000)).toBe(true);
    expect(shouldReport("operational", "sig", 2_000)).toBe(false);
    expect(shouldReport("operational", "sig", 1_000 + 3_600_001)).toBe(true);
  });
  it("same signature under different classes throttles independently", () => {
    expect(shouldReport("operational", "sig-x")).toBe(true);
    expect(shouldReport("bug", "sig-x")).toBe(true);
  });
});

describe("errorSignature", () => {
  it("combines name, code, and first in-repo frame", () => {
    const err = Object.assign(new Error("x"), { code: "EACCES" });
    err.stack =
      "Error: x\n  at mkdir (node:fs:1)\n  at startCleanupCron (/app/apps/api/src/lib/cleanup.ts:48:3)";
    expect(errorSignature(err)).toBe("Error:EACCES:cleanup.ts:48");
  });
  it("degrades gracefully without stack or code", () => {
    expect(errorSignature(new TypeError("t"))).toMatch(/^TypeError:-:/);
    expect(errorSignature(null)).toBe("Unknown:-:-");
  });
});
