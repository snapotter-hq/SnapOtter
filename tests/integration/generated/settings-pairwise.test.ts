import { join } from "node:path";
import { PYTHON_SIDECAR_TOOLS, TOOLS } from "@snapotter/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import { readFixture } from "../../fixtures/index.js";
import { GeneratedCaseAccounting } from "../../helpers/generated-case-accounting.js";
import {
  buildGeneratedFixtureIndex,
  generatedFixtureDirectories,
  selectFixturesForTool,
} from "../../helpers/generated-fixtures.js";
import { pairwise } from "../../helpers/pairwise.js";
import { findMissingGeneratedPythonPrerequisite } from "../../helpers/python-gate.js";
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
const REQUIRE_AI_FEATURES = process.env.REQUIRE_AI_FEATURES === "1";
const FIXTURE_INDEX = buildGeneratedFixtureIndex(generatedFixtureDirectories());
const CRASH_PATTERN =
  /TypeError|undefined is not|null is not|Cannot read propert|is not a function/i;

describe("pairwise settings matrix", () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await buildTestApp();
  }, 30_000);

  afterAll(async () => {
    await testApp.cleanup();
  }, 10_000);

  // The registry is populated by buildTestApp() in beforeAll, so the
  // FULL_MATRIX tool list comes from the static TOOLS catalog and configs are
  // looked up inside the test body; registry-exempt tools no-op here.
  const toolIds = process.env.FULL_MATRIX ? TOOLS.map((t) => t.id) : CORE_TOOLS;

  for (const toolId of toolIds) {
    it(`${toolId} survives its pairwise settings matrix`, async (context) => {
      if (PYTHON_SIDECAR_TOOLS.includes(toolId) && !REQUIRE_AI_FEATURES) {
        return context.skip(
          `${toolId}: optional AI prerequisite absent; set REQUIRE_AI_FEATURES=1 after install`,
        );
      }
      const config = getToolConfig(toolId);
      if (!config) {
        expect(process.env.FULL_MATRIX, `core tool "${toolId}" is not registered`).toBeTruthy();
        return context.skip(`${toolId}: no standard tool config`);
      }
      const missingPython = findMissingGeneratedPythonPrerequisite(toolId, undefined);
      if (missingPython) return context.skip(`${toolId}: ${missingPython}`);

      const tool = TOOLS.find((candidate) => candidate.id === toolId);
      if (!tool) return context.skip(`${toolId}: missing shared tool metadata`);
      const fixture = selectFixturesForTool(FIXTURE_INDEX, tool)[0];
      if (!fixture) return context.skip(`${toolId}: no compatible generated fixture`);
      const input = readFixture(join(fixture.dir, fixture.filename));

      const axes = deriveAxes(config.settingsSchema);

      // Merge combos over the tool's minimal valid settings so required
      // fields that are not enumerable axes (e.g. watermark text) are present.
      const base = defaultSettingsFor(toolId) as Record<string, unknown>;
      const combos = axes.length < 2 ? [base] : pairwise(axes);
      const cases = combos
        .map((combo) => ({ ...base, ...compactCase(combo) }))
        .map((combo) => config.settingsSchema.safeParse(combo))
        .filter((parsed): parsed is { success: true; data: unknown } => parsed.success)
        .slice(0, MAX_CASES_PER_TOOL);

      expect(
        cases.length,
        `${toolId}: every pairwise combo was rejected by the schema`,
      ).toBeGreaterThan(0);

      const accounting = new GeneratedCaseAccounting(toolId, {
        expectedAttempts: cases.length,
      });
      for (const parsed of cases) {
        accounting.attempt();
        const missingCasePython = findMissingGeneratedPythonPrerequisite(toolId, parsed.data);
        if (missingCasePython) {
          accounting.skip("optional-feature", missingCasePython);
          continue;
        }
        try {
          const result = await config.process(input, parsed.data, fixture.filename);
          expect(
            result.buffer.length,
            `${toolId} produced empty output for ${JSON.stringify(parsed.data)}`,
          ).toBeGreaterThan(0);
          accounting.accept();
        } catch (error) {
          if (!(error instanceof Error) || CRASH_PATTERN.test(error.message)) throw error;
          accounting.reject();
        }
      }
      expect(accounting.assertCovered().accepted).toBeGreaterThan(0);
    }, 240_000);
  }
});
