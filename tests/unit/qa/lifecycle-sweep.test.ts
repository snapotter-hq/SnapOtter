import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SubmitOutcome, SubmitRequest } from "../../qa/lib/container.js";
import type { OutputFacts } from "../../qa/lib/oracles.js";

interface SweepCheck {
  id: string;
  verdict: "pass" | "fail" | "blocked";
  detail: string;
}

interface CancelCaseConfig {
  httpStatus?: number;
  body?: unknown;
  dbState: string | string[];
  jobId?: string;
}

interface CancelCaseScenario {
  beforeStart: CancelCaseConfig;
  inFlight: CancelCaseConfig;
}

const execFileMock = vi.fn();
(execFileMock as unknown as Record<symbol, unknown>)[promisify.custom] = vi.fn();

const submitMock = vi.fn();
const rawMock = vi.fn();
const followProgressMock = vi.fn();
const downloadMock = vi.fn();
const loginMock = vi.fn();
const inspectOutputMock = vi.fn();

vi.mock("node:child_process", () => ({
  execFile: execFileMock,
}));

vi.mock("../../qa/lib/container.js", () => ({
  login: loginMock,
  QaClient: class FakeQaClient {
    submit = submitMock;
    raw = rawMock;
    followProgress = followProgressMock;
    download = downloadMock;
  },
}));

vi.mock("../../qa/lib/oracles.js", () => ({
  inspectOutput: inspectOutputMock,
}));

async function executeSweep(selectedCases: string[]): Promise<{
  checks: SweepCheck[];
  exitCode: number | undefined;
}> {
  const outDir = mkdtempSync(join(tmpdir(), "snapotter-lifecycle-sweep-"));
  const origArgv = process.argv;
  /* biome-ignore-start lint/suspicious/noUndeclaredEnvVars: QA harness env vars */
  const origPassword = process.env.QA_PASSWORD;
  const origOutDir = process.env.QA_OUT_DIR;

  process.argv = ["node", "lifecycle-sweep.mts", ...selectedCases];
  process.env.QA_PASSWORD = "test-password";
  process.env.QA_OUT_DIR = outDir;
  /* biome-ignore-end lint/suspicious/noUndeclaredEnvVars: QA harness env vars */

  loginMock.mockResolvedValue({ token: "test-token" });

  const exitPromise = new Promise<number | undefined>((resolve) => {
    vi.spyOn(process, "exit").mockImplementation(((code?: string | number | null) => {
      const numeric = typeof code === "number" ? code : Number(code ?? 0);
      resolve(numeric);
      return undefined as never;
    }) as never);
  });

  const origSetTimeout = globalThis.setTimeout;
  vi.spyOn(globalThis, "setTimeout").mockImplementation(((cb: () => void) => {
    queueMicrotask(cb);
    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout);

  try {
    vi.resetModules();
    await import("../../qa/lifecycle-sweep.mjs");
    const exitCode = await exitPromise;
    const reportJson = JSON.parse(readFileSync(join(outDir, "lifecycle.json"), "utf8")) as {
      checks: SweepCheck[];
    };
    return { checks: reportJson.checks, exitCode };
  } finally {
    globalThis.setTimeout = origSetTimeout;
    process.argv = origArgv;
    /* biome-ignore-start lint/suspicious/noUndeclaredEnvVars: QA harness env vars */
    if (origPassword === undefined) delete process.env.QA_PASSWORD;
    else process.env.QA_PASSWORD = origPassword;
    if (origOutDir === undefined) delete process.env.QA_OUT_DIR;
    else process.env.QA_OUT_DIR = origOutDir;
    /* biome-ignore-end lint/suspicious/noUndeclaredEnvVars: QA harness env vars */
    rmSync(outDir, { recursive: true, force: true });
  }
}

function getCustomExec(): ReturnType<typeof vi.fn> {
  return (execFileMock as unknown as Record<symbol, ReturnType<typeof vi.fn>>)[promisify.custom];
}

async function runCancelSweep(scenario: CancelCaseScenario): Promise<{
  checks: SweepCheck[];
  exitCode: number | undefined;
}> {
  const cases = [
    { config: scenario.beforeStart, defaultJobId: "job-before-start" },
    { config: scenario.inFlight, defaultJobId: "job-in-flight" },
  ];
  let submitIndex = 0;
  submitMock.mockImplementation(async () => {
    const entry = cases[submitIndex++];
    const jobId = "jobId" in entry.config ? entry.config.jobId : entry.defaultJobId;
    return {
      httpStatus: jobId ? 202 : 503,
      async: Boolean(jobId),
      jobId,
      sseFrames: [],
      durationMs: 1,
    };
  });

  const byJobId = new Map<string, { cfg: CancelCaseConfig; pollCount: number }>();
  if (scenario.beforeStart.jobId !== "") {
    byJobId.set(scenario.beforeStart.jobId ?? "job-before-start", {
      cfg: scenario.beforeStart,
      pollCount: 0,
    });
  }
  if (scenario.inFlight.jobId !== "") {
    byJobId.set(scenario.inFlight.jobId ?? "job-in-flight", {
      cfg: scenario.inFlight,
      pollCount: 0,
    });
  }

  rawMock.mockImplementation(async (path: string) => {
    const match = path.match(/\/api\/v1\/jobs\/([^/]+)\/cancel$/u);
    const jobId = match?.[1] ?? "";
    const entry = byJobId.get(jobId);
    const status = entry?.cfg.httpStatus ?? 200;
    const payload = entry && "body" in entry.cfg ? entry.cfg.body : { canceled: true };
    return new Response(typeof payload === "string" ? payload : JSON.stringify(payload), {
      status,
      headers: { "content-type": "application/json" },
    });
  });

  getCustomExec().mockImplementation(async (_cmd: string, args: string[]) => {
    const query = args[args.length - 1] ?? "";
    const match = query.match(/where id = '([^']+)'/u);
    const jobId = match?.[1] ?? "";
    const entry = byJobId.get(jobId);
    if (!entry) return { stdout: "\n", stderr: "" };
    const states = Array.isArray(entry.cfg.dbState) ? entry.cfg.dbState : [entry.cfg.dbState];
    const state = states[Math.min(entry.pollCount++, states.length - 1)] ?? "";
    return { stdout: `${state}\n`, stderr: "" };
  });

  return executeSweep(["cancel"]);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  submitMock.mockReset();
  rawMock.mockReset();
  followProgressMock.mockReset();
  downloadMock.mockReset();
  loginMock.mockReset();
  inspectOutputMock.mockReset();
  getCustomExec().mockReset();
});

