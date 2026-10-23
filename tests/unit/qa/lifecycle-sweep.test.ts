import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";

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
const loginMock = vi.fn();

vi.mock("node:child_process", () => ({
  execFile: execFileMock,
}));

vi.mock("../../qa/lib/container.js", () => ({
  login: loginMock,
  QaClient: class FakeQaClient {
    submit = submitMock;
    raw = rawMock;
  },
}));

async function runCancelSweep(scenario: CancelCaseScenario): Promise<{
  checks: SweepCheck[];
  exitCode: number | undefined;
}> {
  const outDir = mkdtempSync(join(tmpdir(), "snapotter-lifecycle-sweep-"));
  const origArgv = process.argv;
  /* biome-ignore-start lint/suspicious/noUndeclaredEnvVars: QA harness env vars */
  const origPassword = process.env.QA_PASSWORD;
  const origOutDir = process.env.QA_OUT_DIR;

  process.argv = ["node", "lifecycle-sweep.mts", "cancel"];
  process.env.QA_PASSWORD = "test-password";
  process.env.QA_OUT_DIR = outDir;
  /* biome-ignore-end lint/suspicious/noUndeclaredEnvVars: QA harness env vars */

  loginMock.mockResolvedValue({ token: "test-token" });

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

  const customExec = (execFileMock as unknown as Record<symbol, ReturnType<typeof vi.fn>>)[
    promisify.custom
  ];
  customExec.mockImplementation(async (_cmd: string, args: string[]) => {
    const query = args[args.length - 1] ?? "";
    const match = query.match(/where id = '([^']+)'/u);
    const jobId = match?.[1] ?? "";
    const entry = byJobId.get(jobId);
    if (!entry) return { stdout: "\n", stderr: "" };
    const states = Array.isArray(entry.cfg.dbState) ? entry.cfg.dbState : [entry.cfg.dbState];
    const state = states[Math.min(entry.pollCount++, states.length - 1)] ?? "";
    return { stdout: `${state}\n`, stderr: "" };
  });

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

afterEach(() => {
  vi.restoreAllMocks();
  submitMock.mockReset();
  rawMock.mockReset();
  loginMock.mockReset();
});

describe("lifecycle-sweep checkCancellation", () => {
  it("passes both checks when cancel returns canceled=true and rows settle to canceled", async () => {
    const { checks, exitCode } = await runCancelSweep({
      beforeStart: { body: { canceled: true }, dbState: ["queued", "canceled"] },
      inFlight: { body: { canceled: true }, dbState: ["processing", "cancelled"] },
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
      inFlight: { body: { canceled: true }, dbState: "canceled" },
    });
    expect(completedRun.checks.find((c) => c.id === "cancel-before-start")?.verdict).toBe("fail");
    expect(completedRun.exitCode).toBe(1);

    const failedRun = await runCancelSweep({
      beforeStart: { body: { canceled: true }, dbState: "failed" },
      inFlight: { body: { canceled: true }, dbState: "canceled" },
    });
    expect(failedRun.checks.find((c) => c.id === "cancel-before-start")?.verdict).toBe("fail");
    expect(failedRun.exitCode).toBe(1);
  });

  it("fails cancel-before-start when the cancel endpoint does not report canceled=true or returns non-200", async () => {
    const falseRun = await runCancelSweep({
      beforeStart: { body: { canceled: false }, dbState: "canceled" },
      inFlight: { body: { canceled: true }, dbState: "canceled" },
    });
    expect(falseRun.checks.find((c) => c.id === "cancel-before-start")?.verdict).toBe("fail");

    const missingRun = await runCancelSweep({
      beforeStart: { body: "not-json", dbState: "canceled" },
      inFlight: { body: { canceled: true }, dbState: "canceled" },
    });
    const missingCheck = missingRun.checks.find((c) => c.id === "cancel-before-start");
    expect(missingCheck?.verdict).toBe("fail");
    expect(missingCheck?.detail).toContain("invalid(not-json)");

    const statusRun = await runCancelSweep({
      beforeStart: { httpStatus: 500, body: { canceled: true }, dbState: "canceled" },
      inFlight: { body: { canceled: true }, dbState: "canceled" },
    });
    expect(statusRun.checks.find((c) => c.id === "cancel-before-start")?.verdict).toBe("fail");
  });

  it("fails cancel-in-flight when the job settles to failed or contradicts body.canceled", async () => {
    const failedRun = await runCancelSweep({
      beforeStart: { body: { canceled: true }, dbState: "canceled" },
      inFlight: { body: { canceled: true }, dbState: "failed" },
    });
    expect(failedRun.checks.find((c) => c.id === "cancel-in-flight")?.verdict).toBe("fail");
    expect(failedRun.exitCode).toBe(1);

    const contradictedCompletedRun = await runCancelSweep({
      beforeStart: { body: { canceled: true }, dbState: "canceled" },
      inFlight: { body: { canceled: true }, dbState: "completed" },
    });
    expect(contradictedCompletedRun.checks.find((c) => c.id === "cancel-in-flight")?.verdict).toBe(
      "fail",
    );

    const contradictedCanceledRun = await runCancelSweep({
      beforeStart: { body: { canceled: true }, dbState: "canceled" },
      inFlight: { body: { canceled: false }, dbState: "canceled" },
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

  it("allows cancel-in-flight to settle to completed when the job finished before cancel landed", async () => {
    const { checks, exitCode } = await runCancelSweep({
      beforeStart: { body: { canceled: true }, dbState: "canceled" },
      inFlight: { body: { canceled: false }, dbState: "completed" },
    });

    expect(exitCode).toBe(0);
    expect(checks.find((c) => c.id === "cancel-in-flight")?.verdict).toBe("pass");
  });

  it("reports blocked when submit returns no jobId", async () => {
    const { checks, exitCode } = await runCancelSweep({
      beforeStart: { jobId: undefined, dbState: "" },
      inFlight: { body: { canceled: true }, dbState: "canceled" },
    });

    expect(exitCode).toBe(0);
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
