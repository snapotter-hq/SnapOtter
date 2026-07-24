import { join } from "node:path";
import { PYTHON_SIDECAR_TOOLS, TOOLS } from "@snapotter/shared";
import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { z } from "zod";
import { ZodFastCheck } from "zod-fast-check";
import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import { readFixture } from "../../fixtures/index.js";
import { GeneratedCaseAccounting } from "../../helpers/generated-case-accounting.js";
import {
  buildGeneratedFixtureIndex,
  generatedFixtureDirectories,
  selectFixturesForTool,
} from "../../helpers/generated-fixtures.js";
import { findMissingGeneratedPythonPrerequisite } from "../../helpers/python-gate.js";
import { collectRegexStringSchemas } from "../../helpers/zod-pict.js";
import { buildTestApp, type TestApp } from "../test-server.js";

/**
 * Property-based settings fuzz: random VALID settings (derived from each
 * tool's own Zod schema via zod-fast-check) must never produce crash-class
 * failures. Complements the deterministic pairwise matrix with arbitrary
 * strings/numbers that humans and AIs never think to write.
 *
 * Nightly-only (FUZZ=1); FUZZ_RUNS controls depth (default 25).
 */
const FUZZ = !!process.env.FUZZ;
const NUM_RUNS = Number(process.env.FUZZ_RUNS ?? 25);
const FUZZ_SEED = Number(process.env.FUZZ_SEED ?? 20_260_724);
const REQUIRE_AI_FEATURES = process.env.REQUIRE_AI_FEATURES === "1";
const FIXTURE_INDEX = buildGeneratedFixtureIndex(generatedFixtureDirectories());
const CRASH_PATTERN =
  /TypeError|undefined is not|null is not|Cannot read propert|is not a function/i;

describe.skipIf(!FUZZ)("settings fuzz (property-based)", () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await buildTestApp();
  }, 30_000);

  afterAll(async () => {
    await testApp.cleanup();
  }, 10_000);

  // The registry is populated by buildTestApp() in beforeAll, so tool configs
  // are looked up inside the test body; registry-exempt tools no-op here.
  for (const tool of TOOLS) {
    const toolId = tool.id;
    it(`${toolId} never crashes on schema-valid settings`, async (context) => {
      if (PYTHON_SIDECAR_TOOLS.includes(toolId) && !REQUIRE_AI_FEATURES) {
        return context.skip(
          `${toolId}: optional AI prerequisite absent; set REQUIRE_AI_FEATURES=1 after install`,
        );
      }
      const config = getToolConfig(toolId);
      if (!config) return context.skip(`${toolId}: no standard tool config`);
      const missingPython = findMissingGeneratedPythonPrerequisite(toolId, undefined);
      if (missingPython) return context.skip(`${toolId}: ${missingPython}`);

      const fixture = selectFixturesForTool(FIXTURE_INDEX, tool)[0];
      if (!fixture) return context.skip(`${toolId}: no compatible generated fixture`);
      const input = readFixture(join(fixture.dir, fixture.filename));
      const accounting = new GeneratedCaseAccounting(toolId, {
        expectedAttempts: NUM_RUNS,
      });

      let arbitrary: fc.Arbitrary<unknown>;
      try {
        let zfc = ZodFastCheck();
        // zod-fast-check cannot generate regex-constrained strings (hex
        // colors and friends); override every regex-checked string field
        // with plausible color constants. Values that still fail the regex
        // are discarded by the fc.pre() below.
        for (const sub of collectRegexStringSchemas(config.settingsSchema)) {
          zfc = zfc.override(
            sub as z.ZodTypeAny,
            fc.constantFrom("#ff0000", "#000000", "#ffffff", "#00ff7f", "#ff000080"),
          );
        }
        arbitrary = zfc.inputOf(config.settingsSchema as z.ZodTypeAny);
      } catch (error) {
        // Schema uses constructs zod-fast-check cannot derive (refinements over
        // multiple fields, transforms); the pairwise matrix still covers it.
        const reason = error instanceof Error ? error.message : String(error);
        return context.skip(`${toolId}: schema generator prerequisite unavailable: ${reason}`);
      }

      try {
        await fc.assert(
          fc.asyncProperty(arbitrary, async (settings) => {
            const parsed = config.settingsSchema.safeParse(settings);
            fc.pre(parsed.success);
            accounting.attempt();
            const missingCasePython = findMissingGeneratedPythonPrerequisite(toolId, parsed.data);
            if (missingCasePython) {
              accounting.skip("optional-feature", missingCasePython);
              return;
            }
            try {
              const result = await config.process(input, parsed.data, fixture.filename);
              expect(
                result.buffer.length,
                `${toolId} produced empty output for ${JSON.stringify(settings)}`,
              ).toBeGreaterThan(0);
              accounting.accept();
            } catch (error) {
              if (!(error instanceof Error) || CRASH_PATTERN.test(error.message)) throw error;
              accounting.reject();
            }
          }),
          { numRuns: NUM_RUNS, seed: FUZZ_SEED },
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Generator dead-ends (un-derivable sub-schema or every value failing
        // a refinement) mean this tool cannot be fuzzed generically; the
        // pairwise matrix still covers it. Real property failures rethrow.
        // fast-check v4 phrases this as "too many pre-condition failures"
        // (hyphenated), so match both spellings.
        if (/Unable to generate valid values|pre-?condition/i.test(message)) {
          return context.skip(`${toolId}: generator produced no schema-valid cases: ${message}`);
        }
        throw err;
      }
      expect(accounting.assertCovered().accepted).toBeGreaterThan(0);
    }, 240_000);
  }
});