describe("lifecycle-sweep checkAsyncContract", () => {
  const validFacts: OutputFacts = {
    bytes: 128,
    sha256: "abc",
    signature: "ISOBMFF",
    kind: "video",
    media: { formatName: "mp4", durationS: 1.5, streams: [{ type: "video", codec: "h264" }] },
  };

  function makeAsyncOutcome(overrides: Partial<SubmitOutcome> = {}): SubmitOutcome {
    return {
      path: "/api/v1/tools/video/compress-video",
      httpStatus: 202,
      responseContentType: "application/json",
      async: true,
      jobId: "async-job-1",
      bytes: Buffer.from("mp4-bytes"),
      outputFilename: "out.mp4",
      sseFrames: [
        { raw: '{"percent":25}', data: { percent: 25 }, atMs: 1 },
        { raw: '{"percent":100}', data: { percent: 100 }, atMs: 2 },
      ],
      asyncOutcome: "complete",
      durationMs: 10,
      ...overrides,
    };
  }

  it("passes when percents are non-empty monotonic and DB row status is completed", async () => {
    submitMock.mockResolvedValue(makeAsyncOutcome());
    inspectOutputMock.mockResolvedValue(validFacts);
    getCustomExec().mockResolvedValue({ stdout: "completed\n", stderr: "" });

    const { checks, exitCode } = await executeSweep(["async"]);
    expect(exitCode).toBe(0);
    expect(checks).toEqual([
      expect.objectContaining({ id: "async-202-contract", verdict: "pass" }),
    ]);
  });

  it("fails when jobs row status is not completed", async () => {
    submitMock.mockResolvedValue(makeAsyncOutcome());
    inspectOutputMock.mockResolvedValue(validFacts);
    getCustomExec().mockResolvedValue({ stdout: "processing\n", stderr: "" });

    const { checks, exitCode } = await executeSweep(["async"]);
    expect(exitCode).toBe(1);
    expect(checks).toEqual([
      expect.objectContaining({ id: "async-202-contract", verdict: "fail" }),
    ]);
  });

  it("fails when SSE frames contain no numeric percent values", async () => {
    submitMock.mockResolvedValue(
      makeAsyncOutcome({
        sseFrames: [{ raw: '{"phase":"complete"}', data: { phase: "complete" }, atMs: 1 }],
      }),
    );
    inspectOutputMock.mockResolvedValue(validFacts);
    getCustomExec().mockResolvedValue({ stdout: "completed\n", stderr: "" });

    const { checks, exitCode } = await executeSweep(["async"]);
    expect(exitCode).toBe(1);
    expect(checks).toEqual([
      expect.objectContaining({ id: "async-202-contract", verdict: "fail" }),
    ]);
  });

  it("fails when decoded output lacks positive media duration", async () => {
    submitMock.mockResolvedValue(makeAsyncOutcome());
    inspectOutputMock.mockResolvedValue({
      ...validFacts,
      media: { formatName: "mp4", durationS: null, streams: [{ type: "video", codec: "h264" }] },
    });
    getCustomExec().mockResolvedValue({ stdout: "completed\n", stderr: "" });

    const { checks, exitCode } = await executeSweep(["async"]);
    expect(exitCode).toBe(1);
    expect(checks).toEqual([
      expect.objectContaining({ id: "async-202-contract", verdict: "fail" }),
    ]);
  });

  it("fails when SSE percents decrease or decoded output has decodeError", async () => {
    submitMock.mockResolvedValue(
      makeAsyncOutcome({
        sseFrames: [
          { raw: '{"percent":50}', data: { percent: 50 }, atMs: 1 },
          { raw: '{"percent":25}', data: { percent: 25 }, atMs: 2 },
          { raw: '{"percent":100}', data: { percent: 100 }, atMs: 3 },
        ],
      }),
    );
    inspectOutputMock.mockResolvedValue(validFacts);
    getCustomExec().mockResolvedValue({ stdout: "completed\n", stderr: "" });

    const nonMonotonicRun = await executeSweep(["async"]);
    expect(nonMonotonicRun.exitCode).toBe(1);
    expect(nonMonotonicRun.checks).toEqual([
      expect.objectContaining({ id: "async-202-contract", verdict: "fail" }),
    ]);

    submitMock.mockResolvedValue(makeAsyncOutcome());
    inspectOutputMock.mockResolvedValue({
      ...validFacts,
      decodeError: "ffprobe found no streams",
    });
    getCustomExec().mockResolvedValue({ stdout: "completed\n", stderr: "" });

    const decodeErrRun = await executeSweep(["async"]);
    expect(decodeErrRun.exitCode).toBe(1);
    expect(decodeErrRun.checks).toEqual([
      expect.objectContaining({ id: "async-202-contract", verdict: "fail" }),
    ]);
  });
});

