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
