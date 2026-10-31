import { SafeError } from "@snapotter/shared";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

const compressDetailedMock = vi.hoisted(() => vi.fn());

vi.mock("@snapotter/image-engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@snapotter/image-engine")>();
  return {
    ...actual,
    compressDetailed: compressDetailedMock,
  };
});

import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import { registerCompress } from "../../../apps/api/src/routes/tools/compress.js";
import { pairwise } from "../../helpers/pairwise.js";
import { pairwiseSettingsFor } from "../../helpers/tool-default-settings.js";
import { compactCase, deriveAxes } from "../../helpers/zod-pict.js";

const app = { post: () => undefined } as unknown as FastifyInstance;
registerCompress(app);

function requireCompressConfig() {
  const config = getToolConfig("compress");
  if (!config?.processV2) {
    throw new Error("compress processV2 not registered");
  }
  return { config, processV2: config.processV2 };
}

describe("compress route target-size buffer reuse and size guard (#1379)", () => {
  let sampleJpg: Buffer;

  beforeEach(async () => {
    compressDetailedMock.mockReset();
    sampleJpg = await sharp({
      create: { width: 64, height: 64, channels: 3, background: "#336699" },
    })
      .jpeg({ quality: 90 })
      .toBuffer();
  });

  it("uses result.buffer directly in target-size mode without calling result.image.toBuffer()", async () => {
    const winningBytes = Buffer.alloc(1_500, 0x42);
    const toBufferSpy = vi.fn().mockRejectedValue(new Error("should not re-encode result.image"));
    compressDetailedMock.mockResolvedValue({
      image: { toBuffer: toBufferSpy },
      buffer: winningBytes,
      resizedTo: { width: 48, height: 48 },
    });

    const { processV2 } = requireCompressConfig();

    const out = await processV2({
      inputs: [{ buffer: sampleJpg, filename: "photo.jpg", ref: "uploads/test/photo.jpg" }],
      settings: { mode: "targetSize", targetSizeKb: 2 },
      scratchDir: "/tmp",
      signal: new AbortController().signal,
      report: () => undefined,
    });

    expect(toBufferSpy).not.toHaveBeenCalled();
    expect(out.buffer).toBe(winningBytes);
    expect(out.resultPayload).toEqual({
      targetKb: 2,
      resizedTo: { width: 48, height: 48 },
    });
  });

  it("accepts a buffer whose length exactly equals targetSizeBytes", async () => {
    const exactBytes = Buffer.alloc(2_000, 0x42);
    compressDetailedMock.mockResolvedValue({
      image: { toBuffer: vi.fn() },
      buffer: exactBytes,
    });

    const { processV2 } = requireCompressConfig();
    const out = await processV2({
      inputs: [{ buffer: sampleJpg, filename: "photo.jpg", ref: "uploads/test/photo.jpg" }],
      settings: { mode: "targetSize", targetSizeKb: 2 },
      scratchDir: "/tmp",
      signal: new AbortController().signal,
      report: () => undefined,
    });

    expect(out.buffer).toBe(exactBytes);
  });

  it("throws a bug-kind SafeError when the returned buffer exceeds targetSizeBytes", async () => {
    const oversized = Buffer.alloc(2_001, 0x42);
    compressDetailedMock.mockResolvedValue({
      image: { toBuffer: vi.fn() },
      buffer: oversized,
    });

    const { processV2 } = requireCompressConfig();
    let caught: unknown;
    try {
      await processV2({
        inputs: [{ buffer: sampleJpg, filename: "photo.jpg", ref: "uploads/test/photo.jpg" }],
        settings: { mode: "targetSize", targetSizeKb: 2 },
        scratchDir: "/tmp",
        signal: new AbortController().signal,
        report: () => undefined,
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(SafeError);
    expect(caught).toMatchObject({
      name: "SafeError",
      isSafeMessage: true,
      kind: "bug",
      code: "TARGET_SIZE_EXCEEDED",
      message: "Compressed image exceeded target size",
    });
  });

  it("also guards targetSizeBytes when falling back to result.image.toBuffer()", async () => {
    const oversized = Buffer.alloc(2_001, 0x42);
    const toBufferSpy = vi.fn().mockResolvedValue(oversized);
    compressDetailedMock.mockResolvedValue({
      image: { toBuffer: toBufferSpy },
    });

    const { processV2 } = requireCompressConfig();
    let caught: unknown;
    try {
      await processV2({
        inputs: [{ buffer: sampleJpg, filename: "photo.jpg", ref: "uploads/test/photo.jpg" }],
        settings: { mode: "targetSize", targetSizeKb: 2 },
        scratchDir: "/tmp",
        signal: new AbortController().signal,
        report: () => undefined,
      });
    } catch (err) {
      caught = err;
    }

    expect(toBufferSpy).toHaveBeenCalledTimes(1);
    expect(caught).toBeInstanceOf(SafeError);
    expect(caught).toMatchObject({
      name: "SafeError",
      isSafeMessage: true,
      kind: "bug",
      code: "TARGET_SIZE_EXCEEDED",
      message: "Compressed image exceeded target size",
    });
  });

  it("falls back to result.image.toBuffer() in quality mode when result.buffer is undefined", async () => {
    const encoded = Buffer.alloc(900, 0x11);
    const toBufferSpy = vi.fn().mockResolvedValue(encoded);
    compressDetailedMock.mockResolvedValue({
      image: { toBuffer: toBufferSpy },
    });

    const { config } = requireCompressConfig();
    const out = await config.process(sampleJpg, { mode: "quality", quality: 75 }, "photo.jpg");

    expect(toBufferSpy).toHaveBeenCalledTimes(1);
    expect(out.buffer).toBe(encoded);
  });

  it("rejects mode=targetSize when targetSizeKb is omitted or misspelled (#2615)", async () => {
    const { config, processV2 } = requireCompressConfig();

    for (const invalidSettings of [
      { mode: "targetSize" },
      { mode: "targetSize", targetKb: 10 },
      { mode: "targetSize", targetSize: 10 },
    ]) {
      const parsed = config.settingsSchema.safeParse(invalidSettings);
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.issues[0]?.path).toEqual(["targetSizeKb"]);
        expect(parsed.error.issues[0]?.message).toMatch(/targetSizeKb/i);
      }

      await expect(config.process(sampleJpg, invalidSettings, "photo.jpg")).rejects.toThrow(
        /targetSizeKb/i,
      );
      await expect(
        processV2({
          inputs: [{ buffer: sampleJpg, filename: "photo.jpg", ref: "uploads/test/photo.jpg" }],
          settings: invalidSettings,
          scratchDir: "/tmp",
          signal: new AbortController().signal,
          report: () => undefined,
        }),
      ).rejects.toThrow(/targetSizeKb/i);
    }

    expect(compressDetailedMock).not.toHaveBeenCalled();
  });

  it("keeps both quality and targetSize modes reachable in pairwise sampling (#2615)", () => {
    const { config } = requireCompressConfig();
    const axes = deriveAxes(config.settingsSchema);
    const base = pairwiseSettingsFor("compress");
    const cases = pairwise(axes)
      .map((combo) => ({ ...base, ...compactCase(combo) }))
      .map((combo) => config.settingsSchema.safeParse(combo))
      .filter((parsed): parsed is { success: true; data: { mode: string } } => parsed.success);

    const modes = new Set(cases.map((c) => c.data.mode));
    expect(modes).toEqual(new Set(["quality", "targetSize"]));
  });
});