describe("lifecycle-sweep checkSseReconnectAndIdempotency", () => {
  function setupSseMocks(firstResponse: Response): void {
    submitMock.mockResolvedValue({
      path: "/api/v1/tools/video/compress-video",
      httpStatus: 202,
      responseContentType: "application/json",
      async: false,
      jobId: "sse-job-1",
      sseFrames: [],
      durationMs: 1,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(firstResponse));
    followProgressMock.mockResolvedValue({
      outcome: "complete",
      frames: [{ raw: '{"phase":"complete"}', data: { phase: "complete" }, atMs: 1 }],
    });
  }

  it("passes when the first SSE connection returns 200 with a readable chunk before reconnect", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"percent":10}\n\n'));
      },
    });
    setupSseMocks(new Response(stream, { status: 200 }));

    const { checks, exitCode } = await executeSweep(["sse"]);
    expect(exitCode).toBe(0);
    expect(checks).toEqual([
      expect.objectContaining({ id: "sse-reconnect", verdict: "pass" }),
      expect.objectContaining({ id: "sse-terminal-idempotency", verdict: "pass" }),
    ]);
  });

  it("fails sse-reconnect when the first SSE connection returns non-200 or no bytes", async () => {
    setupSseMocks(new Response("unauthorized", { status: 401 }));
    const nonOkRun = await executeSweep(["sse"]);
    expect(nonOkRun.exitCode).toBe(1);
    expect(nonOkRun.checks.find((c) => c.id === "sse-reconnect")?.verdict).toBe("fail");

    const emptyStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close();
      },
    });
    setupSseMocks(new Response(emptyStream, { status: 200 }));
    const emptyReadRun = await executeSweep(["sse"]);
    expect(emptyReadRun.exitCode).toBe(1);
    expect(emptyReadRun.checks.find((c) => c.id === "sse-reconnect")?.verdict).toBe("fail");

    submitMock.mockResolvedValue({
      path: "/api/v1/tools/video/compress-video",
      httpStatus: 202,
      responseContentType: "application/json",
      async: false,
      jobId: "sse-job-1",
      sseFrames: [],
      durationMs: 1,
    });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("socket reset")));
    followProgressMock.mockResolvedValue({
      outcome: "complete",
      frames: [{ raw: '{"phase":"complete"}', data: { phase: "complete" }, atMs: 1 }],
    });
    const rejectedFetchRun = await executeSweep(["sse"]);
    expect(rejectedFetchRun.exitCode).toBe(1);
    expect(rejectedFetchRun.checks.find((c) => c.id === "sse-reconnect")?.verdict).toBe("fail");
    expect(rejectedFetchRun.checks.find((c) => c.id === "sse-terminal-idempotency")?.verdict).toBe(
      "pass",
    );
  });
});

