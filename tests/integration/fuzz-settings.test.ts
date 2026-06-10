import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TOOLS } from "@snapotter/shared";
import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { z } from "zod";
import { ZodFastCheck } from "zod-fast-check";
import { getToolConfig } from "../../apps/api/src/routes/tool-factory.js";
import { collectRegexStringSchemas } from "../helpers/zod-pict.js";
import { buildTestApp, type TestApp } from "./test-server.js";

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
const CRASH_PATTERN =
  /TypeError|undefined is not|null is not|Cannot read propert|is not a function/i;

describe.skipIf(!FUZZ)("settings fuzz (property-based)", () => {
  let testApp: TestApp;
  let inputPng: Buffer;

  beforeAll(async () => {
    testApp = await buildTestApp();
    inputPng = readFileSync(join(__dirname, "..", "fixtures", "test-200x150.png"));
  }, 30_000);

  afterAll(async () => {
    await testApp.cleanup();
  }, 10_000);

  // The registry is populated by buildTestApp() in beforeAll, so tool configs
  // are looked up inside the test body; registry-exempt tools no-op here.
  for (const tool of TOOLS) {
    const toolId = tool.id;
    it(`${toolId} never crashes on schema-valid settings`, async () => {
      const config = getToolConfig(toolId);
      if (!config) return;

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
      } catch {
        // Schema uses constructs zod-fast-check cannot derive (refinements over
        // multiple fields, transforms); the pairwise matrix still covers it.
        return;
      }

      try {
        await fc.assert(
          fc.asyncProperty(arbitrary, async (settings) => {
            const parsed = config.settingsSchema.safeParse(settings);
            fc.pre(parsed.success);
            try {
              await config.process(inputPng, parsed.data, "test-200x150.png");
            } catch (err) {
              if (!(err instanceof Error)) {
                throw new Error(`${toolId} threw a non-Error: ${String(err)}`);
              }
              if (CRASH_PATTERN.test(err.message)) {
                throw new Error(`${toolId} crashed on ${JSON.stringify(settings)}: ${err.message}`);
              }
              // Clean operational failure: acceptable.
            }
          }),
          { numRuns: NUM_RUNS, interruptAfterTimeLimit: 180_000 },
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Generator dead-ends (un-derivable sub-schema or every value failing
        // a refinement) mean this tool cannot be fuzzed generically; the
        // pairwise matrix still covers it. Real property failures rethrow.
        if (/Unable to generate valid values|precondition/i.test(message)) return;
        throw err;
      }
      expect(true).toBe(true);
    }, 240_000);
  }
});
