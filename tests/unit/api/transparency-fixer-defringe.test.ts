/**
 * Defringe post-processing for transparency-fixer (#1082).
 *
 * The matting model is mocked so this needs no AI bundle. What it pins is the
 * sharp arithmetic that runs after the model: defringe may trim a thin ring
 * just inside the subject's edge, and must leave everything else alone. That
 * holds for a semi-transparent subject too: soft alpha is what a matting model
 * is for, so a uniform 55% region is subject, not fringe (#1178).
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

type AlphaAt = (x: number, y: number) => number;

/** RGBA PNG in the subject's colour, with alpha from `alphaAt`. */
async function mattePng(alphaAt: AlphaAt): Promise<Buffer> {
  const raw = Buffer.alloc(WIDTH * HEIGHT * 4, 0);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const alpha = alphaAt(x, y);
      if (alpha > 0) raw.set([200, 80, 40, alpha], (y * WIDTH + x) * 4);
    }
  }
  return sharp(raw, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } })
    .png()
    .toBuffer();
}

/** The rectangular subject at `subjectAlpha` on a fully transparent ground. */
function uniformSubject(subjectAlpha: number): AlphaAt {
  return (x, y) => (depthInsideSubject(x, y) >= 0 ? subjectAlpha : 0);
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

async function runDefringe(settings: Record<string, unknown>, alphaAt = uniformSubject(255)) {
  const matte = await mattePng(alphaAt);
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

  // Alpha 140 at the default, 160 at 60 and 200 at 100 each sat just under
  // the old absolute threshold, which cleared the whole subject.
  it.each([
    { subjectAlpha: 140, defringe: 30, ringWidth: 3 },
    { subjectAlpha: 160, defringe: 60, ringWidth: 6 },
    { subjectAlpha: 200, defringe: 100, ringWidth: 8 },
    { subjectAlpha: 100, defringe: 1, ringWidth: 2 },
  ])(
    "keeps the interior of a subject at alpha $subjectAlpha with defringe $defringe",
    async ({ subjectAlpha, defringe, ringWidth }) => {
      const { input, output } = await runDefringe({ defringe }, uniformSubject(subjectAlpha));
      expectOnlyEdgeRingErased(input, output, ringWidth);
    },
  );

  it("trims a soft subject's edge exactly as it trims an opaque one", async () => {
    const opaque = await runDefringe({ defringe: 100 });
    const soft = await runDefringe({ defringe: 100 }, uniformSubject(140));

    // Cleared pixels are where the output alpha went to zero.
    const cleared = (out: Buffer) =>
      Array.from({ length: WIDTH * HEIGHT }, (_, i) => out[i * 4 + 3] === 0);
    expect(cleared(soft.output)).toEqual(cleared(opaque.output));
  });

  it("leaves the seam where an opaque region meets a soft one", async () => {
    // Left half opaque, right half at alpha 140, touching with no gap. The
    // seam has no background near it, so nothing there is fringe; only the
    // subject's outer edge may be trimmed.
    const seamX = (SUBJECT_LEFT + SUBJECT_RIGHT) / 2;
    const { input, output } = await runDefringe({ defringe: 100 }, (x, y) => {
      if (depthInsideSubject(x, y) < 0) return 0;
      return x < seamX ? 255 : 140;
    });
    // Where the seam reaches the outer edge the soft half thins the
    // neighbourhood, so the trim there runs as deep as the blur reads (9px at
    // defringe 100) and no deeper. The old rule cleared the whole soft half.
    expectOnlyEdgeRingErased(input, output, 9);
  });

  it("still clears a faint halo around an opaque subject", async () => {
    // A 3px ring at alpha 40 just outside the subject: what defringe is for.
    const haloWidth = 3;
    const { output } = await runDefringe({}, (x, y) => {
      const depth = depthInsideSubject(x, y);
      if (depth >= 0) return 255;
      return depth >= -haloWidth ? 40 : 0;
    });

    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        if (depthInsideSubject(x, y) >= 0) continue;
        const alpha = output[(y * WIDTH + x) * 4 + 3];
        expect(alpha, `halo pixel (${x}, ${y}) survived`).toBe(0);
      }
    }
  });

  it("changes nothing at zero", async () => {
    const { input, output } = await runDefringe({ defringe: 0 });
    expect(output.equals(input)).toBe(true);
  });
});