describe("lifecycle-sweep checkCancellation", () => {
  it("passes both checks when cancel returns canceled=true and rows settle to canceled", async () => {
    const { checks, exitCode } = await runCancelSweep({
      beforeStart: { body: { canceled: true }, dbState: ["queued", "canceled"] },
      inFlight: { body: { canceled: true }, dbState: ["queued", "processing", "cancelled"] },
    });

    expect(exitCode).toBe(0);
    expect(checks).toEqual([
      expect.objectContaining({ id: "cancel-before-start", verdict: "pass" }),
      expect.objectContaining({ id: "cancel-in-flight", verdict: "pass" }),
    ]);
  });

  it("fails cancel-before-start when the job settles to completed or failed", async () => {
    const completedRun = await runCancelSweep({
      beforeStart: { body: { canceled: true }, dbState: "completed" },
      inFlight: { body: { canceled: true }, dbState: ["processing", "canceled"] },
    });
    expect(completedRun.checks.find((c) => c.id === "cancel-before-start")?.verdict).toBe("fail");
    expect(completedRun.exitCode).toBe(1);

    const failedRun = await runCancelSweep({
      beforeStart: { body: { canceled: true }, dbState: "failed" },
      inFlight: { body: { canceled: true }, dbState: ["processing", "canceled"] },
    });
    expect(failedRun.checks.find((c) => c.id === "cancel-before-start")?.verdict).toBe("fail");
    expect(failedRun.exitCode).toBe(1);
  });

  it("fails cancel-before-start when the cancel endpoint does not report canceled=true or returns non-200", async () => {
    const falseRun = await runCancelSweep({
      beforeStart: { body: { canceled: false }, dbState: "canceled" },
      inFlight: { body: { canceled: true }, dbState: ["processing", "canceled"] },
    });
    expect(falseRun.checks.find((c) => c.id === "cancel-before-start")?.verdict).toBe("fail");

    const missingRun = await runCancelSweep({
      beforeStart: { body: "not-json", dbState: "canceled" },
      inFlight: { body: { canceled: true }, dbState: ["processing", "canceled"] },
    });
    const missingCheck = missingRun.checks.find((c) => c.id === "cancel-before-start");
    expect(missingCheck?.verdict).toBe("fail");
    expect(missingCheck?.detail).toContain("invalid(not-json)");

    const statusRun = await runCancelSweep({
      beforeStart: { httpStatus: 500, body: { canceled: true }, dbState: "canceled" },
      inFlight: { body: { canceled: true }, dbState: ["processing", "canceled"] },
    });
    expect(statusRun.checks.find((c) => c.id === "cancel-before-start")?.verdict).toBe("fail");
  });

  it("fails cancel-in-flight when the job settles to failed or contradicts body.canceled", async () => {
    const failedRun = await runCancelSweep({
      beforeStart: { body: { canceled: true }, dbState: "canceled" },
      inFlight: { body: { canceled: true }, dbState: ["processing", "failed"] },
    });
    expect(failedRun.checks.find((c) => c.id === "cancel-in-flight")?.verdict).toBe("fail");
    expect(failedRun.exitCode).toBe(1);

    const contradictedCompletedRun = await runCancelSweep({
      beforeStart: { body: { canceled: true }, dbState: "canceled" },
      inFlight: { body: { canceled: true }, dbState: ["processing", "completed"] },
    });
    expect(contradictedCompletedRun.checks.find((c) => c.id === "cancel-in-flight")?.verdict).toBe(
      "fail",
    );

    const contradictedCanceledRun = await runCancelSweep({
      beforeStart: { body: { canceled: true }, dbState: "canceled" },
      inFlight: { body: { canceled: false }, dbState: ["processing", "canceled"] },
    });
    expect(contradictedCanceledRun.checks.find((c) => c.id === "cancel-in-flight")?.verdict).toBe(
      "fail",
    );
  });

  it("fails both checks when a job never leaves processing across the polling window", async () => {
    const stuckRun = await runCancelSweep({
      beforeStart: { body: { canceled: true }, dbState: "queued" },
      inFlight: { body: { canceled: true }, dbState: "processing" },
    });

    expect(stuckRun.exitCode).toBe(1);
    expect(stuckRun.checks).toEqual([
      expect.objectContaining({ id: "cancel-before-start", verdict: "fail" }),
      expect.objectContaining({ id: "cancel-in-flight", verdict: "fail" }),
    ]);
  });

  it("fails cancel-in-flight when the job never enters processing or when cancel returns canceled=false on a running job that completes", async () => {
    const neverStartedRun = await runCancelSweep({
      beforeStart: { body: { canceled: true }, dbState: "canceled" },
      inFlight: { body: { canceled: true }, dbState: "queued" },
    });
    expect(neverStartedRun.exitCode).toBe(1);
    const neverStartedCheck = neverStartedRun.checks.find((c) => c.id === "cancel-in-flight");
    expect(neverStartedCheck?.verdict).toBe("fail");
    expect(neverStartedCheck?.detail).toContain(
      'did not enter processing before cancel (pre-cancel status="queued")',
    );
    expect(rawMock).toHaveBeenCalledTimes(1);

    const alreadyTerminalRun = await runCancelSweep({
      beforeStart: { body: { canceled: true }, dbState: "canceled" },
      inFlight: { body: { canceled: true }, dbState: "canceled" },
    });
    expect(alreadyTerminalRun.exitCode).toBe(1);
    expect(alreadyTerminalRun.checks.find((c) => c.id === "cancel-in-flight")?.verdict).toBe(
      "fail",
    );

    const ignoredCancelRun = await runCancelSweep({
      beforeStart: { body: { canceled: true }, dbState: "canceled" },
      inFlight: { body: { canceled: false }, dbState: ["processing", "completed"] },
    });
    expect(ignoredCancelRun.exitCode).toBe(1);
    expect(ignoredCancelRun.checks.find((c) => c.id === "cancel-in-flight")?.verdict).toBe("fail");
  });

  it("reports blocked and exits non-zero when submit returns no jobId", async () => {
    const { checks, exitCode } = await runCancelSweep({
      beforeStart: { jobId: undefined, dbState: "" },
      inFlight: { body: { canceled: true }, dbState: ["processing", "canceled"] },
    });

    expect(exitCode).toBe(1);
    expect(checks.find((c) => c.id === "cancel-before-start")?.verdict).toBe("blocked");
    expect(checks.find((c) => c.id === "cancel-in-flight")?.verdict).toBe("pass");
  });

  it("describes checkPipeline as a 3-step image pipeline rather than cross-modality", () => {
    const source = readFileSync(join(import.meta.dirname, "../../qa/lifecycle-sweep.mts"), "utf8");
    const pipelineMatch = source.match(
      /\/\*\*([\s\S]*?)\*\/\s*\nasync function checkPipeline\(\)/u,
    );
    expect(pipelineMatch?.[1]).toContain("3-step image pipeline");
    expect(pipelineMatch?.[1]).not.toContain("crosses modalities");
  });
});

