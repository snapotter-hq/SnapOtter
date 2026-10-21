import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { db } from "../../../apps/api/src/db/index.js";
import { getRegisteredToolIds, getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import { registerCompress } from "../../../apps/api/src/routes/tools/compress.js";
import { registerCompressPdf } from "../../../apps/api/src/routes/tools/compress-pdf.js";
import { registerContentAwareResize } from "../../../apps/api/src/routes/tools/content-aware-resize.js";
import { registerCrop } from "../../../apps/api/src/routes/tools/crop.js";
import { registerToolRoutes } from "../../../apps/api/src/routes/tools/index.js";
import { registerOptimizeForWeb } from "../../../apps/api/src/routes/tools/optimize-for-web.js";
import { registerResize } from "../../../apps/api/src/routes/tools/resize.js";
import { registerSmartCrop } from "../../../apps/api/src/routes/tools/smart-crop.js";
import { registerVideoToGif } from "../../../apps/api/src/routes/tools/video-to-gif.js";
import { PYTHON_SIDECAR_TOOLS, TOOLS } from "../../../packages/shared/src/constants.js";
import { toolSection } from "../../../packages/shared/src/section.js";
import { pairwise } from "../../helpers/pairwise.js";
import { defaultSettingsFor } from "../../helpers/tool-default-settings.js";
import { compactCase, deriveAxes } from "../../helpers/zod-pict.js";
import {
  invalidProbesFor,
  readFieldBounds,
  type ToolContract,
} from "../../qa/extract-tool-contract.mjs";

const stubApp = {
  post: () => undefined,
  get: () => undefined,
  decorate: () => undefined,
  log: { info: () => undefined, warn: () => undefined, error: () => undefined },
} as unknown as Parameters<typeof registerCrop>[0];

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

describe("extract-tool-contract literal unions and full tool-contract.json sync (#2945)", () => {
  it("recognizes literal-union fields in readFieldBounds and emits outsider and wrong-type probes in invalidProbesFor", () => {
    const schema = z.object({
      colors: z.union([z.literal(2), z.literal(4), z.literal(16), z.literal(256)]).default(256),
      angle: z.union([z.literal(90), z.literal(180), z.literal(270)]).optional(),
      nestedUnsorted: z.union([z.literal(9), z.union([z.literal(1), z.literal(2)]), z.literal(5)]),
      contiguous: z.union([z.literal(1), z.literal(2), z.literal(3)]),
      singleLiteral: z.literal(42).optional(),
      floatUnion: z.union([z.literal(0.25), z.literal(0.5), z.literal(0.75)]),
      stringUnion: z.union([z.literal("fast"), z.literal("accurate")]),
      hybridUnion: z.union([z.literal(0), z.number().min(0.3).max(20)]).default(2),
    });

    const axes = deriveAxes(schema);
    const bounds = readFieldBounds(schema);
    const probes = invalidProbesFor(axes, bounds);

    expect(bounds.get("colors")).toEqual({
      kind: "literal-union",
      values: [2, 4, 16, 256],
    });
    expect(bounds.get("angle")).toEqual({
      kind: "literal-union",
      values: [90, 180, 270],
    });
    expect(bounds.get("nestedUnsorted")).toEqual({
      kind: "literal-union",
      values: [9, 1, 2, 5],
    });
    expect(bounds.get("contiguous")).toEqual({
      kind: "literal-union",
      values: [1, 2, 3],
    });
    expect(bounds.get("singleLiteral")).toEqual({
      kind: "literal-union",
      values: [42],
    });
    expect(bounds.get("floatUnion")).toEqual({
      kind: "literal-union",
      values: [0.25, 0.5, 0.75],
    });
    expect(bounds.get("stringUnion")).toEqual({
      kind: "literal-union",
      values: ["fast", "accurate"],
    });
    expect(bounds.get("hybridUnion")).toEqual({
      kind: "other",
    });

    expect(probes).toEqual([
      { key: "colors", value: 1, why: "below declared min" },
      { key: "colors", value: 257, why: "above declared max" },
      { key: "colors", value: 129, why: "excluded midpoint" },
      { key: "colors", value: "not-a-number", why: "wrong type" },
      { key: "angle", value: 89, why: "below declared min" },
      { key: "angle", value: 271, why: "above declared max" },
      { key: "angle", value: 135, why: "excluded midpoint" },
      { key: "angle", value: "not-a-number", why: "wrong type" },
      { key: "nestedUnsorted", value: 0, why: "below declared min" },
      { key: "nestedUnsorted", value: 10, why: "above declared max" },
      { key: "nestedUnsorted", value: 4, why: "excluded midpoint" },
      { key: "nestedUnsorted", value: "not-a-number", why: "wrong type" },
      { key: "contiguous", value: 0, why: "below declared min" },
      { key: "contiguous", value: 4, why: "above declared max" },
      { key: "contiguous", value: "not-a-number", why: "wrong type" },
      { key: "singleLiteral", value: 41, why: "below declared min" },
      { key: "singleLiteral", value: 43, why: "above declared max" },
      { key: "singleLiteral", value: "not-a-number", why: "wrong type" },
      { key: "floatUnion", value: -0.75, why: "below declared min" },
      { key: "floatUnion", value: 1.75, why: "above declared max" },
      { key: "floatUnion", value: 0.375, why: "excluded midpoint" },
      { key: "floatUnion", value: "not-a-number", why: "wrong type" },
      { key: "stringUnion", value: "__snapotter_qa_not_a_member__", why: "enum outsider" },
      { key: "stringUnion", value: 12345, why: "wrong type" },
    ]);

    for (const probe of probes) {
      const candidate = {
        colors: 256,
        angle: 90,
        nestedUnsorted: 5,
        contiguous: 2,
        singleLiteral: 42,
        floatUnion: 0.25,
        stringUnion: "fast",
        hybridUnion: 2,
        [probe.key]: probe.value,
      };
      expect(schema.safeParse(candidate).success, `probe ${JSON.stringify(probe)}`).toBe(false);
    }
  });

  it("keeps tests/qa/tool-contract.json in sync with live TOOLS, deriveAxes, and invalidProbesFor", async () => {
    const selectSpy = vi
      .spyOn(db, "select")
      .mockReturnValue({ from: () => ({ where: async () => [] }) } as never);
    try {
      await registerToolRoutes(stubApp);
    } finally {
      selectSpy.mockRestore();
    }

    const contracts = JSON.parse(
      readFileSync(join(process.cwd(), "tests/qa/tool-contract.json"), "utf8"),
    ) as ToolContract[];

    expect(contracts.map((c) => c.id)).toEqual(TOOLS.map((t) => t.id));

    const registeredIds = new Set<string>(getRegisteredToolIds());
    const aiTools = new Set<string>(PYTHON_SIDECAR_TOOLS as readonly string[]);
    const byId = new Map(contracts.map((contract) => [contract.id, contract]));

    for (const tool of TOOLS) {
      const config = getToolConfig(tool.id);
      const rawAxes = config?.settingsSchema ? deriveAxes(config.settingsSchema) : [];
      const bounds = config?.settingsSchema ? readFieldBounds(config.settingsSchema) : new Map();
      const expectedProbes = invalidProbesFor(rawAxes, bounds);
      const expected: ToolContract = JSON.parse(
        JSON.stringify({
          id: tool.id,
          name: tool.name,
          modality: tool.modality,
          section: toolSection(tool),
          acceptedInputs: [...tool.acceptedInputs],
          executionHint: tool.executionHint,
          outputModality: tool.outputModality,
          isAI: aiTools.has(tool.id),
          registered: registeredIds.has(tool.id),
          maxInputs: config?.maxInputs,
          inputKinds: config?.inputKinds,
          skipStructuralValidation: config?.skipStructuralValidation,
          axes: rawAxes,
          invalidProbes: expectedProbes,
        }),
      );
      expect(byId.get(tool.id), `${tool.id} contract in tool-contract.json`).toEqual(expected);

      if (config?.settingsSchema) {
        const base = defaultSettingsFor(tool.id) as Record<string, unknown>;
        expect(
          config.settingsSchema.safeParse(base).success,
          `${tool.id} defaultSettingsFor must satisfy settingsSchema before probing`,
        ).toBe(true);
        for (const probe of expectedProbes) {
          expect(
            config.settingsSchema.safeParse({ ...base, [probe.key]: probe.value }).success,
            `${tool.id} schema must reject invalidProbe ${JSON.stringify(probe)}`,
          ).toBe(false);
        }
      }
    }
  });
});
