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
let allCapturedArgs: string[][] = [];

vi.mock("../../../packages/media-engine/src/index.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../packages/media-engine/src/index.js")>();
  return {
    ...actual,
    probeMedia: vi.fn(async () => ({
      durationS: 2,
      streams: [
        { type: "video", codec: "h264", width: 640, height: 360 },
        { type: "audio", codec: "aac", sampleRate: 48_000 },
      ],
    })),
    resolveFontFile: vi.fn(() => ({
      file: "/usr/share/fonts/DejaVuSans.ttf",
      family: "DejaVu Sans",
    })),
    runFfmpeg: vi.fn(async (args: string[]) => {
      capturedArgs = args;
      allCapturedArgs.push(args);
      return "";
    }),
  };
});

vi.mock("../../../apps/api/src/routes/tool-factory.js", () => ({
  createToolRoute: vi.fn((_app: unknown, config: RouteConfig) => {
    registered.push(config);
  }),
}));

vi.mock("../../../apps/api/src/lib/media-tool.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/lib/media-tool.js")>();
  return {
    ...actual,
    stageMediaInputs: vi.fn(async (ctx: { inputs: Array<{ filename: string }> }) =>
      ctx.inputs.map((inp, i) => `/scratch/in-${i}-${inp.filename}`),
    ),
    runFfmpegWithProgress: vi.fn(async (_ctx: unknown, args: string[]) => {
      capturedArgs = args;
      allCapturedArgs.push(args);
      return "";
    }),
    runMediaTool: vi.fn(
      async (
        _ctx: unknown,
        _outName: string,
        argsFor: (inPath: string, outPath: string, info: unknown) => string[],
      ) => {
        const raw = argsFor("in.mp4", "out.mp4", { durationS: 1, audioSampleRate: 48_000 });
        capturedArgs = raw;
        allCapturedArgs.push(raw);
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
const { registerBurnSubtitles } = await import(
  "../../../apps/api/src/routes/tools/burn-subtitles.js"
);
const { registerGifToVideo } = await import("../../../apps/api/src/routes/tools/gif-to-video.js");
const { registerImagesToVideo } = await import(
  "../../../apps/api/src/routes/tools/images-to-video.js"
);
const { registerMergeVideos } = await import("../../../apps/api/src/routes/tools/merge-videos.js");
const { registerStabilizeVideo } = await import(
  "../../../apps/api/src/routes/tools/stabilize-video.js"
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
  "h264_vaapi",
  "hevc_vaapi",
]);

const ORIGINAL_ACCEL = process.env.SNAPOTTER_HW_ACCEL;

beforeEach(() => {
  registered.length = 0;
  capturedArgs = [];
  allCapturedArgs = [];
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

describe("compress-video and convert-video on a VAAPI host (#3977)", () => {
  beforeEach(() => {
    process.env.SNAPOTTER_HW_ACCEL = "vaapi";
  });

  it("compress-video at original resolution adds -vaapi_device before -i, -vf format=nv12,hwupload, and drops -pix_fmt", async () => {
    const seen: string[] = [];
    for (const quality of ["light", "balanced", "strong"]) {
      const args = await argsFor(registerCompressVideo, "compress-video", { quality });
      expect(args.slice(0, 2)).toEqual(["-vaapi_device", "/dev/dri/renderD128"]);
      expect(args.indexOf("-vaapi_device")).toBeLessThan(args.indexOf("-i"));
      expect(flagValue(args, "-vf")).toBe("format=nv12,hwupload");
      expect(flagValue(args, "-c:v")).toBe("h264_vaapi");
      expect(args).not.toContain("-pix_fmt");
      expect(args).not.toContain("-crf");
      seen.push(flagValue(args, "-qp") ?? "missing");
    }
    expect(seen).toEqual(["23", "28", "33"]);
  });

  it("compress-video with scaling chains format=nv12,hwupload onto the existing -vf instead of adding a second -vf", async () => {
    const args = await argsFor(registerCompressVideo, "compress-video", {
      quality: "balanced",
      resolution: "720p",
    });
    expect(args.slice(0, 2)).toEqual(["-vaapi_device", "/dev/dri/renderD128"]);
    expect(args.filter((a) => a === "-vf")).toHaveLength(1);
    expect(flagValue(args, "-vf")).toBe("scale=-2:720,format=nv12,hwupload");
    expect(flagValue(args, "-c:v")).toBe("h264_vaapi");
    expect(args).not.toContain("-pix_fmt");
  });

  for (const format of ["mp4", "mov", "mkv", "avi"]) {
    it(`convert-video (${format}): adds -vaapi_device, -vf format=nv12,hwupload, CQP qp 18/23/28, and no -pix_fmt`, async () => {
      const seen: string[] = [];
      for (const quality of ["high", "balanced", "small"]) {
        const args = await argsFor(registerConvertVideo, "convert-video", { format, quality });
        expect(args.slice(0, 2)).toEqual(["-vaapi_device", "/dev/dri/renderD128"]);
        expect(args.indexOf("-vaapi_device")).toBeLessThan(args.indexOf("-i"));
        expect(flagValue(args, "-vf")).toBe("format=nv12,hwupload");
        expect(flagValue(args, "-c:v")).toBe("h264_vaapi");
        expect(args).not.toContain("-pix_fmt");
        expect(args).not.toContain("-crf");
        seen.push(flagValue(args, "-qp") ?? "missing");
      }
      expect(seen).toEqual(["18", "23", "28"]);
    });
  }

  it("convert-video (webm): stays on libvpx-vp9 without VAAPI device or hwupload filter", async () => {
    const args = await argsFor(registerConvertVideo, "convert-video", {
      format: "webm",
      quality: "balanced",
    });
    expect(flagValue(args, "-c:v")).toBe("libvpx-vp9");
    expect(args).not.toContain("-vaapi_device");
    expect(args).not.toContain("-vf");
  });

  it("gif-to-video (mp4): chains format=nv12,hwupload onto its even-dimension scale filter", async () => {
    const args = await argsFor(registerGifToVideo, "gif-to-video", { format: "mp4" });
    expect(args.slice(0, 2)).toEqual(["-vaapi_device", "/dev/dri/renderD128"]);
    expect(args.filter((a) => a === "-vf")).toHaveLength(1);
    expect(flagValue(args, "-vf")).toBe("scale=trunc(iw/2)*2:trunc(ih/2)*2,format=nv12,hwupload");
    expect(flagValue(args, "-c:v")).toBe("h264_vaapi");
    expect(args).not.toContain("-pix_fmt");
  });

  it("burn-subtitles: chains format=nv12,hwupload onto the subtitles filter", async () => {
    registerBurnSubtitles({} as never);
    const route = registered.find((r) => r.toolId === "burn-subtitles");
    await route?.processV2({
      settings: { fontSize: 24 },
      scratchDir: "/scratch",
      inputs: [{ filename: "clip.mp4" }, { filename: "subs.srt" }],
    });
    expect(capturedArgs.slice(0, 2)).toEqual(["-vaapi_device", "/dev/dri/renderD128"]);
    expect(capturedArgs.filter((a) => a === "-vf")).toHaveLength(1);
    expect(flagValue(capturedArgs, "-vf")).toMatch(/^subtitles=.*,format=nv12,hwupload$/);
    expect(flagValue(capturedArgs, "-c:v")).toBe("h264_vaapi");
    expect(capturedArgs).not.toContain("-pix_fmt");
  });

  it("images-to-video: prepends -vaapi_device before -loop/-i and appends ;[v]format=nv12,hwupload[v] to -filter_complex", async () => {
    const { mkdtempSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const scratchDir = mkdtempSync(join(tmpdir(), "snapotter-vaapi-img2vid-"));
    try {
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64",
      );
      registerImagesToVideo({} as never);
      const route = registered.find((r) => r.toolId === "images-to-video");
      await route?.processV2({
        settings: {},
        scratchDir,
        inputs: [
          { filename: "a.png", buffer: png },
          { filename: "b.png", buffer: png },
        ],
      });
      expect(capturedArgs.slice(0, 2)).toEqual(["-vaapi_device", "/dev/dri/renderD128"]);
      expect(capturedArgs.indexOf("-vaapi_device")).toBeLessThan(capturedArgs.indexOf("-i"));
      expect(capturedArgs).not.toContain("-vf");
      expect(flagValue(capturedArgs, "-filter_complex")).toMatch(
        /concat=n=2:v=1:a=0\[v\];\[v\]format=nv12,hwupload\[v\]$/,
      );
      expect(flagValue(capturedArgs, "-c:v")).toBe("h264_vaapi");
      expect(capturedArgs).not.toContain("-pix_fmt");
    } finally {
      rmSync(scratchDir, { recursive: true, force: true });
    }
  });

  it("merge-videos: appends ;[v]format=nv12,hwupload[v] to -filter_complex", async () => {
    registerMergeVideos({} as never);
    const route = registered.find((r) => r.toolId === "merge-videos");
    await route?.processV2({
      settings: {},
      scratchDir: "/scratch",
      inputs: [{ filename: "a.mp4" }, { filename: "b.mp4" }],
    });
    expect(capturedArgs.slice(0, 2)).toEqual(["-vaapi_device", "/dev/dri/renderD128"]);
    expect(capturedArgs).not.toContain("-vf");
    expect(flagValue(capturedArgs, "-filter_complex")).toMatch(
      /concat=n=2:v=1:a=1\[v\]\[a\];\[v\]format=nv12,hwupload\[v\]$/,
    );
    expect(flagValue(capturedArgs, "-c:v")).toBe("h264_vaapi");
    expect(capturedArgs).not.toContain("-pix_fmt");
  });

  it("stabilize-video: leaves pass 1 software and chains format=nv12,hwupload onto pass 2 vidstabtransform", async () => {
    registerStabilizeVideo({} as never);
    const route = registered.find((r) => r.toolId === "stabilize-video");
    await route?.processV2({
      settings: { smoothing: 15 },
      scratchDir: "/scratch",
      inputs: [{ filename: "shaky.mp4" }],
      report: () => {},
    });
    expect(allCapturedArgs).toHaveLength(2);
    const [pass1, pass2] = allCapturedArgs;
    expect(pass1).not.toContain("-vaapi_device");
    expect(pass2.slice(0, 2)).toEqual(["-vaapi_device", "/dev/dri/renderD128"]);
    expect(pass2.filter((a) => a === "-vf")).toHaveLength(1);
    expect(flagValue(pass2, "-vf")).toMatch(
      /^vidstabtransform=input=.*:smoothing=15,format=nv12,hwupload$/,
    );
    expect(flagValue(pass2, "-c:v")).toBe("h264_vaapi");
    expect(pass2).not.toContain("-pix_fmt");
  });
});
