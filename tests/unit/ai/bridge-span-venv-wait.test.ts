import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    existsSync: vi.fn(),
  };
});

const otel = vi.hoisted(() => {
  const span = {
    end: vi.fn(),
    setStatus: vi.fn(),
    recordException: vi.fn(),
  };
  return { span, startSpan: vi.fn(() => span) };
});

// A parent span is always "active" so run() opens a sidecar.execute span.
vi.mock("@opentelemetry/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@opentelemetry/api")>();
  return {
    ...actual,
    trace: {
      ...actual.trace,
      getActiveSpan: () => ({}),
      getTracer: () => ({ startSpan: otel.startSpan }),
    },
  };
});

const ORIGINAL_VENV_PATH = process.env.PYTHON_VENV_PATH;
const ORIGINAL_DOCS_VENV_PATH = process.env.DOCS_PYTHON_VENV_PATH;
const ORIGINAL_PROCESSING_TIMEOUT = process.env.PROCESSING_TIMEOUT_S;

function createMockProcess(): ChildProcess {
  const stdin = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  const proc = new EventEmitter() as unknown as ChildProcess;
  Object.assign(proc, {
    stdin,
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    pid: 12345,
    killed: false,
    kill: vi.fn(() => true),
  });
  return proc;
}

/**
 * A call rejected while it waits for the venv lock never reaches the script,
 * but its sidecar.execute span still has to end, marked as an error (#4639).
 */
describe("sidecar.execute span when a call never gets the venv lock", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.mocked(spawn).mockReset();
    vi.mocked(spawn).mockImplementation(() => createMockProcess());
    vi.mocked(existsSync).mockReset();
    vi.mocked(existsSync).mockReturnValue(true);
    otel.startSpan.mockClear();
    otel.span.end.mockClear();
    otel.span.setStatus.mockClear();
    otel.span.recordException.mockClear();
    process.env.PYTHON_VENV_PATH = "/data/ai/venv";
    delete process.env.DOCS_PYTHON_VENV_PATH;
    delete process.env.PROCESSING_TIMEOUT_S;
  });

  afterEach(async () => {
    vi.useRealTimers();
    const { shutdownDocsDispatcher } = await import("../../../packages/ai/src/bridge.js");
    await shutdownDocsDispatcher();
    if (ORIGINAL_VENV_PATH === undefined) delete process.env.PYTHON_VENV_PATH;
    else process.env.PYTHON_VENV_PATH = ORIGINAL_VENV_PATH;
    if (ORIGINAL_DOCS_VENV_PATH === undefined) delete process.env.DOCS_PYTHON_VENV_PATH;
    else process.env.DOCS_PYTHON_VENV_PATH = ORIGINAL_DOCS_VENV_PATH;
    if (ORIGINAL_PROCESSING_TIMEOUT === undefined) delete process.env.PROCESSING_TIMEOUT_S;
    else process.env.PROCESSING_TIMEOUT_S = ORIGINAL_PROCESSING_TIMEOUT;
  });

  it("ends the span with an error when the call is cancelled during the wait", async () => {
    const { runDocsScript } = await import("../../../packages/ai/src/bridge.js");
    const { acquireVenvLock } = await import("../../../packages/ai/src/venv-lock.js");

    const releaseInstall = await acquireVenvLock();
    const controller = new AbortController();
    const pending = runDocsScript(
      "doc_html_pdf",
      { path: "in.html", out: "out.pdf", mode: "html" },
      { signal: controller.signal },
    );
    expect(otel.startSpan).toHaveBeenCalledTimes(1);

    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "canceled" });
    releaseInstall();

    expect(spawn).not.toHaveBeenCalled();
    expect(otel.span.end).toHaveBeenCalledTimes(1);
    expect(otel.span.setStatus).toHaveBeenCalledWith(
      expect.objectContaining({ code: 2, message: expect.stringMatching(/cancel/i) }),
    );
  });

  it("ends the span with an error when the wait uses up the timeout", async () => {
    vi.useFakeTimers();
    const { runDocsScript } = await import("../../../packages/ai/src/bridge.js");
    const { acquireVenvLock } = await import("../../../packages/ai/src/venv-lock.js");

    const releaseInstall = await acquireVenvLock();
    const outcome = runDocsScript(
      "doc_html_pdf",
      { path: "in.html", out: "out.pdf", mode: "html" },
      { timeoutMs: 1000 },
    ).catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(1000);
    expect(await outcome).toMatchObject({ code: "timeout" });
    releaseInstall();

    expect(spawn).not.toHaveBeenCalled();
    expect(otel.span.end).toHaveBeenCalledTimes(1);
    expect(otel.span.setStatus).toHaveBeenCalledWith(
      expect.objectContaining({ code: 2, message: expect.stringMatching(/timed out/i) }),
    );
  });

  it("ends the span once when a call that waited goes on to run", async () => {
    const { runDocsScript } = await import("../../../packages/ai/src/bridge.js");
    const { acquireVenvLock } = await import("../../../packages/ai/src/venv-lock.js");

    const releaseInstall = await acquireVenvLock();
    const controller = new AbortController();
    const pending = runDocsScript(
      "doc_html_pdf",
      { path: "in.html", out: "out.pdf", mode: "html" },
      { signal: controller.signal },
    );

    releaseInstall();
    await vi.waitFor(() => expect(spawn).toHaveBeenCalled());
    expect(otel.span.end).not.toHaveBeenCalled();

    controller.abort();
    await expect(pending).rejects.toThrow();
    expect(otel.span.end).toHaveBeenCalledTimes(1);
  });
});