describe("lifecycle-sweep checkPoolIsolation", () => {
  it("passes when all 3 video submissions return 202 with jobIds and the image job returns 200", async () => {
    let videoIndex = 0;
    submitMock.mockImplementation(async (req: SubmitRequest) => {
      if (req.path.includes("/video/")) {
        videoIndex++;
        return {
          path: req.path,
          httpStatus: 202,
          responseContentType: "application/json",
          async: false,
          jobId: `video-job-${videoIndex}`,
          sseFrames: [],
          durationMs: 1,
        };
      }
      return {
        path: req.path,
        httpStatus: 200,
        responseContentType: "image/png",
        async: false,
        bytes: Buffer.from("png"),
        sseFrames: [],
        durationMs: 5,
      };
    });

    const { checks, exitCode } = await executeSweep(["pools"]);
    expect(exitCode).toBe(0);
    expect(checks).toEqual([expect.objectContaining({ id: "pool-isolation", verdict: "pass" })]);
  });

  it("fails when any video submission does not return 202 with a jobId", async () => {
    let videoIndex = 0;
    submitMock.mockImplementation(async (req: SubmitRequest) => {
      if (req.path.includes("/video/")) {
        videoIndex++;
        return {
          path: req.path,
          httpStatus: videoIndex === 2 ? 500 : 202,
          responseContentType: "application/json",
          async: false,
          jobId: `video-job-${videoIndex}`,
          sseFrames: [],
          durationMs: 1,
        };
      }
      return {
        path: req.path,
        httpStatus: 200,
        responseContentType: "image/png",
        async: false,
        bytes: Buffer.from("png"),
        sseFrames: [],
        durationMs: 5,
      };
    });

    const badStatusRun = await executeSweep(["pools"]);
    expect(badStatusRun.exitCode).toBe(1);
    expect(badStatusRun.checks).toEqual([
      expect.objectContaining({ id: "pool-isolation", verdict: "fail" }),
    ]);

    videoIndex = 0;
    submitMock.mockImplementation(async (req: SubmitRequest) => {
      if (req.path.includes("/video/")) {
        videoIndex++;
        return {
          path: req.path,
          httpStatus: 202,
          responseContentType: "application/json",
          async: false,
          jobId: videoIndex === 2 ? undefined : `video-job-${videoIndex}`,
          sseFrames: [],
          durationMs: 1,
        };
      }
      return {
        path: req.path,
        httpStatus: 200,
        responseContentType: "image/png",
        async: false,
        bytes: Buffer.from("png"),
        sseFrames: [],
        durationMs: 5,
      };
    });

    const missingJobIdRun = await executeSweep(["pools"]);
    expect(missingJobIdRun.exitCode).toBe(1);
    expect(missingJobIdRun.checks).toEqual([
      expect.objectContaining({ id: "pool-isolation", verdict: "fail" }),
    ]);
  });
});

