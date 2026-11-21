// Issue #4763: a running bundle install could not be canceled. The server now
// cancels by sending the installer SIGINT, which removes the partial download
// and staging tree. The watchdog's SIGTERM still kills it on the spot and keeps
// the partial download, so the retry resumes.
//
// The scenarios live in packages/ai/python/tests/install_cancel_scenario.py.
// The runners have python3 but no pytest, so this spawns them directly.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { hasPython, pythonBin } from "../../helpers/python-gate.js";

const PYTHON_DIR = join(process.cwd(), "packages", "ai", "python");
const INSTALLER = join(PYTHON_DIR, "install_feature.py");
const SCENARIO = join(PYTHON_DIR, "tests", "install_cancel_scenario.py");
const ARCH = process.arch === "arm64" ? "arm64-cpu" : "amd64-gpu";

interface Exit {
  code: number | null;
  signal: NodeJS.Signals | null;
  stderr: string;
}

/** Start an install that stalls mid-download, signal it once it is ready, and wait for the exit. */
function signalStalledInstall(
  scenario: "download" | "venv-write",
  aiDir: string,
  signal: "SIGINT" | "SIGTERM",
): Promise<Exit> {
  return new Promise((resolve, reject) => {
    const child = spawn(pythonBin as string, [SCENARIO, INSTALLER, scenario, aiDir]);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
      if (stdout.includes("READY")) child.kill(signal);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code, signal) => resolve({ code, signal, stderr }));
  });
}

const leftovers = (aiDir: string) => {
  const archive = join(aiDir, "staging", `demo-${ARCH}.tar.gz`);
  return [`${archive}.partial`, `${archive}.meta`, join(aiDir, "staging-demo")].filter((path) =>
    existsSync(path),
  );
};

describe.skipIf(!hasPython)("install_feature.py cancel (#4763)", () => {
  let aiDir = "";

  afterEach(() => {
    if (aiDir) rmSync(aiDir, { recursive: true, force: true });
  });

  it("removes the partial download and staging tree when canceled mid-download", async () => {
    aiDir = mkdtempSync(join(tmpdir(), "snapotter-install-cancel-"));
    const exit = await signalStalledInstall("download", aiDir, "SIGINT");

    expect(exit.signal).toBeNull();
    expect(exit.code).toBe(1);
    expect(exit.stderr).toContain(`"error": "Install canceled"`);
    expect(leftovers(aiDir)).toEqual([]);
  });

  it("dies at once without cleanup when canceled while it holds the venv writer lock", async () => {
    aiDir = mkdtempSync(join(tmpdir(), "snapotter-install-cancel-"));
    const exit = await signalStalledInstall("venv-write", aiDir, "SIGINT");

    // The server refuses to cancel in this phase; if a signal lands anyway,
    // the venv.writing marker and the boot-time reseed own the recovery.
    expect(exit.signal).toBe("SIGINT");
    expect(exit.stderr).not.toContain("Install canceled");
    expect(leftovers(aiDir)).toHaveLength(3);
  });

  it("keeps the partial download for a resume when the watchdog kills it", async () => {
    aiDir = mkdtempSync(join(tmpdir(), "snapotter-install-cancel-"));
    const exit = await signalStalledInstall("download", aiDir, "SIGTERM");

    expect(exit.signal).toBe("SIGTERM");
    expect(exit.stderr).not.toContain("Install canceled");
    expect(leftovers(aiDir)).toHaveLength(3);
  });

  it("keeps an archive the admin supplied through SNAPOTTER_BUNDLE_LOCAL_PATH", () => {
    aiDir = mkdtempSync(join(tmpdir(), "snapotter-install-cancel-"));
    const res = spawnSync(pythonBin as string, [SCENARIO, INSTALLER, "keep-local", aiDir], {
      encoding: "utf8",
      timeout: 20000,
    });
    if (res.status !== 0) throw new Error(`python3 failed: ${res.stderr}`);

    expect(JSON.parse(res.stdout.trim())).toEqual({ kept: true });
    expect(leftovers(aiDir)).toEqual([]);
  });
});
