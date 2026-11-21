import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CONVERSION_PRESETS } from "@snapotter/shared";
import type { FastifyInstance } from "fastify";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const runFfmpegWithProgressMock = vi.fn();

vi.mock("../../../apps/api/src/lib/media-tool.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/lib/media-tool.js")>();
  return {
    ...actual,
    runFfmpegWithProgress: (...args: unknown[]) => runFfmpegWithProgressMock(...args),
  };
});

import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import { registerConversionPresets } from "../../../apps/api/src/routes/tools/conversion-presets.js";
import { registerConvertSubtitles } from "../../../apps/api/src/routes/tools/convert-subtitles.js";

const SUBTITLE_PRESETS = CONVERSION_PRESETS.filter((p) => p.base === "convert-subtitles");

const app = {
  post: vi.fn(),
  get: vi.fn(),
  log: { error: vi.fn() },
} as unknown as FastifyInstance;

beforeAll(() => {
  registerConvertSubtitles(app);
  registerConversionPresets(app);
});

beforeEach(() => {
  runFfmpegWithProgressMock.mockReset().mockResolvedValue("");
});

describe("subtitle conversion presets (#5052)", () => {
  it("validates uploads as subtitles, like convert-subtitles, not as video", () => {
    expect(SUBTITLE_PRESETS.length).toBeGreaterThan(0);
    for (const preset of SUBTITLE_PRESETS) {
      expect(getToolConfig(preset.id)?.inputKinds, preset.id).toEqual(["subtitle"]);
    }
  });

  it.each([
    ["srt-to-vtt", "talk.srt", "talk.vtt", "text/vtt"],
    ["vtt-to-srt", "talk.vtt", "talk.srt", "application/x-subrip"],
    ["ass-to-srt", "talk.ass", "talk.srt", "application/x-subrip"],
    ["srt-to-ass", "talk.srt", "talk.ass", "text/x-ssa"],
  ])("%s writes %s as %s", async (presetId, input, output, contentType) => {
    const config = getToolConfig(presetId);
    if (!config?.processV2) throw new Error(`${presetId} must be registered`);
    const scratchDir = await mkdtemp(join(tmpdir(), "snapotter-subtitle-presets-"));
    try {
      const result = await config.processV2({
        inputs: [{ buffer: Buffer.from("Caf\xe9", "latin1"), filename: input, ref: "in" }],
        settings: config.settingsSchema.parse({}),
        scratchDir,
        signal: new AbortController().signal,
        report: vi.fn(),
      });

      const inPath = join(scratchDir, "media", `in-0-${input}`);
      const outPath = join(scratchDir, "media", output);
      expect(runFfmpegWithProgressMock).toHaveBeenCalledWith(
        expect.anything(),
        ["-i", inPath, outPath],
        null,
      );
      // The base's encoding default still applies: Windows-1252 is decoded to UTF-8.
      expect(await readFile(inPath, "utf8")).toBe("Café");
      expect(result).toEqual({ scratchPath: outPath, filename: output, contentType });
    } finally {
      await rm(scratchDir, { recursive: true, force: true });
    }
  });
});
