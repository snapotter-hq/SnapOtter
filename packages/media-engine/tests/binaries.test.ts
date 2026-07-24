import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({ spawnSync: vi.fn() }));

type SpawnSyncReturn = { status: number | null; stdout: string; stderr: string };
function whichResult(over: Partial<SpawnSyncReturn> = {}): SpawnSyncReturn {
  return { status: 0, stdout: "", stderr: "", ...over };
}

describe("resolveFfmpeg / resolveFfprobe", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.mocked(spawnSync).mockReset();
    delete process.env.FFMPEG_PATH;
    delete process.env.FFPROBE_PATH;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.FFMPEG_PATH;
    delete process.env.FFPROBE_PATH;
  });

  it("FFMPEG_PATH env override wins and skips the which() probe", async () => {
    process.env.FFMPEG_PATH = "/opt/bin/ffmpeg";
    const { resolveFfmpeg } = await import("../src/binaries.js");
    expect(resolveFfmpeg()).toBe("/opt/bin/ffmpeg");
    expect(vi.mocked(spawnSync)).not.toHaveBeenCalled();
  });

  it("FFPROBE_PATH env override wins and skips the which() probe", async () => {
    process.env.FFPROBE_PATH = "/opt/bin/ffprobe";
    const { resolveFfprobe } = await import("../src/binaries.js");
    expect(resolveFfprobe()).toBe("/opt/bin/ffprobe");
    expect(vi.mocked(spawnSync)).not.toHaveBeenCalled();
  });

  it("falls back to which() and returns the first line on status 0", async () => {
    // The code trims the whole stdout then splits on "\n" and takes index 0.
    vi.mocked(spawnSync).mockReturnValue(
      whichResult({ stdout: "\n/usr/bin/ffmpeg\n/usr/local/bin/ffmpeg\n" }) as never,
    );
    const { resolveFfmpeg } = await import("../src/binaries.js");
    expect(resolveFfmpeg()).toBe("/usr/bin/ffmpeg");
  });

  it("invokes which/where with the binary name argument", async () => {
    vi.mocked(spawnSync).mockReturnValue(whichResult({ stdout: "/usr/bin/ffprobe\n" }) as never);
    const { resolveFfprobe } = await import("../src/binaries.js");
    resolveFfprobe();
    const [cmd, args, opts] = vi.mocked(spawnSync).mock.calls[0];
    expect(cmd).toBe(process.platform === "win32" ? "where" : "which");
    expect(args).toEqual(["ffprobe"]);
    expect(opts).toMatchObject({ encoding: "utf8" });
  });

  it("returns null when which() exits non-zero", async () => {
    vi.mocked(spawnSync).mockReturnValue(whichResult({ status: 1, stdout: "" }) as never);
    const { resolveFfmpeg } = await import("../src/binaries.js");
    expect(resolveFfmpeg()).toBeNull();
  });

  it("returns null when which() exits 0 but stdout is blank", async () => {
    // status 0 with empty/whitespace stdout must still be null (both conditions matter).
    vi.mocked(spawnSync).mockReturnValue(whichResult({ status: 0, stdout: "   \n" }) as never);
    const { resolveFfmpeg } = await import("../src/binaries.js");
    expect(resolveFfmpeg()).toBeNull();
  });

  it("returns null when status is null (spawn failure)", async () => {
    vi.mocked(spawnSync).mockReturnValue(whichResult({ status: null, stdout: "/x\n" }) as never);
    const { resolveFfprobe } = await import("../src/binaries.js");
    expect(resolveFfprobe()).toBeNull();
  });

  it("caches the resolved path: which() runs only once across calls", async () => {
    vi.mocked(spawnSync).mockReturnValue(whichResult({ stdout: "/usr/bin/ffmpeg\n" }) as never);
    const { resolveFfmpeg } = await import("../src/binaries.js");
    expect(resolveFfmpeg()).toBe("/usr/bin/ffmpeg");
    expect(resolveFfmpeg()).toBe("/usr/bin/ffmpeg");
    expect(resolveFfmpeg()).toBe("/usr/bin/ffmpeg");
    expect(vi.mocked(spawnSync)).toHaveBeenCalledTimes(1);
  });

  it("caches null too: a failed probe is not retried", async () => {
    vi.mocked(spawnSync).mockReturnValue(whichResult({ status: 1 }) as never);
    const { resolveFfmpeg } = await import("../src/binaries.js");
    expect(resolveFfmpeg()).toBeNull();
    expect(resolveFfmpeg()).toBeNull();
    expect(vi.mocked(spawnSync)).toHaveBeenCalledTimes(1);
  });
});

describe("ffmpegAvailable", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.mocked(spawnSync).mockReset();
    delete process.env.FFMPEG_PATH;
    delete process.env.FFPROBE_PATH;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.FFMPEG_PATH;
    delete process.env.FFPROBE_PATH;
  });

  it("is true only when both binaries resolve", async () => {
    process.env.FFMPEG_PATH = "/opt/ffmpeg";
    process.env.FFPROBE_PATH = "/opt/ffprobe";
    const { ffmpegAvailable } = await import("../src/binaries.js");
    expect(ffmpegAvailable()).toBe(true);
  });

  it("is false when ffprobe is missing even if ffmpeg is present", async () => {
    process.env.FFMPEG_PATH = "/opt/ffmpeg";
    // ffprobe has no env override and which() fails.
    vi.mocked(spawnSync).mockReturnValue(whichResult({ status: 1 }) as never);
    const { ffmpegAvailable } = await import("../src/binaries.js");
    expect(ffmpegAvailable()).toBe(false);
  });

  it("is false when ffmpeg is missing even if ffprobe is present", async () => {
    process.env.FFPROBE_PATH = "/opt/ffprobe";
    vi.mocked(spawnSync).mockReturnValue(whichResult({ status: 1 }) as never);
    const { ffmpegAvailable } = await import("../src/binaries.js");
    expect(ffmpegAvailable()).toBe(false);
  });
});
