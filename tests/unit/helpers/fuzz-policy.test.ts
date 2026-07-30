import { TOOLS } from "@snapotter/shared";
import { describe, expect, it } from "vitest";
import {
  FUZZ_COST_OVERRIDES,
  fuzzBudgetFor,
  parseFuzzConfig,
  runFuzzCaseWithWatchdog,
} from "../../helpers/fuzz-policy.js";

describe("generated fuzz configuration", () => {
  it("uses deterministic defaults", () => {
    expect(parseFuzzConfig({})).toEqual({
      runs: 25,
      seed: 20_260_724,
      seedSource: "default",
    });
  });

  it("prefers the canonical FUZZ_SEED variable", () => {
    expect(parseFuzzConfig({ FUZZ_RUNS: "50", FUZZ_SEED: "1234" })).toEqual({
      runs: 50,
      seed: 1234,
      seedSource: "FUZZ_SEED",
    });
  });

  it("accepts FC_SEED as a deprecated alias", () => {
    expect(parseFuzzConfig({ FC_SEED: "5678" })).toEqual({
      runs: 25,
      seed: 5678,
      seedSource: "FC_SEED",
    });
  });

  it("rejects conflicting canonical and deprecated seeds", () => {
    expect(() => parseFuzzConfig({ FUZZ_SEED: "1234", FC_SEED: "5678" })).toThrow(
      /FUZZ_SEED.*FC_SEED.*differ/i,
    );
  });

  it.each([
    [{ FUZZ_RUNS: "0" }, /FUZZ_RUNS.*between 1 and 10000/i],
    [{ FUZZ_RUNS: "1.5" }, /FUZZ_RUNS.*integer/i],
    [{ FUZZ_SEED: "NaN" }, /FUZZ_SEED.*integer/i],
    [{ FUZZ_SEED: "2147483648" }, /FUZZ_SEED.*between 0 and 2147483647/i],
    [{ FC_SEED: "-1" }, /FC_SEED.*between 0 and 2147483647/i],
  ])("rejects invalid fuzz environment %#", (environment, message) => {
    expect(() => parseFuzzConfig(environment)).toThrow(message);
  });
});

describe("generated fuzz budgets", () => {
  it("scales standard, long, and explicitly slow targets by run count", () => {
    expect(fuzzBudgetFor({ id: "resize", executionHint: "fast" }, 25)).toEqual({
      costClass: "standard",
      caseTimeoutMs: 8_000,
      targetTimeoutMs: 268_000,
    });
    expect(fuzzBudgetFor({ id: "ocr", executionHint: "long" }, 25)).toEqual({
      costClass: "long",
      caseTimeoutMs: 12_000,
      targetTimeoutMs: 372_000,
    });
    expect(fuzzBudgetFor({ id: "webp-to-gif", executionHint: "fast" }, 25)).toEqual({
      costClass: "slow-codec",
      caseTimeoutMs: 15_000,
      targetTimeoutMs: 450_000,
    });

    expect(
      fuzzBudgetFor({ id: "webp-to-gif", executionHint: "fast" }, 50).targetTimeoutMs,
    ).toBeGreaterThan(
      fuzzBudgetFor({ id: "webp-to-gif", executionHint: "fast" }, 25).targetTimeoutMs,
    );
  });

  it("gives the heavy-canvas border tool a longer per-case budget", () => {
    // A 2000px border on a mid-size image makes a ~5000px canvas plus a large
    // gaussian shadow blur, which legitimately exceeds the 8s standard budget
    // without crashing (fuzz seed 20260724, #695 follow-up).
    const budget = fuzzBudgetFor({ id: "border", executionHint: "fast" }, 25);
    expect(budget.costClass).toBe("heavy");
    expect(budget.caseTimeoutMs).toBeGreaterThanOrEqual(20_000);
  });

  it("only overrides real registered tool IDs", () => {
    const registered = new Set(TOOLS.map(({ id }) => id));
    expect(Object.keys(FUZZ_COST_OVERRIDES).filter((id) => !registered.has(id))).toEqual([]);
  });
});

describe("generated fuzz per-case watchdog", () => {
  it("aborts and reports the tool, seed, run, settings, and timeout", async () => {
    let receivedSignal: AbortSignal | undefined;

    await expect(
      runFuzzCaseWithWatchdog(
        {
          toolId: "webp-to-avif",
          seed: 20_260_724,
          run: 7,
          settings: { quality: 91 },
          timeoutMs: 10,
        },
        async (signal) => {
          receivedSignal = signal;
          return await new Promise<never>(() => {});
        },
      ),
    ).rejects.toThrow(
      '[fuzz-timeout] tool=webp-to-avif seed=20260724 run=7 timeoutMs=10 settings={"quality":91}',
    );
    expect(receivedSignal?.aborted).toBe(true);
  });
});
