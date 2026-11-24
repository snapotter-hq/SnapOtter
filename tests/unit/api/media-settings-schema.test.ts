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

  it.each(["trim-audio", "trim-video"])(
    "%s rejects windows shorter than 0.1s (#4960)",
    (toolId) => {
      // Below 0.1s, audio stream copy keeps no codec frame and a video window
      // may hold no frame, so either way the file comes back empty.
      expect(parses(toolId, { startS: 0, endS: 0.000001 })).toBe(false);
      expect(parses(toolId, { startS: 5, endS: 5.05 })).toBe(false);
      expect(parses(toolId, { startS: 9.9999, endS: 10 })).toBe(false);
      expect(parses(toolId, { startS: 5, endS: 5.1 })).toBe(true);
      expect(parses(toolId, { startS: 0, endS: 0.5 })).toBe(true);
    },
  );

  it.each(["trim-audio", "trim-video"])("%s still accepts a bare start/end range", (toolId) => {
    expect(parses(toolId, { startS: 1, endS: 4 })).toBe(true);
    expect(parses(toolId, { mode: "range", startS: 1, endS: 4 })).toBe(true);
  });

  it.each(["trim-audio", "trim-video"])("%s requires an end in range mode", (toolId) => {
    expect(parses(toolId, { startS: 1 })).toBe(false);
    expect(parses(toolId, { mode: "range", cutStartS: 1 })).toBe(false);
  });

  it.each(["trim-audio", "trim-video"])("%s cuts from the ends without an end time", (toolId) => {
    expect(parses(toolId, { mode: "ends", cutStartS: 2, cutEndS: 3 })).toBe(true);
    expect(parses(toolId, { mode: "ends", cutStartS: 2 })).toBe(true);
    expect(parses(toolId, { mode: "ends", cutEndS: 3 })).toBe(true);
  });

  it.each(["trim-audio", "trim-video"])("%s rejects an ends cut of nothing", (toolId) => {
    expect(parses(toolId, { mode: "ends" })).toBe(false);
    expect(parses(toolId, { mode: "ends", cutStartS: 0, cutEndS: 0 })).toBe(false);
  });

  it.each(["trim-audio", "trim-video"])("%s refuses fields from the other mode", (toolId) => {
    expect(parses(toolId, { mode: "ends", cutStartS: 1, endS: 5 })).toBe(false);
    expect(parses(toolId, { mode: "ends", cutStartS: 1, startS: 2 })).toBe(false);
    expect(parses(toolId, { startS: 1, endS: 4, cutEndS: 2 })).toBe(false);
    expect(parses(toolId, { mode: "range", startS: 1, endS: 4, cutStartS: 0, cutEndS: 0 })).toBe(
      true,
    );
  });

  it.each(["trim-audio", "trim-video"])("%s rejects negative or non-finite cuts", (toolId) => {
    expect(parses(toolId, { mode: "ends", cutStartS: -1, cutEndS: 3 })).toBe(false);
    expect(parses(toolId, { mode: "ends", cutStartS: 1, cutEndS: Number.POSITIVE_INFINITY })).toBe(
      false,
    );
  });

  it("requires at least one representable fade duration", () => {
    expect(parses("fade-audio", { fadeInS: Number.MIN_VALUE, fadeOutS: 0 })).toBe(false);
    expect(parses("fade-audio", { fadeInS: 0, fadeOutS: 0.000001 })).toBe(true);
  });
});
