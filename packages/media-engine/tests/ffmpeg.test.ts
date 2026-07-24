import { type ChildProcess, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { isSafeMessageError, isToolInputError } from "@snapotter/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FfmpegProgress } from "../src/progress.js";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

interface FakeChild {
  proc: ChildProcess;
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
}

function makeChild(): FakeChild {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const kill = vi.fn(() => true);
  const proc = new EventEmitter() as unknown as ChildProcess;
  Object.assign(proc, { stdout, stderr, kill, pid: 4242, killed: false });
  return { proc, stdout, stderr, kill };
}

function mockSpawnReturns(child: FakeChild): void {
  vi.mocked(spawn).mockReturnValue(child.proc);
}

async function loadRunFfmpeg() {
  const mod = await import("../src/ffmpeg.js");
  return mod.runFfmpeg;
}

beforeEach(() => {
  vi.resetModules();
  vi.mocked(spawn).mockReset();
  process.env.FFMPEG_PATH = "/fake/ffmpeg";
  delete process.env.SUBPROCESS_MEMORY_LIMIT_MB;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete process.env.FFMPEG_PATH;
  delete process.env.SUBPROCESS_MEMORY_LIMIT_MB;
});

describe("runFfmpeg: argv construction", () => {
  it("wraps user args with the fixed flags and -progress pipe:1 in order", async () => {
    const child = makeChild();
    mockSpawnReturns(child);
    const runFfmpeg = await loadRunFfmpeg();
    const p = runFfmpeg(["-i", "in.mp4", "-vf", "scale=2", "out.mp4"]);
    const [bin, args, opts] = vi.mocked(spawn).mock.calls[0];
    expect(bin).toBe("/fake/ffmpeg");
    expect(args).toEqual([
      "-hide_banner",
      "-nostdin",
      "-y",
      "-i",
      "in.mp4",
      "-vf",
      "scale=2",
      "out.mp4",
      "-progress",
      "pipe:1",
    ]);
    expect(opts).toMatchObject({ stdio: ["ignore", "pipe", "pipe"] });
    child.proc.emit("close", 0, null);
    await p;
  });

  it("keeps -progress pipe:1 as the LAST two args with empty user args", async () => {
    const child = makeChild();
    mockSpawnReturns(child);
    const runFfmpeg = await loadRunFfmpeg();
    const p = runFfmpeg([]);
    const args = vi.mocked(spawn).mock.calls[0][1] as string[];
    expect(args).toEqual(["-hide_banner", "-nostdin", "-y", "-progress", "pipe:1"]);
    expect(args.slice(-2)).toEqual(["-progress", "pipe:1"]);
    child.proc.emit("close", 0, null);
    await p;
  });

  it("routes argv through the memory-limit wrapper when SUBPROCESS_MEMORY_LIMIT_MB is set", async () => {
    process.env.SUBPROCESS_MEMORY_LIMIT_MB = "128";
    const child = makeChild();
    mockSpawnReturns(child);
    const runFfmpeg = await loadRunFfmpeg();
    const p = runFfmpeg(["-i", "in.mp4", "out.mp4"]);
    const [bin, args] = vi.mocked(spawn).mock.calls[0];
    expect(bin).toBe("/bin/sh");
    expect(args).toEqual([
      "-c",
      'ulimit -v "$1" 2>/dev/null || true; shift; exec "$@"',
      "sh",
      "131072", // 128 * 1024
      "/fake/ffmpeg",
      "-hide_banner",
      "-nostdin",
      "-y",
      "-i",
      "in.mp4",
      "out.mp4",
      "-progress",
      "pipe:1",
    ]);
    child.proc.emit("close", 0, null);
    await p;
  });
});

describe("runFfmpeg: progress parsing from stdout", () => {
  it("fires onProgress with parsed values from a single block", async () => {
    const child = makeChild();
    mockSpawnReturns(child);
    const runFfmpeg = await loadRunFfmpeg();
    const seen: FfmpegProgress[] = [];
    const p = runFfmpeg(["out.mp4"], { onProgress: (x) => seen.push(x) });
    child.stdout.emit("data", Buffer.from("out_time_us=1500\nprogress=continue\n"));
    child.proc.emit("close", 0, null);
    await p;
    expect(seen).toEqual([
      { outTimeMs: 2, done: false, raw: { out_time_us: "1500", progress: "continue" } },
    ]);
  });

  it("emits two blocks delivered in one chunk with correct times", async () => {
    const child = makeChild();
    mockSpawnReturns(child);
    const runFfmpeg = await loadRunFfmpeg();
    const times: Array<number | null> = [];
    const p = runFfmpeg(["out.mp4"], { onProgress: (x) => times.push(x.outTimeMs) });
    child.stdout.emit(
      "data",
      Buffer.from("out_time_us=1000000\nprogress=continue\nout_time_us=2000000\nprogress=end\n"),
    );
    child.proc.emit("close", 0, null);
    await p;
    expect(times).toEqual([1000, 2000]);
  });

  it("marks done=true when the block reports progress=end", async () => {
    const child = makeChild();
    mockSpawnReturns(child);
    const runFfmpeg = await loadRunFfmpeg();
    const seen: FfmpegProgress[] = [];
    const p = runFfmpeg(["out.mp4"], { onProgress: (x) => seen.push(x) });
    child.stdout.emit("data", Buffer.from("out_time_us=4000000\nprogress=end\n"));
    child.proc.emit("close", 0, null);
    await p;
    expect(seen[0].done).toBe(true);
    expect(seen[0].outTimeMs).toBe(4000);
  });

  it("holds a block until the newline terminating the progress= line arrives", async () => {
    const child = makeChild();
    mockSpawnReturns(child);
    const runFfmpeg = await loadRunFfmpeg();
    const times: Array<number | null> = [];
    const p = runFfmpeg(["out.mp4"], { onProgress: (x) => times.push(x.outTimeMs) });
    child.stdout.emit("data", Buffer.from("out_time_us=500000\nprogress=cont"));
    expect(times).toEqual([]); // no terminating newline yet
    child.stdout.emit("data", Buffer.from("inue\n"));
    expect(times).toEqual([500]);
    child.proc.emit("close", 0, null);
    await p;
  });

  it("does not call onProgress when no progress= line is present", async () => {
    const child = makeChild();
    mockSpawnReturns(child);
    const runFfmpeg = await loadRunFfmpeg();
    const onProgress = vi.fn();
    const p = runFfmpeg(["out.mp4"], { onProgress });
    child.stdout.emit("data", Buffer.from("frame=10\nfps=25\n"));
    child.proc.emit("close", 0, null);
    await p;
    expect(onProgress).not.toHaveBeenCalled();
  });

  it("propagates an onProgress callback throw as a rejection and kills the process", async () => {
    const child = makeChild();
    mockSpawnReturns(child);
    const runFfmpeg = await loadRunFfmpeg();
    const p = runFfmpeg(["out.mp4"], {
      onProgress: () => {
        throw new Error("callback exploded");
      },
    });
    child.stdout.emit("data", Buffer.from("out_time_us=1\nprogress=continue\n"));
    await expect(p).rejects.toThrow("callback exploded");
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
  });
});

describe("runFfmpeg: resolution and stderr capture", () => {
  it("resolves with the captured stderr tail on exit code 0", async () => {
    const child = makeChild();
    mockSpawnReturns(child);
    const runFfmpeg = await loadRunFfmpeg();
    const p = runFfmpeg(["out.mp4"]);
    child.stderr.emit("data", Buffer.from("[silencedetect] "));
    child.stderr.emit("data", Buffer.from("silence_start: 1.5"));
    child.proc.emit("close", 0, null);
    await expect(p).resolves.toBe("[silencedetect] silence_start: 1.5");
  });

  it("resolves with an empty string when no stderr was produced", async () => {
    const child = makeChild();
    mockSpawnReturns(child);
    const runFfmpeg = await loadRunFfmpeg();
    const p = runFfmpeg(["out.mp4"]);
    child.proc.emit("close", 0, null);
    await expect(p).resolves.toBe("");
  });

  it("keeps only the last 16KB of stderr (STDERR_RING_MAX)", async () => {
    const child = makeChild();
    mockSpawnReturns(child);
    const runFfmpeg = await loadRunFfmpeg();
    const p = runFfmpeg(["out.mp4"]);
    const RING = 16 * 1024;
    child.stderr.emit("data", Buffer.from("X".repeat(RING)));
    child.stderr.emit("data", Buffer.from("TAIL_MARKER"));
    child.proc.emit("close", 0, null);
    const tail = await p;
    expect(tail.length).toBe(RING); // (RING + 11) sliced back to RING
    expect(tail.endsWith("TAIL_MARKER")).toBe(true);
    // The first 11 'X' chars were pushed out of the ring.
    expect(tail.startsWith("X".repeat(RING))).toBe(false);
    expect(tail).toBe(`${"X".repeat(RING - "TAIL_MARKER".length)}TAIL_MARKER`);
  });
});

describe("runFfmpeg: non-zero exit", () => {
  it("rejects with 'ffmpeg exited <code>: <tail>' including the last 2000 chars", async () => {
    const child = makeChild();
    mockSpawnReturns(child);
    const runFfmpeg = await loadRunFfmpeg();
    const p = runFfmpeg(["out.mp4"]);
    child.stderr.emit("data", Buffer.from("Unknown encoder 'libbogus'"));
    child.proc.emit("close", 3, null);
    await expect(p).rejects.toThrow("ffmpeg exited 3: Unknown encoder 'libbogus'");
  });

  it("uses the signal name when exit code is null", async () => {
    const child = makeChild();
    mockSpawnReturns(child);
    const runFfmpeg = await loadRunFfmpeg();
    const p = runFfmpeg(["out.mp4"]);
    child.stderr.emit("data", Buffer.from("killed"));
    child.proc.emit("close", null, "SIGSEGV");
    await expect(p).rejects.toThrow("ffmpeg exited SIGSEGV: killed");
  });

  it("marks the rejection as a tool input error when stderr matches an input pattern", async () => {
    const child = makeChild();
    mockSpawnReturns(child);
    const runFfmpeg = await loadRunFfmpeg();
    const p = runFfmpeg(["out.mp4"]);
    child.stderr.emit("data", Buffer.from("moov atom not found"));
    child.proc.emit("close", 1, null);
    let caught: unknown;
    try {
      await p;
    } catch (e) {
      caught = e;
    }
    expect(isToolInputError(caught)).toBe(true);
  });

  it("does NOT mark the rejection for a generic (non-input) failure", async () => {
    const child = makeChild();
    mockSpawnReturns(child);
    const runFfmpeg = await loadRunFfmpeg();
    const p = runFfmpeg(["out.mp4"]);
    child.stderr.emit("data", Buffer.from("Conversion failed! generic"));
    child.proc.emit("close", 1, null);
    let caught: unknown;
    try {
      await p;
    } catch (e) {
      caught = e;
    }
    expect(isToolInputError(caught)).toBe(false);
  });

  it("truncates the reject message tail to the last 2000 chars", async () => {
    const child = makeChild();
    mockSpawnReturns(child);
    const runFfmpeg = await loadRunFfmpeg();
    const p = runFfmpeg(["out.mp4"]);
    child.stderr.emit("data", Buffer.from("Z".repeat(5000)));
    child.proc.emit("close", 1, null);
    let caught: unknown;
    try {
      await p;
    } catch (e) {
      caught = e;
    }
    const msg = (caught as Error).message;
    const prefix = "ffmpeg exited 1: ";
    expect(msg.slice(prefix.length).length).toBe(2000);
  });
});

describe("runFfmpeg: timeout", () => {
  it("rejects with a SafeError (constant message, operational, code=timeout) and SIGKILLs", async () => {
    vi.useFakeTimers();
    const child = makeChild();
    mockSpawnReturns(child);
    const runFfmpeg = await loadRunFfmpeg();
    const p = runFfmpeg(["out.mp4"], { timeoutMs: 5000 });
    const assertion = expect(p).rejects.toSatisfy((e: unknown) => {
      const err = e as Error & { kind?: string; code?: string };
      return (
        err instanceof Error &&
        err.message === "ffmpeg timed out" &&
        isSafeMessageError(err) &&
        err.kind === "operational" &&
        err.code === "timeout"
      );
    });
    vi.advanceTimersByTime(5000);
    await assertion;
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
  });

  it("does not fire before the timeout elapses", async () => {
    vi.useFakeTimers();
    const child = makeChild();
    mockSpawnReturns(child);
    const runFfmpeg = await loadRunFfmpeg();
    const p = runFfmpeg(["out.mp4"], { timeoutMs: 5000 });
    vi.advanceTimersByTime(4999);
    // still pending: complete it cleanly and expect resolution, not the timeout rejection.
    child.proc.emit("close", 0, null);
    await expect(p).resolves.toBe("");
    expect(child.kill).not.toHaveBeenCalled();
  });

  it("does not arm a timer when timeoutMs is undefined", async () => {
    vi.useFakeTimers();
    const child = makeChild();
    mockSpawnReturns(child);
    const runFfmpeg = await loadRunFfmpeg();
    const p = runFfmpeg(["out.mp4"]);
    vi.advanceTimersByTime(10 * 60 * 1000);
    child.proc.emit("close", 0, null);
    await expect(p).resolves.toBe("");
  });
});

describe("runFfmpeg: abort signal", () => {
  it("rejects immediately with 'Canceled' when the signal is already aborted", async () => {
    const child = makeChild();
    mockSpawnReturns(child);
    const runFfmpeg = await loadRunFfmpeg();
    const controller = new AbortController();
    controller.abort();
    const p = runFfmpeg(["out.mp4"], { signal: controller.signal });
    await expect(p).rejects.toThrow("Canceled");
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
  });

  it("rejects with 'Canceled' when aborted mid-run", async () => {
    const child = makeChild();
    mockSpawnReturns(child);
    const runFfmpeg = await loadRunFfmpeg();
    const controller = new AbortController();
    const p = runFfmpeg(["out.mp4"], { signal: controller.signal });
    controller.abort();
    await expect(p).rejects.toThrow("Canceled");
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
  });

  it("resolves normally when the signal never aborts", async () => {
    const child = makeChild();
    mockSpawnReturns(child);
    const runFfmpeg = await loadRunFfmpeg();
    const controller = new AbortController();
    const p = runFfmpeg(["out.mp4"], { signal: controller.signal });
    child.proc.emit("close", 0, null);
    await expect(p).resolves.toBe("");
  });
});

describe("runFfmpeg: spawn 'error' event and settle-once", () => {
  it("rejects with the spawn error", async () => {
    const child = makeChild();
    mockSpawnReturns(child);
    const runFfmpeg = await loadRunFfmpeg();
    const p = runFfmpeg(["out.mp4"]);
    child.proc.emit("error", new Error("spawn ENOENT"));
    await expect(p).rejects.toThrow("spawn ENOENT");
  });

  it("ignores a later close(0) after a failure has already settled the promise", async () => {
    const child = makeChild();
    mockSpawnReturns(child);
    const runFfmpeg = await loadRunFfmpeg();
    const p = runFfmpeg(["out.mp4"]);
    child.proc.emit("error", new Error("first failure"));
    child.proc.emit("close", 0, null); // must be a no-op
    await expect(p).rejects.toThrow("first failure");
  });
});

describe("runFfmpeg: missing binary", () => {
  it("rejects with a clear message and never spawns when ffmpeg is unavailable", async () => {
    vi.doMock("../src/binaries.js", () => ({
      resolveFfmpeg: () => null,
      resolveFfprobe: () => null,
    }));
    const { runFfmpeg } = await import("../src/ffmpeg.js");
    await expect(runFfmpeg(["out.mp4"])).rejects.toThrow(
      "ffmpeg binary not found (set FFMPEG_PATH or install ffmpeg)",
    );
    expect(vi.mocked(spawn)).not.toHaveBeenCalled();
    vi.doUnmock("../src/binaries.js");
  });
});
