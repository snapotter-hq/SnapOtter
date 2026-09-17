/**
 * Defringe post-processing for transparency-fixer (#1082).
 *
 * The matting model is mocked so this needs no AI bundle. What it pins is the
 * sharp arithmetic that runs after the model: defringe may trim a thin ring
 * just inside the subject's edge, and must leave everything else alone.
 */

import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runAiToolJob } from "../../../apps/api/src/jobs/ai-handlers.js";
import type { ToolJobData } from "../../../apps/api/src/jobs/types.js";
import type { ToolProcessCtx } from "../../../apps/api/src/routes/tool-factory.js";
// Importing the route module registers its AI job handler.
import "../../../apps/api/src/routes/tools/transparency-fixer.js";

const aiMocks = vi.hoisted(() => ({
  isMemoryAllocError: vi.fn(),
  removeBackground: vi.fn(),
}));

vi.mock("@snapotter/ai", () => ({
  isMemoryAllocError: aiMocks.isMemoryAllocError,
  removeBackground: aiMocks.removeBackground,
}));

// Non-square on purpose, so a swapped width/height in a raw descriptor shows up.
const WIDTH = 200;
const HEIGHT = 140;
// The subject is the 120x60 rectangle spanning x in [40, 160) and y in [40, 100).
const SUBJECT_LEFT = 40;
const SUBJECT_RIGHT = 160;
const SUBJECT_TOP = 40;
const SUBJECT_BOTTOM = 100;
const CLEARED = Buffer.from([0, 0, 0, 0]);

/** RGBA PNG: a fully opaque rectangular subject on a fully transparent ground. */
async function opaqueSubjectPng(): Promise<Buffer> {
  const raw = Buffer.alloc(WIDTH * HEIGHT * 4, 0);
  for (let y = SUBJECT_TOP; y < SUBJECT_BOTTOM; y++) {
    for (let x = SUBJECT_LEFT; x < SUBJECT_RIGHT; x++) {
      raw.set([200, 80, 40, 255], (y * WIDTH + x) * 4);
    }
  }
  return sharp(raw, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } })
    .png()
    .toBuffer();
}

async function decodeRgba(png: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  expect([info.width, info.height, info.channels]).toEqual([WIDTH, HEIGHT, 4]);
  return data;
}

/** Pixels from (x, y) to the nearest subject edge; negative outside the subject. */
function depthInsideSubject(x: number, y: number): number {
  return Math.min(x - SUBJECT_LEFT, SUBJECT_RIGHT - 1 - x, y - SUBJECT_TOP, SUBJECT_BOTTOM - 1 - y);
}

/**
 * Every pixel that differs between input and output must be a cleared pixel
 * inside the subject and shallower than `ringWidth`. Returns the erased count.
 */
function expectOnlyEdgeRingErased(input: Buffer, output: Buffer, ringWidth: number): number {
  let erased = 0;
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const offset = (y * WIDTH + x) * 4;
      const before = input.subarray(offset, offset + 4);
      const after = output.subarray(offset, offset + 4);
      if (before.equals(after)) continue;

      const depth = depthInsideSubject(x, y);
      const where = `pixel (${x}, ${y}) at depth ${depth}`;
      expect(depth, `${where} changed but lies outside the subject`).toBeGreaterThanOrEqual(0);
      expect(depth, `${where} changed but lies deep inside the subject`).toBeLessThan(ringWidth);
      expect(after.equals(CLEARED), `${where} changed but was not cleared`).toBe(true);
      erased++;
    }
  }
  return erased;
}

function job(settings: unknown): ToolJobData {
  return {
    jobId: "job-transparency-fixer",
    toolId: "transparency-fixer",
    userId: null,
    pool: "ai",
    inputRefs: ["uploads/job-transparency-fixer/photo.png"],
    filename: "photo.png",
    settings,
    kind: "ai-tool",
  };
}

const ctx: ToolProcessCtx = {
  signal: new AbortController().signal,
  scratchDir: join(tmpdir(), "snapotter-transparency-fixer-defringe-test"),
  report: vi.fn(),
};

async function runDefringe(settings: Record<string, unknown>) {
  const matte = await opaqueSubjectPng();
  aiMocks.removeBackground.mockResolvedValue(matte);
  const result = await runAiToolJob(job(settings), matte, ctx);
  return { input: await decodeRgba(matte), output: await decodeRgba(result.buffer) };
}

beforeEach(() => {
  vi.clearAllMocks();
  aiMocks.isMemoryAllocError.mockReturnValue(false);
});

describe("transparency-fixer defringe", () => {
  it("keeps an opaque subject intact at the default setting", async () => {
    const { input, output } = await runDefringe({});

    // Default defringe (30) blurs with radius 2 and trims corners at most.
    expectOnlyEdgeRingErased(input, output, 3);
  });

  it("only widens the edge ring at the maximum setting", async () => {
    const { input, output } = await runDefringe({ defringe: 100 });

    // Defringe 100 blurs with radius 5; the ring measured 5px deep, and the
    // corners always go, so a defringe that silently became a no-op fails here.
    const erased = expectOnlyEdgeRingErased(input, output, 8);
    expect(erased).toBeGreaterThan(0);
  });

  it("changes nothing at zero", async () => {
    const { input, output } = await runDefringe({ defringe: 0 });
    expect(output.equals(input)).toBe(true);
  });
});
