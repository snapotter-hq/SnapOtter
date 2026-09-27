import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  forkDirName,
  forkDirOwner,
  ORPHAN_MIN_AGE_MS,
  removeOnExit,
  removeOrphanedForkDirs,
} from "../../setup/fork-dir.js";

/**
 * #1004. Every vitest worker made `$TMPDIR/SnapOtter-test-<pid>_<hex>` and
 * nothing removed it: 190 GB on one Mac, 33 GB from two runs on a test box.
 * A worker now removes its own directory on exit, and a sweep clears the
 * directories of workers that died without running that handler.
 */

/** A pid that just exited, so no live process owns it. */
function deadPid(): number {
  const child = spawnSync(process.execPath, ["-e", "process.stdout.write(String(process.pid))"]);
  return Number(child.stdout.toString());
}

let tmp: string;

/** A per-fork directory with a file in it, aged `ageMs` into the past. */
function forkDir(pid: number, ageMs: number): string {
  const dir = path.join(tmp, forkDirName(pid));
  mkdirSync(path.join(dir, "workspace", "uploads"), { recursive: true });
  writeFileSync(path.join(dir, "workspace", "uploads", "input.png"), "x");
  const then = new Date(Date.now() - ageMs);
  utimesSync(dir, then, then);
  return dir;
}

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), "fork-dir-test-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("per-fork workspace names", () => {
  it("reads back the pid a name was made for", () => {
    expect(forkDirOwner(forkDirName(4242))).toBe(4242);
  });

  it("keeps the SnapOtter-test-<pid>_<hex> shape other sweeps rely on", () => {
    expect(forkDirName(4242)).toMatch(/^SnapOtter-test-4242_[0-9a-f]{8}$/);
  });

  it.each([
    "snapotter-test-abc123",
    "SnapOtter-test-",
    "SnapOtter-test-12x_ab",
    "other-4242_deadbeef",
    "SnapOtter-test-4242_deadbeef-extra",
  ])("owns nothing it didn't name: %s", (name) => {
    expect(forkDirOwner(name)).toBeNull();
  });
});

describe("removeOrphanedForkDirs", () => {
  it("removes a dead worker's directory once it's old enough", () => {
    const orphan = forkDir(deadPid(), ORPHAN_MIN_AGE_MS + 60_000);
    expect(removeOrphanedForkDirs(tmp)).toEqual([orphan]);
    expect(existsSync(orphan)).toBe(false);
  });

  it("removes one left two hours ago", () => {
    // Pinned in wall-clock terms, so the floor can't quietly drift to days.
    const orphan = forkDir(deadPid(), 2 * 60 * 60 * 1000);
    expect(removeOrphanedForkDirs(tmp)).toEqual([orphan]);
  });

  it("keeps a live worker's directory however old", () => {
    const live = forkDir(process.pid, ORPHAN_MIN_AGE_MS * 10);
    expect(removeOrphanedForkDirs(tmp)).toEqual([]);
    expect(existsSync(live)).toBe(true);
  });

  it("keeps a young directory even when its pid looks dead", () => {
    // A pid only means something inside its own namespace, so a run in a
    // container sharing this temp dir could look dead from here. The age
    // floor keeps a sweep from ever deleting a workspace in use.
    const young = forkDir(deadPid(), 5_000);
    expect(removeOrphanedForkDirs(tmp)).toEqual([]);
    expect(existsSync(young)).toBe(true);
  });

  it("leaves anything that isn't a per-fork workspace alone", () => {
    const other = path.join(tmp, "snapotter-test-abc123");
    mkdirSync(other);
    const then = new Date(Date.now() - ORPHAN_MIN_AGE_MS * 10);
    utimesSync(other, then, then);
    expect(removeOrphanedForkDirs(tmp)).toEqual([]);
    expect(existsSync(other)).toBe(true);
  });

  it("returns nothing for a temp dir that doesn't exist", () => {
    expect(removeOrphanedForkDirs(path.join(tmp, "missing"))).toEqual([]);
  });

  it("warns when it can't list the temp dir, rather than going quiet", () => {
    const notADir = path.join(tmp, "file");
    writeFileSync(notADir, "x");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(removeOrphanedForkDirs(notADir)).toEqual([]);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(notADir), expect.anything());
    } finally {
      warn.mockRestore();
    }
  });

  it.skipIf(process.getuid?.() === 0)("warns rather than throws when it can't remove one", () => {
    // It runs in global setup: leftover scratch must never fail a test run.
    const orphan = forkDir(deadPid(), ORPHAN_MIN_AGE_MS + 60_000);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    chmodSync(tmp, 0o500);
    try {
      expect(removeOrphanedForkDirs(tmp)).toEqual([]);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(orphan), expect.anything());
    } finally {
      chmodSync(tmp, 0o700);
      warn.mockRestore();
    }
    expect(existsSync(orphan)).toBe(true);
  });
});

