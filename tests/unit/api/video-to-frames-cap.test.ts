import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InputValidationError } from "../../../apps/api/src/modality/contract.js";

/**
 * #4295: all mode caps the estimated frame count at 2000 and timestamps mode
 * at 50, but every-Nth mode had no cap, so a small N on a long clip wrote an
 * unbounded number of frames before zipping them.
 */

type RouteConfig = { toolId: string; processV2: (ctx: unknown) => Promise<unknown> };

const registered: RouteConfig[] = [];
let durationS = 0;
const ffmpegRuns: string[][] = [];

vi.mock("../../../packages/media-engine/src/index.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../packages/media-engine/src/index.js")>();
  return {
    ...actual,
    probeMedia: vi.fn(async () => ({ durationS, streams: [] })),
    runFfmpeg: vi.fn(async (args: string[]) => {
      ffmpegRuns.push(args);
      const pattern = args[args.length - 1];
      writeFileSync(pattern.replace("%06d", "000001"), "frame");
      return "";
    }),
  };
});

vi.mock("../../../apps/api/src/routes/tool-factory.js", () => ({
  createToolRoute: vi.fn((_app: unknown, config: RouteConfig) => {
    registered.push(config);
  }),
}));

vi.mock("../../../apps/api/src/lib/media-tool.js", () => ({
  stageMediaInputs: vi.fn(async () => ["/scratch/in.mp4"]),
}));

const { registerVideoToFrames } = await import(
  "../../../apps/api/src/routes/tools/video-to-frames.js"
);

let scratchDir: string;

beforeEach(() => {
  registered.length = 0;
  ffmpegRuns.length = 0;
  scratchDir = mkdtempSync(join(tmpdir(), "snapotter-frames-cap-"));
  mkdirSync(join(scratchDir, "media"), { recursive: true });
});

afterEach(() => {
  rmSync(scratchDir, { recursive: true, force: true });
});

async function run(settings: Record<string, unknown>, seconds: number) {
  durationS = seconds;
  registerVideoToFrames({} as never);
  const route = registered.find((r) => r.toolId === "video-to-frames");
  if (!route) throw new Error("video-to-frames did not register");
  return route.processV2({
    settings,
    scratchDir,
    inputs: [{ filename: "clip.mp4" }],
    report: vi.fn(),
    signal: undefined,
  });
}

describe("video-to-frames every-Nth frame cap", () => {
  it("rejects a long clip at a small N before running ffmpeg", async () => {
    await expect(run({ mode: "nth", n: 2 }, 200)).rejects.toBeInstanceOf(InputValidationError);
    expect(ffmpegRuns).toHaveLength(0);
  });

  it("accepts the same clip at an N that keeps the estimate under the ceiling", async () => {
    await expect(run({ mode: "nth", n: 1000 }, 200)).resolves.toMatchObject({
      contentType: "application/zip",
    });
    expect(ffmpegRuns).toHaveLength(1);
  });

  it("accepts a shorter clip at the smallest N", async () => {
    await run({ mode: "nth", n: 2 }, 60);
    expect(ffmpegRuns).toHaveLength(1);
  });

  it("allows an estimate of exactly 2000 frames, like all mode", async () => {
    await run({ mode: "nth", n: 3 }, 200);
    expect(ffmpegRuns).toHaveLength(1);
  });

  it("still rejects all mode over the same ceiling", async () => {
    await expect(run({ mode: "all" }, 100)).rejects.toBeInstanceOf(InputValidationError);
  });
});