describe("lifecycle-sweep checkBatch", () => {
  it("passes when all batch archive members are non-empty and in input order", async () => {
    submitMock.mockResolvedValue({
      path: "/api/v1/tools/image/resize/batch",
      httpStatus: 200,
      responseContentType: "application/zip",
      async: false,
      bytes: Buffer.from("zip"),
      sseFrames: [],
      durationMs: 10,
    });
    inspectOutputMock.mockResolvedValue({
      bytes: 100,
      sha256: "zip-sha",
      signature: "ZIP",
      kind: "zip",
      zip: {
        count: 3,
        members: [
          { name: "batch-0-sample.png", size: 10 },
          { name: "batch-1-sample.jpg", size: 12 },
          { name: "batch-2-sample.png", size: 10 },
        ],
      },
    });

    const { checks, exitCode } = await executeSweep(["batch"]);
    expect(exitCode).toBe(0);
    expect(checks).toEqual([expect.objectContaining({ id: "batch-zip", verdict: "pass" })]);
  });

  it("fails when batch archive members do not preserve input order", async () => {
    submitMock.mockResolvedValue({
      path: "/api/v1/tools/image/resize/batch",
      httpStatus: 200,
      responseContentType: "application/zip",
      async: false,
      bytes: Buffer.from("zip"),
      sseFrames: [],
      durationMs: 10,
    });
    inspectOutputMock.mockResolvedValue({
      bytes: 100,
      sha256: "zip-sha",
      signature: "ZIP",
      kind: "zip",
      zip: {
        count: 3,
        members: [
          { name: "batch-1-sample.jpg", size: 12 },
          { name: "batch-0-sample.png", size: 10 },
          { name: "batch-2-sample.png", size: 10 },
        ],
      },
    });

    const { checks, exitCode } = await executeSweep(["batch"]);
    expect(exitCode).toBe(1);
    expect(checks).toEqual([expect.objectContaining({ id: "batch-zip", verdict: "fail" })]);

    inspectOutputMock.mockResolvedValue({
      bytes: 100,
      sha256: "zip-sha",
      signature: "ZIP",
      kind: "zip",
      decodeError: "zip parse failed: truncated",
      zip: {
        count: 3,
        members: [
          { name: "batch-0-sample.png", size: 10 },
          { name: "batch-1-sample.jpg", size: 12 },
          { name: "batch-2-sample.png", size: 10 },
        ],
      },
    });
    const decodeErrRun = await executeSweep(["batch"]);
    expect(decodeErrRun.exitCode).toBe(1);
    const decodeErrCheck = decodeErrRun.checks.find((c) => c.id === "batch-zip");
    expect(decodeErrCheck?.verdict).toBe("fail");
    expect(decodeErrCheck?.detail).toContain("decodeError=zip parse failed: truncated");
  });
});