/**
 * Stands in for the worker process, recording what it would have signalled and
 * whether `dir` was still there at that moment (a real kill ends the process).
 */
function fakeProcess(dir: string) {
  const kills: [number, string, boolean][] = [];
  const proc = Object.assign(new EventEmitter(), {
    pid: 4242,
    kill: (pid: number, signal: string) => kills.push([pid, signal, existsSync(dir)]),
  });
  return { proc, kills };
}

describe("removeOnExit", () => {
  it("removes the directory, contents and all, when the process exits", () => {
    const dir = forkDir(process.pid, 0);
    const { proc } = fakeProcess(dir);
    removeOnExit(dir, proc);
    expect(existsSync(dir)).toBe(true);
    // Exit handlers can't wait for async work, so the removal must be done by
    // the time the event returns.
    proc.emit("exit", 0);
    expect(existsSync(dir)).toBe(false);
  });

  it("removes the directory on SIGTERM, then re-raises it", () => {
    // Vitest's pool ends each worker with a bare SIGTERM, whose default action
    // skips the exit event entirely; that is how the directories leaked.
    const dir = forkDir(process.pid, 0);
    const { proc, kills } = fakeProcess(dir);
    removeOnExit(dir, proc);
    proc.emit("SIGTERM", "SIGTERM");
    expect(existsSync(dir)).toBe(false);
    // Only once this handler is gone, so the re-raise takes the default action.
    expect(proc.listenerCount("SIGTERM")).toBe(0);
    // Removed before the kill: a real kill ends the process on the spot.
    expect(kills).toEqual([[4242, "SIGTERM", false]]);
  });

  it.skipIf(process.getuid?.() === 0)("still re-raises SIGTERM when removal fails", () => {
    // A worker that swallowed its SIGTERM would linger until tinypool's SIGKILL,
    // and the thrown error would surface as an unhandled error in a green run.
    const dir = forkDir(process.pid, 0);
    const { proc, kills } = fakeProcess(dir);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    removeOnExit(dir, proc);
    chmodSync(tmp, 0o500);
    try {
      expect(() => proc.emit("SIGTERM", "SIGTERM")).not.toThrow();
      expect(warn).toHaveBeenCalled();
    } finally {
      chmodSync(tmp, 0o700);
      warn.mockRestore();
    }
    expect(kills).toEqual([[4242, "SIGTERM", true]]);
  });

  it("doesn't throw at exit when the directory is already gone", () => {
    const dir = forkDir(process.pid, 0);
    const { proc } = fakeProcess(dir);
    removeOnExit(dir, proc);
    rmSync(dir, { recursive: true, force: true });
    expect(() => proc.emit("exit", 0)).not.toThrow();
  });
});

describe("this worker's own workspace", () => {
  it("is named for this process, so the exit handler and the sweep agree on it", () => {
    const workspace = process.env.WORKSPACE_PATH as string;
    expect(path.basename(path.dirname(workspace))).toMatch(/^SnapOtter-test-\d+_[0-9a-f]{8}$/);
    expect(forkDirOwner(path.basename(path.dirname(workspace)))).toBe(process.pid);
  });

  it("has its cleanup handlers installed by per-fork-env", () => {
    expect(process.listenerCount("SIGTERM")).toBeGreaterThanOrEqual(1);
    expect(process.listenerCount("exit")).toBeGreaterThanOrEqual(1);
  });
});
