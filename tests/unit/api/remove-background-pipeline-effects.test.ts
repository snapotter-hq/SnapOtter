import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { runAiToolJob } from "../../../apps/api/src/jobs/ai-handlers.js";
import type { ToolJobData } from "../../../apps/api/src/jobs/types.js";
import type { ToolProcessCtx } from "../../../apps/api/src/routes/tool-factory.js";
import { registerRemoveBackground } from "../../../apps/api/src/routes/tools/remove-background.js";

const aiMocks = vi.hoisted(() => ({ removeBackground: vi.fn() }));

vi.mock("@snapotter/ai", () => ({ removeBackground: aiMocks.removeBackground }));

const ctx: ToolProcessCtx = {
  signal: new AbortController().signal,
  scratchDir: join(tmpdir(), "snapotter-remove-bg-effects-test"),
  report: vi.fn(),
};

let original: Buffer;
let transparent: Buffer;

beforeAll(async () => {
  original = await sharp({
    create: { width: 20, height: 20, channels: 3, background: { r: 0, g: 0, b: 255 } },
  })
    .png()
    .toBuffer();
  // Fully transparent subject: whatever shows through is the background layer.
  transparent = await sharp({
    create: { width: 20, height: 20, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .png()
    .toBuffer();
  aiMocks.removeBackground.mockResolvedValue(transparent);
  registerRemoveBackground({ post: vi.fn() } as unknown as FastifyInstance);
});

function job(kind: ToolJobData["kind"], settings: unknown): ToolJobData {
  return {
    jobId: "job-remove-background",
    toolId: "remove-background",
    userId: null,
    pool: "ai",
    inputRefs: ["uploads/job-remove-background/photo.jpg"],
    filename: "photo.jpg",
    settings,
    kind,
  };
}

async function cornerPixel(buffer: Buffer) {
  const { data } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return [...data.subarray(0, 4)];
}

describe("remove-background AI handler in pipelines and batches (#1047)", () => {
  it.each(["pipeline-step", "batch-child"] as const)(
    "composites the chosen color for a %s job",
    async (kind) => {
      const out = await runAiToolJob(
        job(kind, { backgroundType: "color", backgroundColor: "#FF0000" }),
        original,
        ctx,
      );

      expect(out.filename).toBe("photo_nobg.png");
      expect(out.contentType).toBe("image/png");
      expect(out.extraOutputs ?? []).toEqual([]);
      expect(await cornerPixel(out.buffer)).toEqual([255, 0, 0, 255]);
    },
  );

  it("honours the webp output format and names the file to match", async () => {
    const out = await runAiToolJob(
      job("pipeline-step", {
        backgroundType: "color",
        backgroundColor: "#00FF00",
        outputFormat: "webp",
      }),
      original,
      ctx,
    );

    expect(out.filename).toBe("photo_nobg.webp");
    expect(out.contentType).toBe("image/webp");
    expect((await sharp(out.buffer).metadata()).format).toBe("webp");
  });

  it("keeps a transparent cutout named photo_nobg.png when no background is asked for", async () => {
    const out = await runAiToolJob(job("pipeline-step", {}), original, ctx);

    expect(out.filename).toBe("photo_nobg.png");
    expect((await cornerPixel(out.buffer))[3]).toBe(0);
  });

  it("leaves the standalone Phase 1 contract alone: transparent mask plus original", async () => {
    const out = await runAiToolJob(
      job("ai-tool", { backgroundType: "color", backgroundColor: "#FF0000" }),
      original,
      ctx,
    );

    expect(out.filename).toBe("photo_mask.png");
    expect(out.buffer).toEqual(transparent);
    expect(out.extraOutputs?.map((e) => e.name)).toEqual(["photo_original.png"]);
  });
});
