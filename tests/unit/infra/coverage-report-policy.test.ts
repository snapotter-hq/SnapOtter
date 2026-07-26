import { describe, expect, it } from "vitest";
import rootConfig from "../../../vitest.config.ts";

/**
 * Vitest defaults `coverage.reportOnFailure` to false, which means a single
 * failing test throws away the whole coverage report: no text table, no lcov,
 * no html, and critically no threshold check. The run then looks like "tests
 * failed" when in fact the ratchet never ran at all, so a coverage regression
 * can ride along behind an unrelated failure.
 */
describe("coverage report policy", () => {
  const coverage = rootConfig.test?.coverage;

  it("emits the coverage report even when tests fail", () => {
    expect(coverage).toBeDefined();
    expect(coverage).toHaveProperty("reportOnFailure", true);
  });

  it("keeps the ratchet thresholds wired to the report", () => {
    expect(coverage).toBeDefined();
    // Narrowed by the assertion above; `thresholds` only exists on the
    // provider-specific coverage option unions.
    const thresholds = (coverage as { thresholds?: Record<string, unknown> }).thresholds;
    expect(thresholds).toBeDefined();
    for (const metric of ["lines", "branches", "functions", "statements"]) {
      expect(typeof thresholds?.[metric]).toBe("number");
    }
  });
});
