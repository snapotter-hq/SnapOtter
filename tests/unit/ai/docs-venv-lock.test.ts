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

const ORIGINAL_VENV_PATH = process.env.PYTHON_VENV_PATH;
const ORIGINAL_DOCS_VENV_PATH = process.env.DOCS_PYTHON_VENV_PATH;

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
 * Document jobs must not queue behind a bundle install when they run from a
 * venv the install never writes (the image's baked /opt/venv). A job that
 * shares the install venv still has to wait, since the install rewrites the
 * native libraries it would load.
 */
describe("document jobs and the AI venv lock", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.mocked(spawn).mockReset();
    vi.mocked(spawn).mockImplementation(() => createMockProcess());
    vi.mocked(existsSync).mockReset();
    vi.mocked(existsSync).mockReturnValue(true);
    process.env.PYTHON_VENV_PATH = "/data/ai/venv";
    delete process.env.DOCS_PYTHON_VENV_PATH;
  });

  afterEach(async () => {
    const { shutdownDocsDispatcher } = await import("../../../packages/ai/src/bridge.js");
    await shutdownDocsDispatcher();
    if (ORIGINAL_VENV_PATH === undefined) delete process.env.PYTHON_VENV_PATH;
    else process.env.PYTHON_VENV_PATH = ORIGINAL_VENV_PATH;
    if (ORIGINAL_DOCS_VENV_PATH === undefined) delete process.env.DOCS_PYTHON_VENV_PATH;
    else process.env.DOCS_PYTHON_VENV_PATH = ORIGINAL_DOCS_VENV_PATH;
  });

  it("runs from a separate docs venv while an install holds the writer lock", async () => {
    process.env.DOCS_PYTHON_VENV_PATH = "/opt/venv";
    const { runDocsScript } = await import("../../../packages/ai/src/bridge.js");
    const { acquireVenvLock } = await import("../../../packages/ai/src/venv-lock.js");

    const releaseInstall = await acquireVenvLock();
    const controller = new AbortController();
    const pending = runDocsScript(
      "doc_html_pdf",
      { path: "in.html", out: "out.pdf", mode: "html" },
      { signal: controller.signal },
    );

    await vi.waitFor(() => expect(spawn).toHaveBeenCalled());
    for (const call of vi.mocked(spawn).mock.calls) {
      expect(String(call[0])).toBe("/opt/venv/bin/python3");
    }

    controller.abort();
    await expect(pending).rejects.toThrow();
    releaseInstall();
  });

  it("waits for an install that holds the venv the docs jobs share", async () => {
    const { runDocsScript } = await import("../../../packages/ai/src/bridge.js");
    const { acquireVenvLock } = await import("../../../packages/ai/src/venv-lock.js");

    const releaseInstall = await acquireVenvLock();
    const controller = new AbortController();
    const pending = runDocsScript(
      "doc_html_pdf",
      { path: "in.html", out: "out.pdf", mode: "html" },
      { signal: controller.signal },
    );

    expect(spawn).not.toHaveBeenCalled();

    releaseInstall();
    await vi.waitFor(() => expect(spawn).toHaveBeenCalled());
    expect(String(vi.mocked(spawn).mock.calls[0]?.[0])).toBe("/data/ai/venv/bin/python3");

    controller.abort();
    await expect(pending).rejects.toThrow();
  });

  it("rejects a job cancelled while it waits for the install (#4201)", async () => {
    const { runDocsScript } = await import("../../../packages/ai/src/bridge.js");
    const { acquireVenvLock } = await import("../../../packages/ai/src/venv-lock.js");

    const releaseInstall = await acquireVenvLock();
    const controller = new AbortController();
    const pending = runDocsScript(
      "doc_html_pdf",
      { path: "in.html", out: "out.pdf", mode: "html" },
      { signal: controller.signal },
    );

    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError", code: "canceled" });
    expect(spawn).not.toHaveBeenCalled();

    releaseInstall();
    // The cancelled job left no reader behind, so a second install is not held up.
    const releaseNext = await acquireVenvLock();
    releaseNext();
    expect(spawn).not.toHaveBeenCalled();
  });

  it("keeps the lock when the docs venv is the install target", async () => {
    process.env.DOCS_PYTHON_VENV_PATH = "/data/ai/venv";
    const { runDocsScript } = await import("../../../packages/ai/src/bridge.js");
    const { acquireVenvLock } = await import("../../../packages/ai/src/venv-lock.js");

    const releaseInstall = await acquireVenvLock();
    const controller = new AbortController();
    const pending = runDocsScript(
      "doc_html_pdf",
      { path: "in.html", out: "out.pdf", mode: "html" },
      { signal: controller.signal },
    );

    expect(spawn).not.toHaveBeenCalled();

    controller.abort();
    releaseInstall();
    await expect(pending).rejects.toThrow();
    expect(spawn).not.toHaveBeenCalled();
  });
});

