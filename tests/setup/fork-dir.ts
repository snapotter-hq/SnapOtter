import crypto from "node:crypto";
import { readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { processAlive } from "./fork-db.js";

/**
 * Each vitest worker keeps its WORKSPACE_PATH under
 * `<tmpdir>/SnapOtter-test-<pid>_<hex>`. Nothing removed them, so they piled
 * up: 190 GB on one Mac, 33 GB from two full runs on a test box (#1004).
 * tests/setup/per-fork-env.ts removes its own directory when the worker exits,
 * and tests/global-setup.ts sweeps the directories of workers that died
 * without running that handler.
 *
 * Keep the name's shape: the /fix-issue fleet tooling parses the same prefix.
 */
const FORK_DIR = /^SnapOtter-test-(\d+)_[0-9a-f]{8}$/;

/**
 * A sweep only removes directories created at least this long ago (the top
 * directory's mtime is set when its one entry, `workspace/`, is made). A pid
 * means something only inside its own namespace, so a run in a container
 * sharing this temp dir can look dead from here; no worker, which lives for a
 * single test file, runs this long.
 */
export const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

export function forkDirName(pid: number): string {
  return `SnapOtter-test-${pid}_${crypto.randomUUID().slice(0, 8)}`;
}

/** The pid a per-fork workspace was made for, or null if `name` isn't one. */
export function forkDirOwner(name: string): number | null {
  const match = FORK_DIR.exec(name);
  return match ? Number(match[1]) : null;
}

/** The slice of `process` removeOnExit uses, so a test can stand in for it. */
export interface ExitTarget {
  pid: number;
  once(event: "exit" | "SIGTERM", listener: () => void): unknown;
  kill(pid: number, signal: "SIGTERM"): unknown;
}

/**
 * Remove `dir` when `target` (the worker process) exits. Synchronous, because
 * an exit handler can't wait for async work.
 *
 * Vitest's pool (tinypool) ends each worker with a bare SIGTERM, and a signal's
 * default action kills the process without an exit event, so SIGTERM is caught
 * too: clean up, then re-raise it once this listener is gone so the worker dies
 * exactly as it would have. A failed removal only warns: it must never stop
 * the re-raise, or the worker lingers until tinypool's SIGKILL and the error
 * surfaces as an unhandled one in an otherwise green run.
 *
 * tinypool sends SIGKILL a second after SIGTERM, so a very large workspace can
 * be cut off mid-removal, and a worker killed by SIGKILL never runs either
 * handler; removeOrphanedForkDirs catches what those leave.
 */
export function removeOnExit(dir: string, target: ExitTarget = process): void {
  const remove = () => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch (err) {
      console.warn(`[fork-dir] could not remove ${dir}; a later sweep will retry`, err);
    }
  };
  target.once("exit", remove);
  target.once("SIGTERM", () => {
    remove();
    target.kill(target.pid, "SIGTERM");
  });
}

/**
 * Remove per-fork workspaces under `tmpDir` whose worker has exited and that
 * are older than ORPHAN_MIN_AGE_MS. Returns what it removed. One that can't be
 * removed is skipped with a warning for a later sweep; this runs in global
 * setup, where throwing would fail a run over leftover scratch.
 */
export function removeOrphanedForkDirs(tmpDir: string, now = Date.now()): string[] {
  let names: string[];
  try {
    names = readdirSync(tmpDir);
  } catch (err) {
    // A missing temp dir has nothing to sweep. Anything else would switch the
    // sweep off unnoticed, and the leak would be back.
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`[fork-dir] could not list ${tmpDir}; nothing swept`, err);
    }
    return [];
  }
  const removed: string[] = [];
  for (const name of names) {
    const owner = forkDirOwner(name);
    if (owner === null || processAlive(owner)) continue;
    const dir = path.join(tmpDir, name);
    try {
      if (now - statSync(dir).mtimeMs < ORPHAN_MIN_AGE_MS) continue;
      rmSync(dir, { recursive: true, force: true });
      removed.push(dir);
    } catch (err) {
      console.warn(`[fork-dir] could not remove ${dir}; a later sweep will retry`, err);
    }
  }
  return removed;
}
