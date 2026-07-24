import { type ChildProcess, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { isToolInputError } from "@snapotter/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaInfo } from "../src/ffprobe.js";

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
  Object.assign(proc, { stdout, stderr, kill, pid: 99, killed: false });
  return { proc, stdout, stderr, kill };
}

/** Runs probeMedia against a canned JSON payload emitted on stdout then close(0). */
async function probeWith(json: unknown, path = "/media/clip.mp4"): Promise<MediaInfo> {
  const child = makeChild();
  vi.mocked(spawn).mockReturnValue(child.proc);
  const { probeMedia } = await import("../src/ffprobe.js");
  const p = probeMedia(path);
  child.stdout.emit("data", Buffer.from(JSON.stringify(json)));
  child.proc.emit("close", 0, null);
  return p;
}

beforeEach(() => {
  vi.resetModules();
  vi.mocked(spawn).mockReset();
  process.env.FFPROBE_PATH = "/fake/ffprobe";
  delete process.env.SUBPROCESS_MEMORY_LIMIT_MB;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete process.env.FFPROBE_PATH;
  delete process.env.SUBPROCESS_MEMORY_LIMIT_MB;
});

describe("probeMedia: argv construction", () => {
  it("passes the exact ffprobe argv with the file path last", async () => {
    const child = makeChild();
    vi.mocked(spawn).mockReturnValue(child.proc);
    const { probeMedia } = await import("../src/ffprobe.js");
    const p = probeMedia("/media/input.mkv");
    const [bin, args, opts] = vi.mocked(spawn).mock.calls[0];
    expect(bin).toBe("/fake/ffprobe");
    expect(args).toEqual([
      "-v",
      "error",
      "-analyzeduration",
      "10M",
      "-probesize",
      "25M",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      "/media/input.mkv",
    ]);
    expect(opts).toMatchObject({ stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.emit("data", Buffer.from("{}"));
    child.proc.emit("close", 0, null);
    await p;
  });

  it("routes argv through the memory-limit wrapper when the cap is set", async () => {
    process.env.SUBPROCESS_MEMORY_LIMIT_MB = "64";
    const child = makeChild();
    vi.mocked(spawn).mockReturnValue(child.proc);
    const { probeMedia } = await import("../src/ffprobe.js");
    const p = probeMedia("/media/input.mkv");
    const [bin, args] = vi.mocked(spawn).mock.calls[0];
    expect(bin).toBe("/bin/sh");
    expect(args).toEqual([
      "-c",
      'ulimit -v "$1" 2>/dev/null || true; shift; exec "$@"',
      "sh",
      "65536", // 64 * 1024
      "/fake/ffprobe",
      "-v",
      "error",
      "-analyzeduration",
      "10M",
      "-probesize",
      "25M",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      "/media/input.mkv",
    ]);
    child.stdout.emit("data", Buffer.from("{}"));
    child.proc.emit("close", 0, null);
    await p;
  });
});

describe("probeMedia: format-level parsing", () => {
  it("maps container, duration and bitrate (bit_rate 1_536_000 -> 1536 kbps)", async () => {
    const info = await probeWith({
      format: { format_name: "mov,mp4,m4a", duration: "12.345", bit_rate: "1536000" },
    });
    expect(info.container).toBe("mov,mp4,m4a");
    expect(info.durationS).toBe(12.345);
    expect(info.bitrateKbps).toBe(1536);
  });

  it("rounds bitrate to the nearest kbps (1_500_999 -> 1501)", async () => {
    const info = await probeWith({ format: { bit_rate: "1500999" } });
    expect(info.bitrateKbps).toBe(1501);
  });

  it("defaults container to 'unknown' and duration/bitrate to null when format is empty", async () => {
    const info = await probeWith({ format: {} });
    expect(info.container).toBe("unknown");
    expect(info.durationS).toBeNull();
    expect(info.bitrateKbps).toBeNull();
  });

  it("defaults everything when there is no format object at all", async () => {
    const info = await probeWith({});
    expect(info.container).toBe("unknown");
    expect(info.durationS).toBeNull();
    expect(info.bitrateKbps).toBeNull();
    expect(info.streams).toEqual([]);
    expect(info.tags).toBeUndefined();
  });

  it("returns null bitrate for a non-numeric bit_rate string", async () => {
    const info = await probeWith({ format: { bit_rate: "N/A" } });
    expect(info.bitrateKbps).toBeNull();
  });

  it("returns null duration for a non-numeric duration string", async () => {
    const info = await probeWith({ format: { duration: "N/A" } });
    expect(info.durationS).toBeNull();
  });
});

describe("probeMedia: tags parsing", () => {
  it("lowercases keys, drops non-string and empty values", async () => {
    const info = await probeWith({
      format: {
        tags: { title: "Hello", COMMENT: "world", empty: "", count: 5, missing: null },
      },
    });
    expect(info.tags).toEqual({ title: "Hello", comment: "world" });
  });

  it("omits tags entirely when none survive filtering", async () => {
    const info = await probeWith({ format: { tags: { empty: "", n: 7 } } });
    expect(info.tags).toBeUndefined();
  });

  it("omits tags when the tags object is absent", async () => {
    const info = await probeWith({ format: { format_name: "wav" } });
    expect(info.tags).toBeUndefined();
  });
});

describe("probeMedia: stream parsing", () => {
  it("maps a video stream with width and height", async () => {
    const info = await probeWith({
      streams: [{ codec_type: "video", codec_name: "h264", width: 1920, height: 1080 }],
    });
    expect(info.streams[0]).toEqual({
      type: "video",
      codec: "h264",
      width: 1920,
      height: 1080,
      sampleRate: undefined,
      channels: undefined,
    });
  });

  it("maps an audio stream with sample rate and channels", async () => {
    const info = await probeWith({
      streams: [{ codec_type: "audio", codec_name: "aac", sample_rate: "48000", channels: 2 }],
    });
    expect(info.streams[0]).toEqual({
      type: "audio",
      codec: "aac",
      width: undefined,
      height: undefined,
      sampleRate: 48000,
      channels: 2,
    });
  });

  it("classifies a subtitle stream (neither video nor audio) as 'other'", async () => {
    const info = await probeWith({ streams: [{ codec_type: "subtitle", codec_name: "mov_text" }] });
    expect(info.streams[0].type).toBe("other");
    expect(info.streams[0].codec).toBe("mov_text");
  });

  it("defaults codec to 'unknown' and type to 'other' for an empty stream object", async () => {
    const info = await probeWith({ streams: [{}] });
    expect(info.streams[0]).toEqual({
      type: "other",
      codec: "unknown",
      width: undefined,
      height: undefined,
      sampleRate: undefined,
      channels: undefined,
    });
  });

  it("drops a zero sample_rate (> 0 guard) to undefined", async () => {
    const info = await probeWith({
      streams: [{ codec_type: "audio", codec_name: "flac", sample_rate: "0", channels: 2 }],
    });
    expect(info.streams[0].sampleRate).toBeUndefined();
    expect(info.streams[0].channels).toBe(2);
  });

  it("drops a zero channel count (> 0 guard) to undefined", async () => {
    const info = await probeWith({
      streams: [{ codec_type: "audio", codec_name: "flac", sample_rate: "44100", channels: 0 }],
    });
    expect(info.streams[0].channels).toBeUndefined();
    expect(info.streams[0].sampleRate).toBe(44100);
  });

  it("drops a non-numeric channels value to undefined", async () => {
    const info = await probeWith({
      streams: [{ codec_type: "audio", codec_name: "aac", channels: "2" }],
    });
    expect(info.streams[0].channels).toBeUndefined();
  });

  it("drops a non-finite sample_rate to undefined", async () => {
    const info = await probeWith({
      streams: [{ codec_type: "audio", codec_name: "aac", sample_rate: "abc" }],
    });
    expect(info.streams[0].sampleRate).toBeUndefined();
  });

  it("preserves stream order across a mixed set", async () => {
    const info = await probeWith({
      streams: [
        { codec_type: "video", codec_name: "hevc", width: 3840, height: 2160 },
        { codec_type: "audio", codec_name: "opus", sample_rate: "48000", channels: 6 },
        { codec_type: "data", codec_name: "bin_data" },
      ],
    });
    expect(info.streams.map((s) => s.type)).toEqual(["video", "audio", "other"]);
    expect(info.streams.map((s) => s.codec)).toEqual(["hevc", "opus", "bin_data"]);
    expect(info.streams[0].width).toBe(3840);
    expect(info.streams[0].height).toBe(2160);
    expect(info.streams[1].channels).toBe(6);
  });
});

describe("probeMedia: error paths", () => {
  it("rejects when stdout is not valid JSON", async () => {
    const child = makeChild();
    vi.mocked(spawn).mockReturnValue(child.proc);
    const { probeMedia } = await import("../src/ffprobe.js");
    const p = probeMedia("/media/clip.mp4");
    child.stdout.emit("data", Buffer.from("{ this is not json"));
    child.proc.emit("close", 0, null);
    await expect(p).rejects.toBeInstanceOf(Error);
  });

  it("rejects with 'ffprobe exited <code>: <tail>' on non-zero exit", async () => {
    const child = makeChild();
    vi.mocked(spawn).mockReturnValue(child.proc);
    const { probeMedia } = await import("../src/ffprobe.js");
    const p = probeMedia("/media/clip.mp4");
    child.stderr.emit("data", Buffer.from("some probe failure"));
    child.proc.emit("close", 2, null);
    await expect(p).rejects.toThrow("ffprobe exited 2: some probe failure");
  });

  it("uses the signal name when the exit code is null", async () => {
    const child = makeChild();
    vi.mocked(spawn).mockReturnValue(child.proc);
    const { probeMedia } = await import("../src/ffprobe.js");
    const p = probeMedia("/media/clip.mp4");
    child.stderr.emit("data", Buffer.from("killed"));
    child.proc.emit("close", null, "SIGKILL");
    await expect(p).rejects.toThrow("ffprobe exited SIGKILL: killed");
  });

  it("marks the rejection as a tool input error when stderr matches an input pattern", async () => {
    const child = makeChild();
    vi.mocked(spawn).mockReturnValue(child.proc);
    const { probeMedia } = await import("../src/ffprobe.js");
    const p = probeMedia("/media/clip.mp4");
    child.stderr.emit("data", Buffer.from("Invalid data found when processing input"));
    child.proc.emit("close", 1, null);
    let caught: unknown;
    try {
      await p;
    } catch (e) {
      caught = e;
    }
    expect(isToolInputError(caught)).toBe(true);
  });

  it("does NOT mark the rejection for a generic probe failure", async () => {
    const child = makeChild();
    vi.mocked(spawn).mockReturnValue(child.proc);
    const { probeMedia } = await import("../src/ffprobe.js");
    const p = probeMedia("/media/clip.mp4");
    child.stderr.emit("data", Buffer.from("some unrelated failure"));
    child.proc.emit("close", 1, null);
    let caught: unknown;
    try {
      await p;
    } catch (e) {
      caught = e;
    }
    expect(isToolInputError(caught)).toBe(false);
  });

  it("keeps only the last 4096 bytes of stderr for the error tail", async () => {
    const child = makeChild();
    vi.mocked(spawn).mockReturnValue(child.proc);
    const { probeMedia } = await import("../src/ffprobe.js");
    const p = probeMedia("/media/clip.mp4");
    // Emit >4096 of stderr; the tail slice(-1000) in the message proves capture worked.
    child.stderr.emit("data", Buffer.from("Q".repeat(5000)));
    child.proc.emit("close", 1, null);
    let caught: unknown;
    try {
      await p;
    } catch (e) {
      caught = e;
    }
    const msg = (caught as Error).message;
    // Message embeds err.slice(-1000): exactly 1000 Q's after the prefix.
    expect(msg).toBe(`ffprobe exited 1: ${"Q".repeat(1000)}`);
  });

  it("rejects on the spawn 'error' event", async () => {
    const child = makeChild();
    vi.mocked(spawn).mockReturnValue(child.proc);
    const { probeMedia } = await import("../src/ffprobe.js");
    const p = probeMedia("/media/clip.mp4");
    child.proc.emit("error", new Error("spawn EACCES"));
    await expect(p).rejects.toThrow("spawn EACCES");
  });
});

describe("probeMedia: timeout", () => {
  it("rejects with 'ffprobe timed out after 15s' at the default timeout and SIGKILLs", async () => {
    vi.useFakeTimers();
    const child = makeChild();
    vi.mocked(spawn).mockReturnValue(child.proc);
    const { probeMedia } = await import("../src/ffprobe.js");
    const p = probeMedia("/media/clip.mp4");
    const assertion = expect(p).rejects.toThrow("ffprobe timed out after 15s");
    vi.advanceTimersByTime(15_000);
    await assertion;
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
  });

  it("honors a custom timeoutMs and reports it in seconds (3000ms -> 3s)", async () => {
    vi.useFakeTimers();
    const child = makeChild();
    vi.mocked(spawn).mockReturnValue(child.proc);
    const { probeMedia } = await import("../src/ffprobe.js");
    const p = probeMedia("/media/clip.mp4", { timeoutMs: 3000 });
    const assertion = expect(p).rejects.toThrow("ffprobe timed out after 3s");
    vi.advanceTimersByTime(3000);
    await assertion;
  });

  it("does not fire the timeout when the probe completes in time", async () => {
    vi.useFakeTimers();
    const child = makeChild();
    vi.mocked(spawn).mockReturnValue(child.proc);
    const { probeMedia } = await import("../src/ffprobe.js");
    const p = probeMedia("/media/clip.mp4", { timeoutMs: 3000 });
    vi.advanceTimersByTime(2999);
    child.stdout.emit("data", Buffer.from('{"format":{"format_name":"wav"}}'));
    child.proc.emit("close", 0, null);
    const info = await p;
    expect(info.container).toBe("wav");
    expect(child.kill).not.toHaveBeenCalled();
  });
});

describe("probeMedia: missing binary", () => {
  it("rejects with a clear message and never spawns when ffprobe is unavailable", async () => {
    vi.doMock("../src/binaries.js", () => ({
      resolveFfmpeg: () => null,
      resolveFfprobe: () => null,
    }));
    const { probeMedia } = await import("../src/ffprobe.js");
    await expect(probeMedia("/media/clip.mp4")).rejects.toThrow(
      "ffprobe binary not found (set FFPROBE_PATH or install ffmpeg)",
    );
    expect(vi.mocked(spawn)).not.toHaveBeenCalled();
    vi.doUnmock("../src/binaries.js");
  });
});
