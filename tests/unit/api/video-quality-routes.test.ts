import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setEncoderInventoryForTests } from "../../../packages/media-engine/src/encoders.js";

/**
 * #1090 as the user sees it: compress-video's light/balanced/strong and
 * convert-video's high/balanced/small must reach ffmpeg as three different
 * quality values on an NVENC host, not three copies of an ignored `-crf`.
 *
 * The routes are closures handed to createToolRoute, so the factory is
 * replaced with one that just records the config, and runMediaTool with one
 * that returns the argument list the route built. resolveEncoder stays real,
 * fed a pinned inventory.
 */

type RouteConfig = {
  toolId: string;
  processV2: (ctx: unknown) => Promise<unknown>;
};

const registered: RouteConfig[] = [];
let capturedArgs: string[] = [];

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
        capturedArgs = argsFor("in.mp4", "out.mp4", { durationS: 1, audioSampleRate: 48_000 });
        return { outPath: "out.mp4", durationS: 1 };
      },
    ),
  };
});

const { registerCompressVideo } = await import(
  "../../../apps/api/src/routes/tools/compress-video.js"
);
const { registerConvertVideo } = await import(
  "../../../apps/api/src/routes/tools/convert-video.js"
);

const WITH_NVENC = new Set([
  "libx264",
  "libx265",
  "libsvtav1",
  "libvpx-vp9",
  "aac",
  "libopus",
  "libmp3lame",
  "h264_nvenc",
  "hevc_nvenc",
  "av1_nvenc",
]);

const ORIGINAL_ACCEL = process.env.SNAPOTTER_HW_ACCEL;

beforeEach(() => {
  registered.length = 0;
  capturedArgs = [];
  setEncoderInventoryForTests(WITH_NVENC);
});

afterEach(() => {
  if (ORIGINAL_ACCEL === undefined) delete process.env.SNAPOTTER_HW_ACCEL;
  else process.env.SNAPOTTER_HW_ACCEL = ORIGINAL_ACCEL;
  setEncoderInventoryForTests(undefined);
});

async function argsFor(
  register: (app: never) => void,
  toolId: string,
  settings: Record<string, string>,
): Promise<string[]> {
  register({} as never);
  const route = registered.find((r) => r.toolId === toolId);
  if (!route) throw new Error(`${toolId} did not register`);
  await route.processV2({ settings, inputs: [{ filename: "clip.mp4" }] });
  return capturedArgs;
}

/** The value following `flag`, or undefined when the flag is absent. */
function flagValue(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
}

describe("compress-video quality on an NVENC host", () => {
  beforeEach(() => {
    process.env.SNAPOTTER_HW_ACCEL = "nvenc";
  });

  it("maps light/balanced/strong to three distinct cq values and no crf", async () => {
    const seen: string[] = [];
    for (const quality of ["light", "balanced", "strong"]) {
      const args = await argsFor(registerCompressVideo, "compress-video", { quality });
      expect(flagValue(args, "-c:v")).toBe("h264_nvenc");
      expect(args).not.toContain("-crf");
      seen.push(flagValue(args, "-cq") ?? "missing");
    }
    expect(seen).toEqual(["23", "28", "33"]);
  });
});

describe("compress-video quality on a software host", () => {
  it("still maps light/balanced/strong to crf 23/28/33", async () => {
    delete process.env.SNAPOTTER_HW_ACCEL;
    const seen: string[] = [];
    for (const quality of ["light", "balanced", "strong"]) {
      const args = await argsFor(registerCompressVideo, "compress-video", { quality });
      expect(flagValue(args, "-c:v")).toBe("libx264");
      seen.push(flagValue(args, "-crf") ?? "missing");
    }
    expect(seen).toEqual(["23", "28", "33"]);
  });
});

describe("convert-video quality on an NVENC host", () => {
  beforeEach(() => {
    process.env.SNAPOTTER_HW_ACCEL = "nvenc";
  });

  for (const format of ["mp4", "mov", "mkv", "avi"]) {
    it(`${format}: maps high/balanced/small to cq 18/23/28`, async () => {
      const seen: string[] = [];
      for (const quality of ["high", "balanced", "small"]) {
        const args = await argsFor(registerConvertVideo, "convert-video", { format, quality });
        expect(flagValue(args, "-c:v")).toBe("h264_nvenc");
        expect(args).not.toContain("-crf");
        seen.push(flagValue(args, "-cq") ?? "missing");
      }
      expect(seen).toEqual(["18", "23", "28"]);
    });
  }

  it("webm stays on libvpx-vp9 with its own crf scale", async () => {
    const args = await argsFor(registerConvertVideo, "convert-video", {
      format: "webm",
      quality: "balanced",
    });
    expect(flagValue(args, "-c:v")).toBe("libvpx-vp9");
    expect(flagValue(args, "-crf")).toBe("32");
  });
});
