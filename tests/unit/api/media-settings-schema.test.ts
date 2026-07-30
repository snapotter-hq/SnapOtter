import type { FastifyInstance } from "fastify";
import { beforeAll, describe, expect, it } from "vitest";
import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import { registerFadeAudio } from "../../../apps/api/src/routes/tools/fade-audio.js";
import { registerRingtoneMaker } from "../../../apps/api/src/routes/tools/ringtone-maker.js";
import { registerTrimAudio } from "../../../apps/api/src/routes/tools/trim-audio.js";
import { registerTrimVideo } from "../../../apps/api/src/routes/tools/trim-video.js";
import { registerVideoToGif } from "../../../apps/api/src/routes/tools/video-to-gif.js";

const app = {
  post: () => undefined,
} as unknown as FastifyInstance;

beforeAll(() => {
  registerTrimAudio(app);
  registerTrimVideo(app);
  registerFadeAudio(app);
  registerRingtoneMaker(app);
  registerVideoToGif(app);
});

function parses(toolId: string, settings: Record<string, unknown>): boolean {
  const config = getToolConfig(toolId);
  if (!config) throw new Error(`${toolId} must be registered`);
  return config.settingsSchema.safeParse(settings).success;
}

describe("media time settings schemas", () => {
  it.each([
    ["trim-audio", { startS: 0, endS: Number.POSITIVE_INFINITY }],
    ["trim-video", { startS: 0, endS: Number.POSITIVE_INFINITY }],
    ["fade-audio", { fadeInS: Number.POSITIVE_INFINITY, fadeOutS: 0 }],
    ["ringtone-maker", { startS: Number.POSITIVE_INFINITY, durationS: 1 }],
    ["video-to-gif", { startS: Number.POSITIVE_INFINITY, durationS: 1 }],
  ])("rejects non-finite FFmpeg times for %s", (toolId, settings) => {
    expect(parses(toolId, settings)).toBe(false);
  });

  it("requires a representable trim duration", () => {
    expect(parses("trim-audio", { startS: 0, endS: Number.MIN_VALUE })).toBe(false);
    expect(parses("trim-video", { startS: 0, endS: Number.MIN_VALUE })).toBe(false);
  });

  it("rejects trim-audio windows shorter than the stream-copy floor", () => {
    // Stream copy cannot cut below one codec frame (mp3 ~26ms, flac up to
    // ~93ms), so windows under 0.1s ship a file with zero audio frames.
    expect(parses("trim-audio", { startS: 0, endS: 0.000001 })).toBe(false);
    expect(parses("trim-audio", { startS: 5, endS: 5.05 })).toBe(false);
    expect(parses("trim-audio", { startS: 0, endS: 0.5 })).toBe(true);
  });

  it("requires at least one representable fade duration", () => {
    expect(parses("fade-audio", { fadeInS: Number.MIN_VALUE, fadeOutS: 0 })).toBe(false);
    expect(parses("fade-audio", { fadeInS: 0, fadeOutS: 0.000001 })).toBe(true);
  });
});
