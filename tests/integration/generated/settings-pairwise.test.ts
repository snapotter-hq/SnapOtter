import { PYTHON_SIDECAR_TOOLS, TOOLS } from "@snapotter/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import { GeneratedCaseAccounting } from "../../helpers/generated-case-accounting.js";
import {
  buildGeneratedFixtureIndex,
  generatedFixtureDirectories,
  selectFixturesForTool,
} from "../../helpers/generated-fixtures.js";
import { pairwise } from "../../helpers/pairwise.js";
import { findMissingGeneratedPythonPrerequisite } from "../../helpers/python-gate.js";
import {
  buildGeneratedProcessInputs,
  findMissingGeneratedPrerequisite,
  isExpectedGeneratedRejection,
  runGeneratedTool,
} from "../../helpers/run-generated-tool.js";
import { defaultSettingsFor } from "../../helpers/tool-default-settings.js";
import { compactCase, deriveAxes } from "../../helpers/zod-pict.js";
import { buildTestApp, type TestApp } from "../test-server.js";

/**
 * Pairwise settings matrix: a covering array over each tool's settings schema
 * (every pair of axis values appears at least once), filtered through the
 * schema's own refinements, with each survivor run through the tool's process
 * function directly.
 *
 * Invariant: a tool either succeeds or rejects through a typed input-error
 * contract. Untyped operational errors and programming errors fail the lane.
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

const REQUIRE_AI_FEATURES = process.env.REQUIRE_AI_FEATURES === "1";
const FIXTURE_INDEX = buildGeneratedFixtureIndex(generatedFixtureDirectories());

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
      const missingPrerequisite = await findMissingGeneratedPrerequisite(toolId);
      if (missingPrerequisite) return context.skip(`${toolId}: ${missingPrerequisite}`);

      const tool = TOOLS.find((candidate) => candidate.id === toolId);
      if (!tool) return context.skip(`${toolId}: missing shared tool metadata`);
      const fixtures = selectFixturesForTool(FIXTURE_INDEX, tool);
      if (fixtures.length === 0) {
        return context.skip(`${toolId}: no compatible generated fixture`);
      }
      const inputs = await buildGeneratedProcessInputs(fixtures, config, tool.modality);

      const axes = deriveAxes(config.settingsSchema);

      // Merge combos over the tool's minimal valid settings so required
      // fields that are not enumerable axes (e.g. watermark text) are present.
      const base = defaultSettingsFor(toolId) as Record<string, unknown>;
      const combos = axes.length < 2 ? [base] : pairwise(axes);
      const cases = combos
        .map((combo) => ({ ...base, ...compactCase(combo) }))
        .map((combo) => config.settingsSchema.safeParse(combo))
        .filter((parsed): parsed is { success: true; data: unknown } => parsed.success);

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
          const result = await runGeneratedTool(config, inputs, parsed.data);
          expect(
            result.length,
            `${toolId} produced empty output for ${JSON.stringify(parsed.data)}`,
          ).toBeGreaterThan(0);
          accounting.accept();
        } catch (error) {
          if (!isExpectedGeneratedRejection(error)) throw error;
          accounting.reject();
        }
      }
      expect(accounting.assertCovered().accepted).toBeGreaterThan(0);
    }, 240_000);
  }
});