describe("lifecycle-sweep checkPipelineCrossModality", () => {
  it("passes when async terminal failure or sync 4xx has no stack trace", async () => {
    submitMock.mockResolvedValue({
      path: "/api/v1/pipeline/execute",
      httpStatus: 202,
      responseContentType: "application/json",
      async: true,
      jobId: "pipe-cross-1",
      asyncOutcome: "failed",
      asyncError: "Input file is not a valid PDF document",
      sseFrames: [],
      durationMs: 10,
    });

    const { checks, exitCode } = await executeSweep(["pipeline-cross"]);
    expect(exitCode).toBe(0);
    expect(checks).toEqual([
      expect.objectContaining({ id: "pipeline-incoherent-steps", verdict: "pass" }),
    ]);

    submitMock.mockResolvedValue({
      path: "/api/v1/pipeline/execute",
      httpStatus: 422,
      responseContentType: "application/json",
      async: false,
      json: { error: "Input file is not a valid PDF document" },
      sseFrames: [],
      durationMs: 10,
    });

    const syncCleanRun = await executeSweep(["pipeline-cross"]);
    expect(syncCleanRun.exitCode).toBe(0);
    expect(syncCleanRun.checks).toEqual([
      expect.objectContaining({ id: "pipeline-incoherent-steps", verdict: "pass" }),
    ]);
  });

  it("fails when async or sync failure leaks a stack trace, has empty error, or hits SSE HTTP error", async () => {
    submitMock.mockResolvedValue({
      path: "/api/v1/pipeline/execute",
      httpStatus: 202,
      responseContentType: "application/json",
      async: true,
      jobId: "pipe-cross-2",
      asyncOutcome: "failed",
      asyncError: "Error: qpdf crashed\n    at decodePdf (/app/index.js:42:11)",
      sseFrames: [],
      durationMs: 10,
    });

    const { checks, exitCode } = await executeSweep(["pipeline-cross"]);
    expect(exitCode).toBe(1);
    expect(checks).toEqual([
      expect.objectContaining({ id: "pipeline-incoherent-steps", verdict: "fail" }),
    ]);

    submitMock.mockResolvedValue({
      path: "/api/v1/pipeline/execute",
      httpStatus: 422,
      responseContentType: "application/json",
      async: false,
      json: {
        error: "Pipeline failed",
        details: "Error: qpdf crashed\n    at decodePdf (/app/index.js:42:11)",
      },
      sseFrames: [],
      durationMs: 10,
    });
    const syncDetailsStackRun = await executeSweep(["pipeline-cross"]);
    expect(syncDetailsStackRun.exitCode).toBe(1);
    expect(syncDetailsStackRun.checks).toEqual([
      expect.objectContaining({ id: "pipeline-incoherent-steps", verdict: "fail" }),
    ]);

    submitMock.mockResolvedValue({
      path: "/api/v1/pipeline/execute",
      httpStatus: 422,
      responseContentType: "application/json",
      async: false,
      bodyText: "   ",
      sseFrames: [],
      durationMs: 10,
    });
    const emptyErrRun = await executeSweep(["pipeline-cross"]);
    expect(emptyErrRun.exitCode).toBe(1);
    expect(emptyErrRun.checks).toEqual([
      expect.objectContaining({ id: "pipeline-incoherent-steps", verdict: "fail" }),
    ]);

    submitMock.mockResolvedValue({
      path: "/api/v1/pipeline/execute",
      httpStatus: 202,
      responseContentType: "application/json",
      async: true,
      jobId: "pipe-cross-3",
      asyncOutcome: "failed",
      asyncError: "SSE returned 500",
      sseFrames: [],
      durationMs: 10,
    });
    const sseErrorRun = await executeSweep(["pipeline-cross"]);
    expect(sseErrorRun.exitCode).toBe(1);
    expect(sseErrorRun.checks).toEqual([
      expect.objectContaining({ id: "pipeline-incoherent-steps", verdict: "fail" }),
    ]);
  });
});

