import { TOOLS } from "@snapotter/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import { fixtures, readFixture } from "../../fixtures/index.js";
import { pairwise } from "../../helpers/pairwise.js";
import { defaultSettingsFor } from "../../helpers/tool-default-settings.js";
import { compactCase, deriveAxes } from "../../helpers/zod-pict.js";
import { buildTestApp, type TestApp } from "../test-server.js";

/**
 * Pairwise settings matrix: a covering array over each tool's settings schema
 * (every pair of axis values appears at least once), filtered through the
 * schema's own refinements, with each survivor run through the tool's process
 * function directly.
 *
 * Invariant: a tool either succeeds or fails with a real, descriptive Error.
 * TypeErrors and undefined-access crashes are the AI-written-code failure
 * class this suite exists to catch.
 *
 * PR runs cover the core tools; FULL_MATRIX=1 (nightly) covers every tool.
 */
const CORE_TOOLS = [
  "resize",
  "crop",
  "rotate",
  "convert",
  "compress",
  "adjust-colors",
  "watermark-text",
  "border",
];

const MAX_CASES_PER_TOOL = 40;
const CRASH_PATTERN =
  /TypeError|undefined is not|null is not|Cannot read propert|is not a function/i;

describe("pairwise settings matrix", () => {
  let testApp: TestApp;
  let inputPng: Buffer;

  beforeAll(async () => {
    testApp = await buildTestApp();
    inputPng = readFixture(fixtures.image.base.png200);
  }, 30_000);

  afterAll(async () => {
    await testApp.cleanup();
  }, 10_000);

  // The registry is populated by buildTestApp() in beforeAll, so the
  // FULL_MATRIX tool list comes from the static TOOLS catalog and configs are
  // looked up inside the test body; registry-exempt tools no-op here.
  const toolIds = process.env.FULL_MATRIX ? TOOLS.map((t) => t.id) : CORE_TOOLS;

  for (const toolId of toolIds) {
    it(`${toolId} survives its pairwise settings matrix`, async () => {
      const config = getToolConfig(toolId);
      if (!config) {
        expect(process.env.FULL_MATRIX, `core tool "${toolId}" is not registered`).toBeTruthy();
        return;
      }

      const axes = deriveAxes(config.settingsSchema);
      if (axes.length < 2) {
        // Not enough enumerable axes for pair coverage; fuzz covers this tool.
        return;
      }

      // Merge combos over the tool's minimal valid settings so required
      // fields that are not enumerable axes (e.g. watermark text) are present.
      const base = defaultSettingsFor(toolId) as Record<string, unknown>;
      const combos = pairwise(axes);
      const cases = combos
        .map((combo) => ({ ...base, ...compactCase(combo) }))
        .map((combo) => config.settingsSchema.safeParse(combo))
        .filter((parsed): parsed is { success: true; data: unknown } => parsed.success)
        .slice(0, MAX_CASES_PER_TOOL);

      expect(
        cases.length,
        `${toolId}: every pairwise combo was rejected by the schema`,
      ).toBeGreaterThan(0);

      for (const parsed of cases) {
        try {
          const result = await config.process(inputPng, parsed.data, "test-200x150.png");
          expect(
            result.buffer.length,
            `${toolId} produced empty output for ${JSON.stringify(parsed.data)}`,
          ).toBeGreaterThan(0);
        } catch (err) {
          // Clean operational failures (e.g. crop area outside image) are
          // acceptable; crash-class errors are not.
          expect(
            err,
            `${toolId} threw a non-Error for ${JSON.stringify(parsed.data)}`,
          ).toBeInstanceOf(Error);
          const message = (err as Error).message;
          expect(
            CRASH_PATTERN.test(message),
            `${toolId} crashed on ${JSON.stringify(parsed.data)}: ${message}`,
          ).toBe(false);
        }
      }
    }, 240_000);
  }
});
