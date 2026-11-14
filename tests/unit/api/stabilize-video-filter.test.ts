import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setEncoderInventoryForTests } from "../../../packages/media-engine/src/encoders.js";

/**
 * #4371: libvidstab segfaults in vsFrameCopy when vidstabtransform sees a mix
 * of read-only and writable frames, which thread timing decides. A `copy`
 * filter in front gives it a fresh writable frame every time, so every
 * container's pass 2 must carry it.
 *
 * The route is a closure handed to createToolRoute, so the factory is replaced
 * with one that records the config, and the ffmpeg runners with ones that
 * record each argument list. resolveEncoder stays real, fed a pinned inventory.
 */

type RouteConfig = {
  toolId: string;
  processV2: (ctx: unknown) => Promise<unknown>;
};

const registered: RouteConfig[] = [];
let calls: string[][] = [];

vi.mock("../../../packages/media-engine/src/index.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../packages/media-engine/src/index.js")>();
  return {
    ...actual,
    probeMedia: vi.fn(async () => ({ durationS: 2, streams: [] })),
    runFfmpeg: vi.fn(async (args: string[]) => {
      calls.push(args);
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
    stageMediaInputs: vi.fn(async (ctx: { inputs: { filename: string }[] }) =>
      ctx.inputs.map((inp) => `/scratch/media/in-0-${inp.filename}`),
    ),
    runFfmpegWithProgress: vi.fn(async (_ctx: unknown, args: string[]) => {
      calls.push(args);
      return "";
    }),
  };
});

const { registerStabilizeVideo, vidstabTransformFilter } = await import(
  "../../../apps/api/src/routes/tools/stabilize-video.js"
);

beforeEach(() => {
  registered.length = 0;
  calls = [];
  setEncoderInventoryForTests(
    new Set(["libx264", "libvpx-vp9", "libopus", "libtheora", "libvorbis", "mpeg2video"]),
  );
});

afterEach(() => {
  setEncoderInventoryForTests(undefined);
});

async function run(filename: string) {
  registerStabilizeVideo({} as never);
  const route = registered.find((r) => r.toolId === "stabilize-video");
  if (!route) throw new Error("stabilize-video was not registered");
  await route.processV2({
    settings: { smoothing: 15 },
    scratchDir: "/scratch",
    inputs: [{ filename }],
    report: () => {},
  });
}

function flagValue(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
}

describe("stabilize-video pass 2 filter (#4371)", () => {
  it("puts copy in front of vidstabtransform", () => {
    expect(vidstabTransformFilter("/scratch/media/stab.trf", 30)).toBe(
      "copy,vidstabtransform=input=/scratch/media/stab.trf:smoothing=30",
    );
  });

  it.each([
    ["shaky.webm", "libvpx-vp9"],
    ["shaky.ogv", "libtheora"],
    ["shaky.mpg", "mpeg2video"],
    ["shaky.mp4", "libx264"],
    ["shaky.mkv", "libx264"],
  ])("feeds %s's vidstabtransform through copy", async (filename, encoder) => {
    await run(filename);

    expect(calls).toHaveLength(2);
    const [detect, transform] = calls;
    expect(flagValue(detect, "-vf")).toMatch(/^vidstabdetect=/);
    expect(flagValue(transform, "-vf")).toMatch(
      /^copy,vidstabtransform=input=\/scratch\/media\/stab\.trf:smoothing=15$/,
    );
    expect(flagValue(transform, "-c:v")).toBe(encoder);
  });
});