describe("lifecycle-sweep checkWorkerRestartRecovery", () => {
  function setupRestartScenario(opts: {
    beforeState: string;
    afterState: string;
    stuckStdout: string;
  }): void {
    submitMock.mockResolvedValue({
      path: "/api/v1/tools/pdf/ocr-pdf",
      httpStatus: 202,
      responseContentType: "application/json",
      async: false,
      jobId: "restart-job-1",
      sseFrames: [],
      durationMs: 1,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("ok", { status: 200 })));

    let jobStatePolls = 0;
    getCustomExec().mockImplementation(async (_cmd: string, args: string[]) => {
      if (args[0] === "restart") return { stdout: "", stderr: "" };
      const query = args[args.length - 1] ?? "";
      if (query.includes("select count(*)")) {
        return { stdout: opts.stuckStdout, stderr: "" };
      }
      jobStatePolls++;
      const state = jobStatePolls === 1 ? opts.beforeState : opts.afterState;
      return { stdout: `${state}\n`, stderr: "" };
    });
  }

  it("passes both checks when before is active, after is terminal, and stuck count is 0", async () => {
    setupRestartScenario({
      beforeState: "processing",
      afterState: "failed",
      stuckStdout: "0\n",
    });

    const { checks, exitCode } = await executeSweep(["restart"]);
    expect(exitCode).toBe(0);
    expect(checks).toEqual([
      expect.objectContaining({ id: "worker-restart-recovery", verdict: "pass" }),
      expect.objectContaining({ id: "stale-job-reconciliation", verdict: "pass" }),
    ]);
  });

  it("fails worker-restart-recovery when the job was already terminal before container restart", async () => {
    setupRestartScenario({
      beforeState: "completed",
      afterState: "completed",
      stuckStdout: "0\n",
    });

    const { checks, exitCode } = await executeSweep(["restart"]);
    expect(exitCode).toBe(1);
    expect(checks.find((c) => c.id === "worker-restart-recovery")?.verdict).toBe("fail");
  });

  it("fails stale-job-reconciliation when psql returns empty stdout or a non-zero stuck count, and fails worker-restart-recovery when afterState stays processing", async () => {
    setupRestartScenario({
      beforeState: "processing",
      afterState: "failed",
      stuckStdout: "\n",
    });

    const { checks, exitCode } = await executeSweep(["restart"]);
    expect(exitCode).toBe(1);
    expect(checks.find((c) => c.id === "stale-job-reconciliation")?.verdict).toBe("fail");

    setupRestartScenario({
      beforeState: "processing",
      afterState: "failed",
      stuckStdout: "2\n",
    });

    const nonZeroStuckRun = await executeSweep(["restart"]);
    expect(nonZeroStuckRun.exitCode).toBe(1);
    expect(nonZeroStuckRun.checks.find((c) => c.id === "stale-job-reconciliation")?.verdict).toBe(
      "fail",
    );

    setupRestartScenario({
      beforeState: "processing",
      afterState: "processing",
      stuckStdout: "0\n",
    });

    const stuckAfterRun = await executeSweep(["restart"]);
    expect(stuckAfterRun.exitCode).toBe(1);
    expect(stuckAfterRun.checks.find((c) => c.id === "worker-restart-recovery")?.verdict).toBe(
      "fail",
    );
  });
});

describe("lifecycle-sweep checkUnknownJobProgress", () => {
  it("passes when followProgress returns failed for an unknown job id", async () => {
    followProgressMock.mockResolvedValue({
      outcome: "failed",
      error: "SSE returned 404",
      frames: [],
    });

    const { checks, exitCode } = await executeSweep(["unknown-job"]);
    expect(exitCode).toBe(0);
    expect(checks).toEqual([
      expect.objectContaining({ id: "unknown-job-progress", verdict: "pass" }),
    ]);
  });

  it("fails when followProgress times out on an unknown job id", async () => {
    followProgressMock.mockResolvedValue({
      outcome: "timeout",
      frames: [],
    });

    const { checks, exitCode } = await executeSweep(["unknown-job"]);
    expect(exitCode).toBe(1);
    expect(checks).toEqual([
      expect.objectContaining({ id: "unknown-job-progress", verdict: "fail" }),
    ]);
  });
});
