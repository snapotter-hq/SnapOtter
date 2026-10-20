import { readFileSync } from "node:fs";
import path from "node:path";
import { MAX_RESIZE_OUTPUT_DIMENSION } from "@snapotter/image-engine";
import type { FastifyInstance } from "fastify";
import { load } from "js-yaml";
import { beforeAll, describe, expect, it } from "vitest";
import { settingsSchema as beautifySettingsSchema } from "../../../apps/api/src/lib/beautify/constants.js";
import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import { registerColorAdjustments } from "../../../apps/api/src/routes/tools/adjust-colors.js";
import { registerBorder } from "../../../apps/api/src/routes/tools/border.js";
import { registerCompress } from "../../../apps/api/src/routes/tools/compress.js";
import { registerContentAwareResize } from "../../../apps/api/src/routes/tools/content-aware-resize.js";
import { registerConvert } from "../../../apps/api/src/routes/tools/convert.js";
import { registerGifTools } from "../../../apps/api/src/routes/tools/gif-tools.js";
import { registerLqipPlaceholder } from "../../../apps/api/src/routes/tools/lqip-placeholder.js";
import { registerOptimizeForWeb } from "../../../apps/api/src/routes/tools/optimize-for-web.js";
import { registerResize } from "../../../apps/api/src/routes/tools/resize.js";
import { registerRotate } from "../../../apps/api/src/routes/tools/rotate.js";
import { registerSplit } from "../../../apps/api/src/routes/tools/split.js";
import { deriveAxes } from "../../helpers/zod-pict.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");

const app = {
  post: () => undefined,
} as unknown as FastifyInstance;

