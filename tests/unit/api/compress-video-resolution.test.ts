import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #4292: compress-video's target resolution is a ceiling. A source already
 * below the target keeps its height instead of being enlarged, which made the
 * output bigger than the input.
 *
 * The route is a closure handed to createToolRoute, so the factory only
 * records the config and runMediaTool hands the route real paths, then the
 * argument list the route built is run through the real ffmpeg when present.
 */

type RouteConfig = { toolId: string; processV2: (ctx: unknown) => Promise<unknown> };

const registered: RouteConfig[] = [];
let builtArgs: string[] = [];
let sourcePath = "in.mp4";
let outputPath = "out.mp4";

vi.mock("../../../apps/api/src/routes/tool-factory.js", () => ({
  createToolRoute: vi.fn((_app: unknown, config: RouteConfig) => {
    registered.push(config);
  }),
}));

vi.mock("../../../apps/api/src/lib/media-tool.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/lib/media-tool.js")>();
  return {
    ...actual,
    runMediaTool: vi.fn(
      async (
        _ctx: unknown,
        _outName: string,
        argsFor: (inPath: string, outPath: string, info: unknown) => string[],
      ) => {
        builtArgs = argsFor(sourcePath, outputPath, { durationS: 1, audioSampleRate: 48_000 });
        return { outPath: outputPath, durationS: 1 };
      },
    ),
  };
});

const { registerCompressVideo } = await import(
  "../../../apps/api/src/routes/tools/compress-video.js"
);

async function buildArgs(resolution: string): Promise<string[]> {
  registerCompressVideo({} as never);
  const route = registered.find((r) => r.toolId === "compress-video");
  if (!route) throw new Error("compress-video did not register");
  await route.processV2({
    settings: { quality: "balanced", resolution },
    inputs: [{ filename: "clip.mp4" }],
  });
  return builtArgs;
}

function filterOf(args: string[]): string | undefined {
  const i = args.indexOf("-vf");
  return i === -1 ? undefined : args[i + 1];
}

const ffmpegPresent = spawnSync("ffmpeg", ["-version"]).status === 0;

beforeEach(() => {
  registered.length = 0;
  builtArgs = [];
  delete process.env.SNAPOTTER_HW_ACCEL;
});

describe("compress-video resolution filter", () => {
  it.each([
    ["1080p", "scale=-2:'min(ih,1080)'"],
    ["720p", "scale=-2:'min(ih,720)'"],
    ["480p", "scale=-2:'min(ih,480)'"],
  ])("%s only ever downscales", async (resolution, filter) => {
    expect(filterOf(await buildArgs(resolution))).toBe(filter);
  });

  it("adds no filter at original resolution", async () => {
    expect(filterOf(await buildArgs("original"))).toBeUndefined();
  });
});

describe.skipIf(!ffmpegPresent)("compress-video resolution against real ffmpeg", () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "snapotter-compress-res-"));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function makeSource(name: string, size: string): string {
    const path = join(dir, name);
    const made = spawnSync("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `testsrc=size=${size}:rate=5:duration=1`,
      "-pix_fmt",
      "yuv420p",
      path,
    ]);
    expect(made.status).toBe(0);
    return path;
  }

  function heightAfter(source: string, resolution: string, outName: string) {
    return async () => {
      sourcePath = source;
      outputPath = join(dir, outName);
      const args = await buildArgs(resolution);
      const run = spawnSync("ffmpeg", ["-y", ...args]);
      expect(run.status, run.stderr.toString()).toBe(0);
      const probe = spawnSync("ffprobe", [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=height",
        "-of",
        "csv=p=0",
        outputPath,
      ]);
      return Number(probe.stdout.toString().trim());
    };
  }

  it("keeps a 360p source at 360p when 720p is requested", async () => {
    const source = makeSource("small.mp4", "640x360");
    expect(await heightAfter(source, "720p", "small-out.mp4")()).toBe(360);
  });

  it("still downscales a 720p source to 480p", async () => {
    const source = makeSource("large.mp4", "1280x720");
    expect(await heightAfter(source, "480p", "large-out.mp4")()).toBe(480);
  });
});
