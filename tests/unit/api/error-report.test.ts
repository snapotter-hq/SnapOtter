import { SafeError, ToolInputError } from "@snapotter/shared";
import { beforeEach, describe, expect, it } from "vitest";
import {
  classifyError,
  errorSignature,
  resetThrottleForTests,
  safeFormatTag,
  shouldReport,
  vetSettings,
} from "../../../apps/api/src/lib/error-report.js";

describe("safeFormatTag", () => {
  it("returns the lowercase extension as a safe, non-PII tag", () => {
    expect(safeFormatTag("photo.JPEG")).toBe("jpeg");
    expect(safeFormatTag("doc.pdf")).toBe("pdf");
    expect(safeFormatTag("clip.final.mp4")).toBe("mp4");
  });
  it("returns undefined when there is no plausible extension", () => {
    expect(safeFormatTag(undefined)).toBeUndefined();
    expect(safeFormatTag("noext")).toBeUndefined();
    expect(safeFormatTag("weird.name-with-dashes")).toBeUndefined();
  });
});

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
  it("operational: environmental database errors (auth, permission, resources), not query bugs", () => {
    // The deployment's DB is misconfigured or starved -- the operator's
    // environment, not our code. These flooded the bug view as pg auth /
    // permission failures from background sweeps (NODE-1G/1F/1D).
    expect(
      classifyError(Object.assign(new Error("password authentication failed"), { code: "28P01" })),
    ).toBe("operational");
    // drizzle wraps the pg error, so the SQLSTATE is on the cause, not the top level.
    expect(
      classifyError(
        Object.assign(new Error("Failed query: DELETE FROM jobs"), {
          cause: Object.assign(new Error("permission denied for relation jobs"), { code: "42501" }),
        }),
      ),
    ).toBe("operational");
    expect(
      classifyError(Object.assign(new Error("no space left on device"), { code: "53100" })),
    ).toBe("operational");
    // A pg SYNTAX error is our query bug, not the environment -- must stay a bug.
    expect(
      classifyError(Object.assign(new Error("syntax error at or near"), { code: "42601" })),
    ).toBe("bug");
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
  it("InputValidationError is a user 400 wherever it surfaces, not only on http", () => {
    // Tools throw InputValidationError from processV2 in the worker (e.g.
    // sprite-sheet "Provide at least two images"); it must not be logged as a bug.
    const e = Object.assign(new Error("Provide at least two images"), {
      name: "InputValidationError",
    });
    expect(classifyError(e, "worker")).toBe("expected");
    expect(classifyError(e, "cron")).toBe("expected");
    expect(classifyError(e, "http")).toBe("expected");
    expect(classifyError(e)).toBe("expected");
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

describe("vetSettings", () => {
  it("keeps numbers, booleans, and short enum-like string values", () => {
    expect(vetSettings({ quality: 80, lossless: true, format: "png", fit: "cover" })).toEqual({
      quality: 80,
      lossless: true,
      format: "png",
      fit: "cover",
    });
  });
  it("drops sensitive keys, free-text/PII-shaped values, objects and arrays", () => {
    // A password, a filename, and watermark text must never reach Sentry; nested
    // objects/arrays and long strings can carry user data, so drop them too.
    expect(
      vetSettings({
        password: "hunter2",
        filename: "IMG_1234.png",
        watermarkText: "Property of Jane",
        crop: { x: 1, y: 2 },
        sizes: [1, 2, 3],
        width: 1024,
        format: "webp",
      }),
    ).toEqual({ width: 1024, format: "webp" });
  });
  it("returns undefined for non-objects and when nothing safe survives", () => {
    expect(vetSettings(undefined)).toBeUndefined();
    expect(vetSettings("nope")).toBeUndefined();
    expect(vetSettings([1, 2])).toBeUndefined();
    expect(
      vetSettings({ note: "a long free-text field well beyond the safe length" }),
    ).toBeUndefined();
  });
});
