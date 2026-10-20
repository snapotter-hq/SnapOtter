import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import { registerCompress } from "../../../apps/api/src/routes/tools/compress.js";
import { registerCompressPdf } from "../../../apps/api/src/routes/tools/compress-pdf.js";
import { registerContentAwareResize } from "../../../apps/api/src/routes/tools/content-aware-resize.js";
import { registerCrop } from "../../../apps/api/src/routes/tools/crop.js";
import { registerOptimizeForWeb } from "../../../apps/api/src/routes/tools/optimize-for-web.js";
import { registerResize } from "../../../apps/api/src/routes/tools/resize.js";
import { registerSmartCrop } from "../../../apps/api/src/routes/tools/smart-crop.js";
import { registerVideoToGif } from "../../../apps/api/src/routes/tools/video-to-gif.js";
import { pairwise } from "../../helpers/pairwise.js";
import { compactCase, deriveAxes } from "../../helpers/zod-pict.js";
import {
  invalidProbesFor,
  readFieldBounds,
  type ToolContract,
} from "../../qa/extract-tool-contract.mjs";

const stubApp = { post: () => undefined } as unknown as Parameters<typeof registerCrop>[0];

describe("zod-pict and extract-tool-contract exclusive bounds (#3129)", () => {
  it("offsets exclusive min and max checks so every derived axis value satisfies the field schema", () => {
    const widthField = z.number().int().positive().max(100);
    const targetSizeField = z.number().positive().optional();
    const exclusiveRangeField = z.number().int().gt(0).lt(10);
    const negativeField = z.number().int().min(-10).negative();
    const unboundedNegativeField = z.number().negative();
    const chainedField = z.number().int().positive().nonnegative().max(100).lt(100);
    const schema = z.object({
      width: widthField,
      targetSizeKb: targetSizeField,
      exclusiveRange: exclusiveRangeField,
      negative: negativeField,
      unboundedNegative: unboundedNegativeField,
      chained: chainedField,
    });

    const axes = deriveAxes(schema);
    const byKey = new Map(axes.map((axis) => [axis.key, axis.values]));

    expect(byKey.get("width")).toEqual([1, 51, 100]);
    expect(byKey.get("targetSizeKb")).toEqual([1, 51, 101, undefined]);
    expect(byKey.get("exclusiveRange")).toEqual([1, 5, 9]);
    expect(byKey.get("negative")).toEqual([-10, -5, -1]);
    expect(byKey.get("unboundedNegative")).toEqual([-101, -51, -1]);
    expect(byKey.get("chained")).toEqual([1, 50, 99]);

    for (const value of byKey.get("width") ?? []) {
      expect(widthField.safeParse(value).success).toBe(true);
    }
    for (const value of byKey.get("targetSizeKb") ?? []) {
      expect(targetSizeField.safeParse(value).success).toBe(true);
    }
    for (const value of byKey.get("exclusiveRange") ?? []) {
      expect(exclusiveRangeField.safeParse(value).success).toBe(true);
    }
    for (const value of byKey.get("negative") ?? []) {
      expect(negativeField.safeParse(value).success).toBe(true);
    }
    for (const value of byKey.get("unboundedNegative") ?? []) {
      expect(unboundedNegativeField.safeParse(value).success).toBe(true);
    }
    for (const value of byKey.get("chained") ?? []) {
      expect(chainedField.safeParse(value).success).toBe(true);
    }
  });

  it("keeps narrow exclusive float ranges strictly inside (min, max)", () => {
    const unitExclusive = z.number().gt(0).lt(1);
    const positiveUnitMax = z.number().positive().max(1);
    const minZeroExclusiveUnit = z.number().min(0).lt(1);
    const spanTwoExclusive = z.number().gt(0).lt(2);
    const schema = z.object({
      unitExclusive,
      positiveUnitMax,
      minZeroExclusiveUnit,
      spanTwoExclusive,
    });

    const axes = deriveAxes(schema);
    const byKey = new Map(axes.map((axis) => [axis.key, axis.values]));

    const unitValues = byKey.get("unitExclusive") ?? [];
    const positiveValues = byKey.get("positiveUnitMax") ?? [];
    const minZeroValues = byKey.get("minZeroExclusiveUnit") ?? [];
    const spanTwoValues = byKey.get("spanTwoExclusive") ?? [];
    expect(unitValues).toEqual([0.25, 0.5, 0.75]);
    expect(positiveValues).toEqual([0.25, 0.625, 1]);
    expect(minZeroValues).toEqual([0, 0.375, 0.75]);
    expect(spanTwoValues).toEqual([0.5, 1, 1.5]);

    for (const value of unitValues) {
      expect(unitExclusive.safeParse(value).success).toBe(true);
    }
    for (const value of positiveValues) {
      expect(positiveUnitMax.safeParse(value).success).toBe(true);
    }
    for (const value of minZeroValues) {
      expect(minZeroExclusiveUnit.safeParse(value).success).toBe(true);
    }
    for (const value of spanTwoValues) {
      expect(spanTwoExclusive.safeParse(value).success).toBe(true);
    }
  });

  it("preserves inclusive min and max boundary values", () => {
    const schema = z.object({
      quality: z.number().int().min(1).max(100),
      offset: z.number().nonnegative().max(50),
    });

    const axes = deriveAxes(schema);
    expect(axes).toEqual([
      { key: "quality", values: [1, 51, 100] },
      { key: "offset", values: [0, 25, 50] },
    ]);
  });

  it("retains all 14 pairwise combinations for crop instead of dropping width=0 or height=0", () => {
    registerCrop(stubApp);
    const config = getToolConfig("crop");
    expect(config).toBeDefined();
    if (!config) return;

    const axes = deriveAxes(config.settingsSchema);
    const combos = pairwise(axes);
    expect(combos).toHaveLength(14);

    const valid = combos
      .map((combo) => compactCase(combo))
      .filter((combo) => config.settingsSchema.safeParse(combo).success);
    expect(valid).toHaveLength(14);
  });

  it("probes the excluded boundary value for exclusive min/max in invalidProbesFor", () => {
    const schema = z.object({
      width: z.number().int().positive().max(100),
      targetSizeKb: z.number().positive().optional(),
      exclusiveUpper: z.number().min(0).lt(10),
    });

    const axes = deriveAxes(schema);
    const bounds = readFieldBounds(schema);
    const probes = invalidProbesFor(axes, bounds);

    expect(bounds.get("width")).toEqual({
      kind: "number",
      min: 0,
      minInclusive: false,
      max: 100,
      maxInclusive: true,
    });
    expect(bounds.get("targetSizeKb")).toEqual({
      kind: "number",
      min: 0,
      minInclusive: false,
    });
    expect(bounds.get("exclusiveUpper")).toEqual({
      kind: "number",
      min: 0,
      minInclusive: true,
      max: 10,
      maxInclusive: false,
    });

    expect(probes).toEqual([
      { key: "width", value: 0, why: "below declared min" },
      { key: "width", value: 101, why: "above declared max" },
      { key: "width", value: "not-a-number", why: "wrong type" },
      { key: "targetSizeKb", value: 0, why: "below declared min" },
      { key: "targetSizeKb", value: "not-a-number", why: "wrong type" },
      { key: "exclusiveUpper", value: -1, why: "below declared min" },
      { key: "exclusiveUpper", value: 10, why: "above declared max" },
      { key: "exclusiveUpper", value: "not-a-number", why: "wrong type" },
    ]);

    for (const probe of probes) {
      const candidate = {
        width: 10,
        targetSizeKb: 10,
        exclusiveUpper: 5,
        [probe.key]: probe.value,
      };
      expect(schema.safeParse(candidate).success).toBe(false);
    }
  });

  it("keeps tool-contract.json aligned with live exclusive-bound schemas", () => {
    registerCompress(stubApp);
    registerCompressPdf(stubApp);
    registerContentAwareResize(stubApp);
    registerCrop(stubApp);
    registerOptimizeForWeb(stubApp);
    registerResize(stubApp);
    registerSmartCrop(stubApp);
    registerVideoToGif(stubApp);

    const contracts = JSON.parse(
      readFileSync(join(process.cwd(), "tests/qa/tool-contract.json"), "utf8"),
    ) as ToolContract[];
    const byId = new Map(contracts.map((contract) => [contract.id, contract]));

    for (const toolId of [
      "compress",
      "compress-pdf",
      "resize",
      "crop",
      "smart-crop",
      "content-aware-resize",
      "optimize-for-web",
      "video-to-gif",
    ]) {
      const config = getToolConfig(toolId);
      expect(config, `${toolId} must be registered`).toBeDefined();
      if (!config) continue;

      const expectedAxes = JSON.parse(JSON.stringify(deriveAxes(config.settingsSchema)));
      const expectedProbes = invalidProbesFor(
        deriveAxes(config.settingsSchema),
        readFieldBounds(config.settingsSchema),
      );
      const contract = byId.get(toolId);
      expect(contract?.axes, `${toolId} axes in tool-contract.json`).toEqual(expectedAxes);
      expect(contract?.invalidProbes, `${toolId} invalidProbes in tool-contract.json`).toEqual(
        expectedProbes,
      );
    }
  });
});
