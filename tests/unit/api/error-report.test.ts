import { SafeError, ToolInputError } from "@snapotter/shared";
import { beforeEach, describe, expect, it } from "vitest";
import {
  classifyError,
  errorSignature,
  isQueueEventsJobFailure,
  isUpstreamError,
  markQueueEventsJobFailure,
  markUpstreamError,
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
    expect(
      classifyError(
        Object.assign(new Error("bad png"), { name: "InputValidationError", statusCode: 400 }),
      ),
    ).toBe("expected");
  });
  it("operational: connectivity, disk, perms, operational SafeError, marker-copied SafeError without kind, 5xx InputValidationError", () => {
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
    expect(
      classifyError(
        Object.assign(new Error("engine down"), { name: "InputValidationError", statusCode: 503 }),
      ),
    ).toBe("operational");
  });
  it("operational: a pg system error means a damaged data directory (#4202)", () => {
    // 58P01 undefined_file: Postgres cannot open a relation file, so the data
    // directory is damaged or unreadable. That is the operator's environment,
    // and it used to fall through to "bug" and report at error level.
    const err = Object.assign(new Error("Failed query: select * from jobs"), {
      name: "DrizzleQueryError",
      cause: Object.assign(new Error("pg 58P01 mdopenfork"), {
        code: "58P01",
        severity: "ERROR",
        routine: "mdopenfork",
      }),
    });
    expect(classifyError(err, "cron")).toBe("operational");
  });
  it("operational: a worker fetch with no route to the network (ENETUNREACH, #1992)", () => {
    const err = new TypeError("fetch failed", {
      cause: Object.assign(new Error("connect ENETUNREACH 10.0.0.1:443"), {
        code: "ENETUNREACH",
      }),
    });
    expect(classifyError(err, "worker")).toBe("operational");
  });
  it("operational: S3 socket and connection TimeoutError rejections with $metadata and no code (#2774)", () => {
    const socketTimeout = Object.assign(
      new Error(
        "@smithy/node-http-handler - the request socket timed out after 30000 ms of inactivity",
      ),
      { name: "TimeoutError", $metadata: { attempts: 3 } },
    );
    const connTimeout = Object.assign(
      new Error(
        "@smithy/node-http-handler - the request socket did not establish a connection with the server within the configured timeout of 10000 ms.",
      ),
      { name: "TimeoutError", $metadata: { attempts: 3 } },
    );
    for (const err of [socketTimeout, connTimeout]) {
      expect(classifyError(err, "cron")).toBe("operational");
      expect(classifyError(err, "worker")).toBe("operational");
      expect(classifyError(err, "http")).toBe("operational");
      expect(classifyError(err)).toBe("operational");
    }
    const noSuchKey = Object.assign(new Error("The specified key does not exist."), {
      name: "NoSuchKey",
      $metadata: { httpStatusCode: 404 },
    });
    expect(classifyError(noSuchKey, "cron")).toBe("bug");
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
  it("operational: storage quotas (EDQUOT) and permissions (EPERM on fs syscalls)", () => {
    expect(classifyError(Object.assign(new Error("quota"), { code: "EDQUOT" }))).toBe(
      "operational",
    );
    expect(
      classifyError(Object.assign(new Error("perm"), { code: "EPERM", syscall: "open" })),
    ).toBe("operational");
    expect(
      classifyError(Object.assign(new Error("perm"), { code: "EPERM", syscall: "mkdir" })),
    ).toBe("operational");

    // EPERM without an fs syscall (like process.kill) is our bug
    expect(
      classifyError(Object.assign(new Error("kill perm"), { code: "EPERM", syscall: "kill" })),
    ).toBe("bug");
    expect(classifyError(Object.assign(new Error("no syscall"), { code: "EPERM" }))).toBe("bug");
  });
  it("bug: everything else, including bug-kind SafeError and ReplyError", () => {
    expect(classifyError(new Error("undefined is not a function"))).toBe("bug");
    expect(classifyError(new SafeError("Impossible state", { kind: "bug" }))).toBe("bug");
    expect(classifyError(Object.assign(new Error("ERR bad cmd"), { name: "ReplyError" }))).toBe(
      "bug",
    );
  });
  it("a bare ENOENT stays a bug: only the worker input read knows a missing file is not ours (#901)", () => {
    // A missing file anywhere else usually means our code built a wrong path,
    // so ENOENT is deliberately NOT an operational code. The worker's input
    // loader translates the one case it can vouch for into an operational
    // SafeError (INPUT_MISSING), which classifies through the SafeError rule.
    const raw = Object.assign(new Error("ENOENT: no such file or directory, open '/x'"), {
      code: "ENOENT",
      syscall: "open",
    });
    expect(classifyError(raw, "worker")).toBe("bug");
    const translated = new SafeError("Input file is no longer available. Upload it again.", {
      kind: "operational",
      code: "INPUT_MISSING",
      statusCode: 410,
      cause: raw,
    });
    expect(classifyError(translated, "worker")).toBe("operational");
  });
  it.each([
    ["ENOENT", "spawn"],
    ["ENOEXEC", "spawn"],
    ["ENOMEM", "spawn"],
    ["ENOTDIR", "spawn /usr/bin/qpdf"],
    ["ENOENT", "spawnSync /usr/bin/qpdf"],
    ["ENOEXEC", "spawnSync /usr/bin/qpdf"],
    ["EACCES", "spawnSync /usr/bin/qpdf"],
  ])(
    "classifies a binary spawn failure (%s, %s) as operational while keeping non-spawn errnos a bug (#2937)",
    (code, syscall) => {
      const spawnErr = Object.assign(new Error(`spawn /usr/bin/qpdf ${code}`), {
        code,
        syscall,
        path: "/usr/bin/qpdf",
      });
      expect(classifyError(spawnErr, "worker")).toBe("operational");
      expect(classifyError(spawnErr, "http")).toBe("operational");
      expect(classifyError(spawnErr)).toBe("operational");
    },
  );
  it("keeps non-spawn ENOTDIR and ENOMEM errnos classified as bug (#2937)", () => {
    const openEnotdir = Object.assign(new Error("ENOTDIR: not a directory, open '/x/y'"), {
      code: "ENOTDIR",
      syscall: "open",
    });
    const readEnomem = Object.assign(new Error("ENOMEM: not enough memory, read"), {
      code: "ENOMEM",
      syscall: "read",
    });
    expect(classifyError(openEnotdir, "worker")).toBe("bug");
    expect(classifyError(readEnomem, "worker")).toBe("bug");
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
  it("operational: a BullMQ UnrecoverableError or reconstructed stall/lock-loss Error is a strained instance, not our bug (#3698)", () => {
    // BullMQ raises UnrecoverableError from its own worker loop when a job loses
    // its lock (a stall), e.g. a heavy `upscale` under CPU/memory pressure, and
    // QueueEvents reconstructs failedReason as a plain Error on the waitForJob
    // side. Both mean the instance could not keep the job's lock alive:
    // environmental, worth one warning/hour not bug spam (NODE-27, #3698).
    // A ReplyError (a real Redis command failure) stays a bug.
    const stalled = Object.assign(new Error("Missing lock for job 42. moveToFinished"), {
      name: "UnrecoverableError",
    });
    expect(classifyError(stalled, "worker")).toBe("operational");
    expect(classifyError(stalled)).toBe("operational");

    for (const msg of [
      "Missing lock for job 42. moveToFinished",
      "Missing lock for job 1 moveToFinished",
      "job stalled more than allowable limit",
      "job started more than allowable limit",
    ]) {
      expect(classifyError(new Error(msg), "http")).toBe("operational");
      expect(classifyError(new Error(msg), "worker")).toBe("operational");
    }
  });
  it("expected on http: a stripped QueueEvents job-failure Error tagged by waitForJob is not double-reported as an http bug (#3791)", () => {
    const stripped503 = markQueueEventsJobFailure(
      new Error("The server's storage service is unavailable."),
    );
    const stripped422 = markQueueEventsJobFailure(new Error("Start is past the end"));
    const strippedWorkerConn = markQueueEventsJobFailure(
      new Error("connect ECONNREFUSED 127.0.0.1:5432"),
    );
    expect(isQueueEventsJobFailure(stripped503)).toBe(true);
    expect(isQueueEventsJobFailure(stripped422)).toBe(true);
    expect(isQueueEventsJobFailure(strippedWorkerConn)).toBe(true);
    expect(classifyError(stripped503, "http")).toBe("expected");
    expect(classifyError(stripped422, "http")).toBe("expected");
    expect(classifyError(strippedWorkerConn, "http")).toBe("expected");
    expect(classifyError(stripped503)).toBe("expected");
    expect(classifyError(stripped503, "worker")).toBe("bug");

    // Direct Redis/client errors (including codeless ioredis connection/timeout errors) and BullMQ stall errors are not tagged.
    const redisConn = markQueueEventsJobFailure(
      Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:6379"), { code: "ECONNREFUSED" }),
    );
    const redisReset = markQueueEventsJobFailure(
      Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET", syscall: "read" }),
    );
    const redisClosed = markQueueEventsJobFailure(new Error("Connection is closed."));
    const redisCmdTimeout = markQueueEventsJobFailure(new Error("Command timed out"));
    const replyOom = markQueueEventsJobFailure(
      Object.assign(new Error("OOM command not allowed when used memory > 'maxmemory'."), {
        name: "ReplyError",
      }),
    );
    const replyBug = markQueueEventsJobFailure(
      Object.assign(new Error("ERR unknown command"), { name: "ReplyError" }),
    );
    const stallErr = markQueueEventsJobFailure(new Error("job stalled more than allowable limit"));
    expect(isQueueEventsJobFailure(redisConn)).toBe(false);
    expect(isQueueEventsJobFailure(redisReset)).toBe(false);
    expect(isUpstreamError(redisReset)).toBe(true);
    expect(isQueueEventsJobFailure(redisClosed)).toBe(false);
    expect(isQueueEventsJobFailure(redisCmdTimeout)).toBe(false);
    expect(isQueueEventsJobFailure(replyOom)).toBe(false);
    expect(isQueueEventsJobFailure(replyBug)).toBe(false);
    expect(isQueueEventsJobFailure(stallErr)).toBe(false);
    expect(classifyError(redisConn, "http")).toBe("operational");
    expect(classifyError(redisReset, "http")).toBe("operational");
    expect(classifyError(redisReset)).toBe("operational");
    expect(classifyError(replyOom, "http")).toBe("operational");
    expect(classifyError(replyBug, "http")).toBe("bug");
    expect(classifyError(stallErr, "http")).toBe("operational");
  });
  it("operational on http: Postgres/Drizzle ECONNRESET chains and markUpstreamError-tagged resets are not misclassified as client aborts (#3697)", () => {
    const pgReset = Object.assign(new Error("read ECONNRESET"), {
      name: "PostgresError",
      code: "ECONNRESET",
      syscall: "read",
    });
    const drizzleReset = Object.assign(new Error("Failed query: select 1"), {
      code: "ECONNRESET",
    });
    const drizzleWrappedAbort = Object.assign(new Error("Failed query: select 1"), {
      cause: Object.assign(new Error("aborted"), { code: "ECONNRESET" }),
    });
    for (const err of [pgReset, drizzleReset, drizzleWrappedAbort]) {
      expect(classifyError(err, "http")).toBe("operational");
      expect(classifyError(err)).toBe("operational");
    }

    const innerReset = Object.assign(new Error("read ECONNRESET"), {
      code: "ECONNRESET",
      syscall: "read",
    });
    const wrappedUpstream = markUpstreamError(
      Object.assign(new Error("read ECONNRESET"), {
        name: "UnrecoverableError",
        cause: innerReset,
      }),
    );
    expect(isUpstreamError(wrappedUpstream)).toBe(true);
    expect(isUpstreamError(innerReset)).toBe(true);
    expect(classifyError(wrappedUpstream, "http")).toBe("operational");
    expect(classifyError(innerReset, "http")).toBe("operational");

    const queueEventsTagged = markUpstreamError(
      markQueueEventsJobFailure(new Error("connect ECONNREFUSED 127.0.0.1:5432")),
    );
    expect(isUpstreamError(queueEventsTagged)).toBe(false);
    expect(classifyError(queueEventsTagged, "http")).toBe("expected");

    const prematureClose = markUpstreamError(
      Object.assign(new Error("Premature close"), { code: "ERR_STREAM_PREMATURE_CLOSE" }),
    );
    const abortErr = markUpstreamError(
      Object.assign(new Error("The operation was aborted"), { name: "AbortError" }),
    );
    expect(isUpstreamError(prematureClose)).toBe(false);
    expect(isUpstreamError(abortErr)).toBe(false);
    expect(classifyError(prematureClose, "http")).toBe("expected");
    expect(classifyError(abortErr, "http")).toBe("expected");

    expect(markUpstreamError("not-an-error")).toBe("not-an-error");
    expect(isUpstreamError("not-an-error")).toBe(false);
    const plainBug = markUpstreamError(new Error("boom"));
    expect(isUpstreamError(plainBug)).toBe(false);
  });
  it("looks through an UnrecoverableError with a cause so non-retryable worker errors keep their class (#1176)", () => {
    const wrap = (cause: Error) =>
      Object.assign(new Error(cause.message), { name: "UnrecoverableError", cause });

    expect(
      classifyError(wrap(new ToolInputError("remote resources are disabled: x")), "worker"),
    ).toBe("expected");
    expect(
      classifyError(
        wrap(
          Object.assign(new Error("bad png"), { name: "InputValidationError", statusCode: 422 }),
        ),
        "worker",
      ),
    ).toBe("expected");
    expect(
      classifyError(
        wrap(
          Object.assign(new Error("engine down"), {
            name: "InputValidationError",
            statusCode: 503,
          }),
        ),
        "worker",
      ),
    ).toBe("operational");
    const inputMissing = new SafeError("Input file is no longer available. Upload it again.", {
      kind: "operational",
      code: "INPUT_MISSING",
      statusCode: 410,
      cause: Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
    });
    expect(classifyError(wrap(inputMissing), "worker")).toBe("operational");
    expect(classifyError(wrap(new Error("unexpected crash")), "worker")).toBe("bug");
  });
  it("trusts a SafeError over client-abort shapes in its cause chain (#1643)", () => {
    const s3Reset = Object.assign(new Error("aborted"), {
      name: "TimeoutError",
      code: "ECONNRESET",
      $metadata: { attempts: 3 },
    });
    const prematureClose = Object.assign(new Error("Premature close"), {
      code: "ERR_STREAM_PREMATURE_CLOSE",
    });
    const operationalReset = new SafeError("The server's storage service is unavailable.", {
      kind: "operational",
      code: "storage-unavailable",
      statusCode: 503,
      cause: s3Reset,
    });
    const operationalPremature = new SafeError("The server's storage service is unavailable.", {
      kind: "operational",
      code: "storage-unavailable",
      statusCode: 503,
      cause: prematureClose,
    });
    const bugWrappedAbort = new SafeError("Unexpected internal failure", {
      kind: "bug",
      cause: new Error("aborted"),
    });

    expect(classifyError(operationalReset, "http")).toBe("operational");
    expect(classifyError(operationalReset)).toBe("operational");
    expect(classifyError(operationalPremature, "http")).toBe("operational");
    expect(classifyError(bugWrappedAbort, "http")).toBe("bug");
  });
});

describe("classifyError undici", () => {
  // A firewalled upstream that drops packets surfaces through fetch as a
  // "fetch failed" TypeError whose cause carries undici's connect timeout (#1908).
  it.each([
    ["UND_ERR_CONNECT_TIMEOUT", "Connect Timeout Error"],
    ["UND_ERR_SOCKET", "other side closed"],
  ])("treats a fetch failure caused by %s as operational on every source", (code, msg) => {
    const err = new TypeError("fetch failed", { cause: Object.assign(new Error(msg), { code }) });
    expect(classifyError(err, "worker")).toBe("operational");
    expect(classifyError(err, "http")).toBe("operational");
  });
});

describe("classifyError redis", () => {
  it("classifies a Redis OOM ReplyError as operational", () => {
    const err = Object.assign(new Error("OOM command not allowed"), { name: "ReplyError" });
    expect(classifyError(err, "worker")).toBe("operational");
  });
  it("classifies a Redis READONLY ReplyError as operational", () => {
    const err = Object.assign(new Error("READONLY You can't write"), { name: "ReplyError" });
    expect(classifyError(err, "worker")).toBe("operational");
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
  it("tells wrappers apart by their cause's name (#1628)", () => {
    const wrap = (causeName: string) => {
      const cause = new Error("decoder");
      cause.name = causeName;
      const err = Object.assign(new Error("x", { cause }), { code: "ENGINE_UNAVAILABLE" });
      err.stack =
        "Error: x\n  at engineUnavailable (/app/apps/api/src/modality/image-input.ts:214:5)";
      return err;
    };
    expect(errorSignature(wrap("DecoderOutOfMemoryError"))).toBe(
      "Error:ENGINE_UNAVAILABLE:image-input.ts:214:DecoderOutOfMemoryError",
    );
    expect(errorSignature(wrap("DecoderUnavailableError"))).not.toBe(
      errorSignature(wrap("DecoderOutOfMemoryError")),
    );
  });
  it("unwraps an UnrecoverableError with a cause so the signature matches the underlying error (#1176)", () => {
    const inner = new SafeError("Input file is no longer available. Upload it again.", {
      kind: "operational",
      code: "INPUT_MISSING",
      statusCode: 410,
      cause: Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
    });
    inner.stack =
      "SafeError: Input file is no longer available.\n  at loadToolInputs (/app/apps/api/src/jobs/worker.ts:207:11)";
    const wrapped = Object.assign(new Error(inner.message), {
      name: "UnrecoverableError",
      cause: inner,
    });
    expect(errorSignature(wrapped)).toBe(errorSignature(inner));
  });
  it("normalizes reconstructed BullMQ stall Errors to UnrecoverableError in the signature (#3698)", () => {
    const reconstructed = new Error("Missing lock for job 42. moveToFinished");
    reconstructed.stack =
      "Error: Missing lock for job 42. moveToFinished\n  at Job.onFailed (bullmq/job.js:913:1)";
    const workerStall = Object.assign(new Error("Missing lock for job 42. moveToFinished"), {
      name: "UnrecoverableError",
      stack:
        "UnrecoverableError: Missing lock for job 42. moveToFinished\n  at Worker.processJob (bullmq/worker.js:594:1)",
    });
    expect(errorSignature(reconstructed)).toBe("UnrecoverableError:-:-");
    expect(errorSignature(reconstructed)).toBe(errorSignature(workerStall));
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
