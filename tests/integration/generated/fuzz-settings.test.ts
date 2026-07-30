import { PYTHON_SIDECAR_TOOLS, TOOLS } from "@snapotter/shared";
import fc from "fast-check";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { z } from "zod";
import { ZodFastCheck } from "zod-fast-check";
import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import {
  fuzzBudgetFor,
  parseFuzzConfig,
  runFuzzCaseWithWatchdog,
} from "../../helpers/fuzz-policy.js";
import { GeneratedCaseAccounting } from "../../helpers/generated-case-accounting.js";
import {
  buildGeneratedFixtureIndex,
  generatedFixtureDirectories,
  selectFixturesForTool,
} from "../../helpers/generated-fixtures.js";
import { findMissingGeneratedPythonPrerequisite } from "../../helpers/python-gate.js";
import {
  buildGeneratedProcessInputs,
  findMissingGeneratedPrerequisite,
  isExpectedGeneratedRejection,
  runGeneratedTool,
} from "../../helpers/run-generated-tool.js";
import { defaultSettingsFor } from "../../helpers/tool-default-settings.js";
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
const FUZZ_CONFIG = parseFuzzConfig(FUZZ ? process.env : {});
const REQUIRE_AI_FEATURES = process.env.REQUIRE_AI_FEATURES === "1";
const FIXTURE_INDEX = buildGeneratedFixtureIndex(generatedFixtureDirectories());

// This lane checks that valid settings never crash a tool, not how fast a codec
// is on a big image. Several image tools scale their work with the input
// (AVIF/JXL encodes, gif upscales, per-tile splits), so a multi-megapixel
// fixture makes cases legitimately run many seconds and time out without ever
// crashing. Bound image inputs to a small canvas; the same settings paths run
// in a fraction of the time. The format matrix still covers full-size inputs on
// its own path. Formats sharp cannot re-encode (heic, jxl, raw) are left as-is
// and covered by their per-tool fuzz budgets instead.
const FUZZ_MAX_IMAGE_DIMENSION = 640;

async function boundFuzzImageInputs(
  inputs: Awaited<ReturnType<typeof buildGeneratedProcessInputs>>,
  modality?: string,
): Promise<typeof inputs> {
  if (modality !== "image") return inputs;
  return Promise.all(
    inputs.map(async (input) => {
      try {
        const image = sharp(input.buffer, { animated: true });
        const meta = await image.metadata();
        const longest = Math.max(meta.width ?? 0, meta.height ?? 0);
        if (longest <= FUZZ_MAX_IMAGE_DIMENSION) return input;
        const buffer = await image
          .resize({
            width: FUZZ_MAX_IMAGE_DIMENSION,
            height: FUZZ_MAX_IMAGE_DIMENSION,
            fit: "inside",
            withoutEnlargement: true,
          })
          .toBuffer();
        return { ...input, buffer };
      } catch {
        return input;
      }
    }),
  );
}

describe.skipIf(!FUZZ)("settings fuzz (property-based)", () => {
  let testApp: TestApp;

  beforeAll(async () => {
    console.info(
      `[fuzz-config] runs=${FUZZ_CONFIG.runs} seed=${FUZZ_CONFIG.seed} ` +
        `seedSource=${FUZZ_CONFIG.seedSource}`,
    );
    if (FUZZ_CONFIG.seedSource === "FC_SEED") {
      console.warn("[fuzz-config] FC_SEED is deprecated; use FUZZ_SEED instead");
    }
    testApp = await buildTestApp();
  }, 30_000);

  afterAll(async () => {
    await testApp.cleanup();
  }, 10_000);

  // The registry is populated by buildTestApp() in beforeAll, so tool configs
  // are looked up inside the test body; registry-exempt tools no-op here.
  for (const tool of TOOLS) {
    const toolId = tool.id;
    const budget = fuzzBudgetFor(tool, FUZZ_CONFIG.runs);
    it(`${toolId} never crashes on schema-valid settings`, {
      timeout: budget.targetTimeoutMs,
    }, async (context) => {
      if (PYTHON_SIDECAR_TOOLS.includes(toolId) && !REQUIRE_AI_FEATURES) {
        return context.skip(
          `${toolId}: optional AI prerequisite absent; set REQUIRE_AI_FEATURES=1 after install`,
        );
      }
      const config = getToolConfig(toolId);
      if (!config) return context.skip(`${toolId}: no standard tool config`);
      const missingPython = findMissingGeneratedPythonPrerequisite(toolId, undefined);
      if (missingPython) return context.skip(`${toolId}: ${missingPython}`);
      const missingPrerequisite = await findMissingGeneratedPrerequisite(toolId);
      if (missingPrerequisite) return context.skip(`${toolId}: ${missingPrerequisite}`);

      const fixtures = selectFixturesForTool(FIXTURE_INDEX, tool);
      if (fixtures.length === 0) {
        return context.skip(`${toolId}: no compatible generated fixture`);
      }
      const rawInputs = await buildGeneratedProcessInputs(fixtures, config, tool.modality);
      const inputs = await boundFuzzImageInputs(rawInputs, tool.modality);
      const accounting = new GeneratedCaseAccounting(toolId, {
        expectedAttempts: FUZZ_CONFIG.runs + 1,
      });

      // Every fuzz target gets one deterministic, user-realistic smoke case.
      // This distinguishes a valid schema whose random values are all rejected
      // by fixture-dependent semantic checks from a tool that cannot succeed.
      const baseline = config.settingsSchema.safeParse(defaultSettingsFor(toolId));
      if (!baseline.success) {
        throw new Error(`${toolId}: default settings do not satisfy the registered schema`);
      }
      accounting.attempt();
      const missingBaselinePython = findMissingGeneratedPythonPrerequisite(toolId, baseline.data);
      if (missingBaselinePython) {
        accounting.skip("optional-feature", missingBaselinePython);
      } else {
        const baselineOutput = await runFuzzCaseWithWatchdog(
          {
            toolId,
            seed: FUZZ_CONFIG.seed,
            run: 0,
            settings: baseline.data,
            timeoutMs: budget.caseTimeoutMs,
          },
          (signal) => runGeneratedTool(config, inputs, baseline.data, signal),
        );
        expect(
          baselineOutput.length,
          `${toolId} produced empty output for defaults`,
        ).toBeGreaterThan(0);
        accounting.accept();
      }

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
        let run = 0;
        await fc.assert(
          fc.asyncProperty(arbitrary, async (settings) => {
            const parsed = config.settingsSchema.safeParse(settings);
            fc.pre(parsed.success);
            run += 1;
            accounting.attempt();
            const missingCasePython = findMissingGeneratedPythonPrerequisite(toolId, parsed.data);
            if (missingCasePython) {
              accounting.skip("optional-feature", missingCasePython);
              return;
            }
            try {
              const result = await runFuzzCaseWithWatchdog(
                {
                  toolId,
                  seed: FUZZ_CONFIG.seed,
                  run,
                  settings: parsed.data,
                  timeoutMs: budget.caseTimeoutMs,
                },
                (signal) => runGeneratedTool(config, inputs, parsed.data, signal),
              );
              expect(
                result.length,
                `${toolId} produced empty output for ${JSON.stringify(settings)}`,
              ).toBeGreaterThan(0);
              accounting.accept();
            } catch (error) {
              if (!isExpectedGeneratedRejection(error)) throw error;
              accounting.reject();
            }
          }),
          { numRuns: FUZZ_CONFIG.runs, seed: FUZZ_CONFIG.seed },
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
    });
  }
});
