import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import {
  runInWorker,
  WorkerOutOfMemoryError,
  WorkerTimeoutError,
} from "../../../apps/api/src/lib/run-in-worker.js";

const dir = mkdtempSync(join(tmpdir(), "run-in-worker-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function workerModule(name: string, body: string): URL {
  const file = join(dir, name);
  writeFileSync(file, `import { parentPort, workerData } from "node:worker_threads";\n${body}\n`);
  return pathToFileURL(file);
}

describe("runInWorker", () => {
  it("resolves with the value the worker replies with", async () => {
    const url = workerModule(
      "echo.mjs",
      "parentPort.postMessage({ ok: true, value: workerData.n * 2 });",
    );
    await expect(runInWorker<number>(url, { n: 21 }, { timeoutMs: 5000 })).resolves.toBe(42);
  });

  it("rethrows a reported failure with its original name and message", async () => {
    const url = workerModule(
      "fail.mjs",
      'parentPort.postMessage({ ok: false, error: { name: "SvgoParserError", message: "bad" } });',
    );
    const err = await runInWorker(url, {}, { timeoutMs: 5000 }).catch((e: unknown) => e);
    expect(err).toMatchObject({ name: "SvgoParserError", message: "bad" });
  });

  it("starts the worker without the parent's execArgv preloads", async () => {
    const url = workerModule(
      "argv.mjs",
      "parentPort.postMessage({ ok: true, value: process.execArgv });",
    );
    await expect(runInWorker<string[]>(url, {}, { timeoutMs: 5000 })).resolves.toEqual([]);
  });

  it("rejects with WorkerTimeoutError and stops a worker that never replies", async () => {
    const url = workerModule("spin.mjs", "for (;;) {}");
    await expect(runInWorker(url, {}, { timeoutMs: 100 })).rejects.toBeInstanceOf(
      WorkerTimeoutError,
    );
  });

  it("rejects with WorkerOutOfMemoryError when the heap cap is hit", async () => {
    const url = workerModule("oom.mjs", "const a = []; for (;;) a.push(new Array(1e6).fill(1));");
    await expect(
      runInWorker(url, {}, { timeoutMs: 20_000, maxOldGenerationSizeMb: 32 }),
    ).rejects.toBeInstanceOf(WorkerOutOfMemoryError);
  });

  it("surfaces an uncaught throw in the worker", async () => {
    const url = workerModule("throw.mjs", 'throw new Error("boom");');
    await expect(runInWorker(url, {}, { timeoutMs: 5000 })).rejects.toThrow("boom");
  });

  it("rejects when the worker exits without replying", async () => {
    const url = workerModule("quiet.mjs", "process.exit(0);");
    await expect(runInWorker(url, {}, { timeoutMs: 5000 })).rejects.toThrow(/before replying/);
  });
});