/**
 * The caller's timeout covers the whole call, so time spent queued behind an
 * install counts against it (#4601).
 */
describe("python call timeout and the venv lock wait", () => {
  const ORIGINAL_PROCESSING_TIMEOUT = process.env.PROCESSING_TIMEOUT_S;

  function perRequestProcess(): ChildProcess | undefined {
    const index = vi
      .mocked(spawn)
      .mock.calls.findIndex((call) => String(call[1]?.[0]).endsWith("doc_html_pdf.py"));
    return index === -1 ? undefined : (vi.mocked(spawn).mock.results[index]?.value as ChildProcess);
  }

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.mocked(spawn).mockReset();
    vi.mocked(spawn).mockImplementation(() => createMockProcess());
    vi.mocked(existsSync).mockReset();
    vi.mocked(existsSync).mockReturnValue(true);
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
    if (ORIGINAL_PROCESSING_TIMEOUT === undefined) delete process.env.PROCESSING_TIMEOUT_S;
    else process.env.PROCESSING_TIMEOUT_S = ORIGINAL_PROCESSING_TIMEOUT;
  });

  it("times out a call whose whole budget goes on waiting for the install", async () => {
    const { runDocsScript } = await import("../../../packages/ai/src/bridge.js");
    const { acquireVenvLock } = await import("../../../packages/ai/src/venv-lock.js");

    const releaseInstall = await acquireVenvLock();
    const pending = runDocsScript(
      "doc_html_pdf",
      { path: "in.html", out: "out.pdf", mode: "html" },
      { timeoutMs: 1000 },
    );
    const outcome = pending.catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(1000);
    expect(await outcome).toMatchObject({ code: "timeout" });
    expect(spawn).not.toHaveBeenCalled();

    releaseInstall();
    // The timed-out call left no reader behind.
    const releaseNext = await acquireVenvLock();
    releaseNext();
    expect(spawn).not.toHaveBeenCalled();
  });

  it("gives the script only what is left of the budget after the wait", async () => {
    const { runDocsScript } = await import("../../../packages/ai/src/bridge.js");
    const { acquireVenvLock } = await import("../../../packages/ai/src/venv-lock.js");

    const releaseInstall = await acquireVenvLock();
    const controller = new AbortController();
    const pending = runDocsScript(
      "doc_html_pdf",
      { path: "in.html", out: "out.pdf", mode: "html" },
      { timeoutMs: 1000, signal: controller.signal },
    );
    const outcome = pending.catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(600);
    releaseInstall();
    await vi.advanceTimersByTimeAsync(0);
    const proc = perRequestProcess();
    expect(proc).toBeDefined();

    await vi.advanceTimersByTimeAsync(399);
    expect(proc?.kill).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(proc?.kill).toHaveBeenCalledWith("SIGTERM");

    controller.abort();
    await outcome;
  });

  it("never times out the wait when PROCESSING_TIMEOUT_S=0 makes calls unlimited", async () => {
    process.env.PROCESSING_TIMEOUT_S = "0";
    const { runDocsScript } = await import("../../../packages/ai/src/bridge.js");
    const { acquireVenvLock } = await import("../../../packages/ai/src/venv-lock.js");

    const releaseInstall = await acquireVenvLock();
    const controller = new AbortController();
    let settled = false;
    const pending = runDocsScript(
      "doc_html_pdf",
      { path: "in.html", out: "out.pdf", mode: "html" },
      { timeoutMs: 1000, signal: controller.signal },
    ).finally(() => {
      settled = true;
    });
    const outcome = pending.catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(settled).toBe(false);

    controller.abort();
    expect(await outcome).toMatchObject({ name: "AbortError", code: "canceled" });
    releaseInstall();
  });
});