beforeAll(() => {
  registerConvert(app);
  registerCompress(app);
  registerContentAwareResize(app);
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
    ["content-aware-resize", { width: 100.5 }],
    ["content-aware-resize", { height: 80.25 }],
    ["content-aware-resize", { width: 100, blurRadius: 2.5 }],
    ["content-aware-resize", { width: 100, sobelThreshold: 10.5 }],
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

  it("bounds optimize-for-web max dimensions by the resize ceiling", () => {
    expect(parses("optimize-for-web", { maxWidth: MAX_RESIZE_OUTPUT_DIMENSION })).toBe(true);
    expect(parses("optimize-for-web", { maxHeight: MAX_RESIZE_OUTPUT_DIMENSION })).toBe(true);
    expect(parses("optimize-for-web", { maxWidth: MAX_RESIZE_OUTPUT_DIMENSION + 1 })).toBe(false);
    expect(parses("optimize-for-web", { maxHeight: MAX_RESIZE_OUTPUT_DIMENSION + 1 })).toBe(false);
    expect(parses("optimize-for-web", { maxWidth: 100_000_001 })).toBe(false);
  });

  it("bounds content-aware-resize dimensions by the resize ceiling and 25 MP pixel limit (#2204, #2997)", () => {
    expect(parses("content-aware-resize", {})).toBe(false);
    expect(parses("content-aware-resize", { protectFaces: true })).toBe(false);
    expect(parses("content-aware-resize", { square: true })).toBe(true);
    expect(parses("content-aware-resize", { width: MAX_RESIZE_OUTPUT_DIMENSION })).toBe(true);
    expect(parses("content-aware-resize", { height: MAX_RESIZE_OUTPUT_DIMENSION })).toBe(true);
    expect(parses("content-aware-resize", { width: 5000, height: 5000 })).toBe(true);
    expect(parses("content-aware-resize", { width: 5000, height: 5001 })).toBe(false);
    expect(parses("content-aware-resize", { width: 8192, height: 8192 })).toBe(false);
    expect(
      parses("content-aware-resize", {
        width: MAX_RESIZE_OUTPUT_DIMENSION,
        height: MAX_RESIZE_OUTPUT_DIMENSION,
      }),
    ).toBe(false);
    expect(
      parses("content-aware-resize", {
        width: MAX_RESIZE_OUTPUT_DIMENSION,
        height: MAX_RESIZE_OUTPUT_DIMENSION,
        square: true,
      }),
    ).toBe(true);
    expect(parses("content-aware-resize", { width: MAX_RESIZE_OUTPUT_DIMENSION + 1 })).toBe(false);
    expect(parses("content-aware-resize", { height: MAX_RESIZE_OUTPUT_DIMENSION + 1 })).toBe(false);
    expect(parses("content-aware-resize", { width: 100_000_000 })).toBe(false);
    expect(parses("content-aware-resize", { height: 100_000_000 })).toBe(false);

    const config = getToolConfig("content-aware-resize");
    if (!config) throw new Error("content-aware-resize must be registered");
    const overPixels = config.settingsSchema.safeParse({ width: 5000, height: 5001 });
    expect(overPixels.success).toBe(false);
    if (!overPixels.success) {
      expect(overPixels.error.message).toMatch(/5000 x 5001.*25000000 pixel limit/);
    }

    const overSide = config.settingsSchema.safeParse({
      width: MAX_RESIZE_OUTPUT_DIMENSION + 1,
      height: 2000,
    });
    expect(overSide.success).toBe(false);
    if (!overSide.success) {
      expect(overSide.error.issues).toHaveLength(1);
      expect(overSide.error.message).not.toMatch(/pixel limit/i);
    }
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

  it("accepts only the four GIF palette sizes Sharp's encoder can represent (#1223)", () => {
    for (const colors of [2, 4, 16, 256]) {
      expect(parses("gif-tools", { mode: "optimize", colors })).toBe(true);
    }
    for (const colors of [1, 3, 8, 32, 64, 128, 255, 257]) {
      expect(parses("gif-tools", { mode: "optimize", colors })).toBe(false);
    }
  });

  it("keeps gif-tools optimize colors in OpenAPI, docs, bench.sh, and tool-contract.json aligned with the schema (#2919)", () => {
    const config = getToolConfig("gif-tools");
    if (!config) throw new Error("gif-tools must be registered");

    const openapi = load(
      readFileSync(path.join(REPO_ROOT, "apps/api/src/openapi.yaml"), "utf8"),
    ) as {
      paths: Record<
        string,
        {
          post?: {
            requestBody?: {
              content?: {
                "multipart/form-data"?: {
                  schema?: { properties?: { settings?: { description?: string } } };
                };
              };
            };
          };
        }
      >;
    };
    const settingsDesc =
      openapi.paths["/api/v1/tools/image/gif-tools"]?.post?.requestBody?.content?.[
        "multipart/form-data"
      ]?.schema?.properties?.settings?.description ?? "";
    expect(settingsDesc).toContain(
      "- `colors` (number, default 256) - Color palette size, one of: 2, 4, 16, 256 (optimize mode)",
    );
    expect(settingsDesc).not.toContain("2-256");

    const doc = readFileSync(path.join(REPO_ROOT, "apps/docs/tools/image/gif-tools.md"), "utf8");
    expect(doc).toContain(
      "| colors | number | No | 256 | Maximum number of colors in palette (2, 4, 16, or 256) |",
    );
    expect(doc).not.toContain("2 to 256");
    const docOptimizeMatches = [...doc.matchAll(/-F 'settings=(\{"mode":"optimize"[^']*\})'/g)];
    expect(docOptimizeMatches.length).toBeGreaterThan(0);
    for (const match of docOptimizeMatches) {
      const parsed = JSON.parse(match[1]) as Record<string, unknown>;
      expect(parsed).toHaveProperty("colors");
      expect(parses("gif-tools", parsed)).toBe(true);
    }

    const bench = readFileSync(path.join(REPO_ROOT, "tests/benchmark/bench.sh"), "utf8");
    const benchOptimizeMatches = [
      ...bench.matchAll(
        /bench_tool\s+"core"\s+"image\/gif-tools"\s+"optimize-[^"]+"\s+"\$GIF"\s+'(\{[^']+\})'/g,
      ),
    ];
    expect(benchOptimizeMatches.length).toBeGreaterThan(0);
    for (const match of benchOptimizeMatches) {
      const parsed = JSON.parse(match[1]) as Record<string, unknown>;
      expect(parsed).toHaveProperty("colors");
      expect(parses("gif-tools", parsed)).toBe(true);
    }

    const contracts = JSON.parse(
      readFileSync(path.join(REPO_ROOT, "tests/qa/tool-contract.json"), "utf8"),
    ) as Array<{ id: string; axes: Array<{ key: string; values: unknown[] }> }>;
    const gifContract = contracts.find((c) => c.id === "gif-tools");
    const expectedColorsValues = deriveAxes(config.settingsSchema)
      .find((a) => a.key === "colors")
      ?.values.map((v) => (v === undefined ? null : v));
    const actualColorsValues = gifContract?.axes.find((a) => a.key === "colors")?.values;
    expect(expectedColorsValues).toEqual([2, 4, 16, 256, null]);
    expect(actualColorsValues).toEqual(expectedColorsValues);
    for (const value of actualColorsValues ?? []) {
      if (value !== null) {
        expect(parses("gif-tools", { mode: "optimize", colors: value })).toBe(true);
      }
    }
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
