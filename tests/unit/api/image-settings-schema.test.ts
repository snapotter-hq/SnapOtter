import type { FastifyInstance } from "fastify";
import { beforeAll, describe, expect, it } from "vitest";
import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import { registerCompress } from "../../../apps/api/src/routes/tools/compress.js";
import { registerConvert } from "../../../apps/api/src/routes/tools/convert.js";
import { registerGifTools } from "../../../apps/api/src/routes/tools/gif-tools.js";
import { registerOptimizeForWeb } from "../../../apps/api/src/routes/tools/optimize-for-web.js";
import { registerResize } from "../../../apps/api/src/routes/tools/resize.js";
import { registerSplit } from "../../../apps/api/src/routes/tools/split.js";

const app = {
  post: () => undefined,
} as unknown as FastifyInstance;

beforeAll(() => {
  registerConvert(app);
  registerCompress(app);
  registerOptimizeForWeb(app);
  registerResize(app);
  registerSplit(app);
  registerGifTools(app);
});

function parses(toolId: string, settings: Record<string, unknown>): boolean {
  const config = getToolConfig(toolId);
  if (!config) throw new Error(`${toolId} must be registered`);
  return config.settingsSchema.safeParse(settings).success;
}

describe("Sharp-backed image settings schemas", () => {
  it.each([
    ["convert", { format: "jpg", quality: 50.5 }],
    ["compress", { quality: 50.5 }],
    ["optimize-for-web", { quality: 50.5 }],
    ["split", { quality: 50.5 }],
    ["gif-tools", { mode: "optimize", effort: 5.5 }],
  ])("rejects fractional integer settings for %s", (toolId, settings) => {
    expect(parses(toolId, settings)).toBe(false);
  });

  it.each([
    ["optimize-for-web", { maxWidth: 640.5 }],
    ["optimize-for-web", { maxHeight: Number.POSITIVE_INFINITY }],
    ["split", { columns: 2.5 }],
    ["split", { rows: 2.5 }],
    ["split", { tileWidth: 20.5 }],
    ["split", { tileHeight: 20.5 }],
    ["gif-tools", { width: 100.5 }],
    ["gif-tools", { height: 100.5 }],
    ["gif-tools", { colors: 16.5 }],
    ["gif-tools", { frameNumber: 1.5 }],
    ["gif-tools", { frameStart: 1.5 }],
    ["gif-tools", { frameEnd: 1.5 }],
    ["gif-tools", { loop: 1.5 }],
  ])("rejects non-integer dimensions or counts for %s", (toolId, settings) => {
    expect(parses(toolId, settings)).toBe(false);
  });

  it("rejects a non-finite resize percentage", () => {
    expect(parses("resize", { percentage: Number.POSITIVE_INFINITY })).toBe(false);
  });
});
