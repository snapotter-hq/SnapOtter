import type { FastifyInstance } from "fastify";
import { beforeAll, describe, expect, it } from "vitest";
import { settingsSchema as beautifySettingsSchema } from "../../../apps/api/src/lib/beautify/constants.js";
import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import { registerColorAdjustments } from "../../../apps/api/src/routes/tools/adjust-colors.js";
import { registerBorder } from "../../../apps/api/src/routes/tools/border.js";
import { registerCompress } from "../../../apps/api/src/routes/tools/compress.js";
import { registerConvert } from "../../../apps/api/src/routes/tools/convert.js";
import { registerGifTools } from "../../../apps/api/src/routes/tools/gif-tools.js";
import { registerLqipPlaceholder } from "../../../apps/api/src/routes/tools/lqip-placeholder.js";
import { registerOptimizeForWeb } from "../../../apps/api/src/routes/tools/optimize-for-web.js";
import { registerResize } from "../../../apps/api/src/routes/tools/resize.js";
import { registerRotate } from "../../../apps/api/src/routes/tools/rotate.js";
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
  registerColorAdjustments(app);
  registerBorder(app);
  registerLqipPlaceholder(app);
  registerRotate(app);
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

  it.each([
    ["adjust-colors", { hue: Number.MIN_VALUE }],
    ["border", { padding: Number.MIN_VALUE }],
    ["border", { shadowOffsetX: 0.5 }],
  ])(
    "rejects values that downstream Sharp operations cannot represent for %s",
    (toolId, settings) => {
      expect(parses(toolId, settings)).toBe(false);
    },
  );

  it("accepts either disabled or Sharp-supported LQIP blur values", () => {
    expect(parses("lqip-placeholder", { blur: 0 })).toBe(true);
    expect(parses("lqip-placeholder", { blur: 0.3 })).toBe(true);
    expect(parses("lqip-placeholder", { blur: Number.MIN_VALUE })).toBe(false);
  });

  it("rejects fractional Beautify pixel geometry", () => {
    expect(beautifySettingsSchema.safeParse({ padding: Number.MIN_VALUE }).success).toBe(false);
    expect(beautifySettingsSchema.safeParse({ shadowOffsetY: 0.5 }).success).toBe(false);
  });

  it("rejects Beautify colors that Sharp cannot decode", () => {
    expect(beautifySettingsSchema.safeParse({ backgroundColor: "" }).success).toBe(false);
    expect(
      beautifySettingsSchema.safeParse({ shadowPreset: "custom", shadowColor: "" }).success,
    ).toBe(false);
    expect(
      beautifySettingsSchema.safeParse({
        backgroundColor: "#667eea",
        shadowPreset: "custom",
        shadowColor: "#000000",
      }).success,
    ).toBe(true);
  });

  it("accepts finite large rotation angles for normalization", () => {
    expect(parses("rotate", { angle: 10_000_000.000000002 })).toBe(true);
    expect(parses("rotate", { angle: Number.POSITIVE_INFINITY })).toBe(false);
  });
});
