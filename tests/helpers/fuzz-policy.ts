import type { Tool } from "@snapotter/shared";

const DEFAULT_FUZZ_RUNS = 25;
const DEFAULT_FUZZ_SEED = 20_260_724;
const MAX_FUZZ_RUNS = 10_000;
const MAX_FUZZ_SEED = 2_147_483_647;
const TARGET_STARTUP_BUFFER_MS = 60_000;
const MAX_DIAGNOSTIC_SETTINGS_LENGTH = 2_048;

export type FuzzCostClass = "standard" | "long" | "slow-codec" | "heavy";

export interface FuzzConfig {
  runs: number;
  seed: number;
  seedSource: "default" | "FUZZ_SEED" | "FC_SEED";
}

export interface FuzzBudget {
  costClass: FuzzCostClass;
  caseTimeoutMs: number;
  targetTimeoutMs: number;
}

interface FuzzTool {
  id: string;
  executionHint: Tool["executionHint"];
}

interface FuzzCaseMetadata {
  toolId: string;
  seed: number;
  run: number;
  settings: unknown;
  timeoutMs: number;
}

const CASE_TIMEOUTS_MS: Record<FuzzCostClass, number> = {
  standard: 8_000,
  long: 12_000,
  "slow-codec": 15_000,
  // These tools scale with settings the schema permits to a bounded but large
  // extreme: a 2000px border on a ~5000px canvas, a 400-tile split, or a resize
  // to the shared 64-megapixel output cap. All are correct and bounded, and all
  // legitimately run tens of seconds on a loaded runner without crashing, which
  // is the only thing this lane checks. (Whether the product should allow a
  // 64MP gif resize at all is a separate, deliberate review.)
  heavy: 45_000,
};

export const FUZZ_COST_OVERRIDES = {
  "webp-to-avif": "slow-codec",
  "webp-to-gif": "slow-codec",
  // AVIF/HEIC encodes are slow; a heic input cannot be downscaled by the fuzz
  // (sharp cannot re-encode it), so it runs at full fixture size.
  "heic-to-avif": "slow-codec",
  // Resize to the 64-megapixel output cap across frames runs tens of seconds.
  "gif-tools": "heavy",
  // A 2000px border makes a ~5000px canvas plus a large gaussian shadow blur.
  border: "heavy",
  // Up to 400 per-tile JXL/AVIF encodes plus a ZIP; bounded and correct.
  split: "heavy",
} as const satisfies Record<string, FuzzCostClass>;

function parseInteger(
  name: string,
  value: string,
  { min, max }: { min: number; max: number },
): number {
  if (!/^-?\d+$/.test(value)) {
    throw new Error(`${name} must be an integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${name} must be an integer`);
  }
  if (parsed < min || parsed > max) {
    throw new Error(`${name} must be between ${min} and ${max}`);
  }
  return parsed;
}

export function parseFuzzConfig(
  environment: Readonly<Record<string, string | undefined>>,
): FuzzConfig {
  const runs =
    environment.FUZZ_RUNS === undefined
      ? DEFAULT_FUZZ_RUNS
      : parseInteger("FUZZ_RUNS", environment.FUZZ_RUNS, { min: 1, max: MAX_FUZZ_RUNS });

  const canonicalSeed = environment.FUZZ_SEED;
  const deprecatedSeed = environment.FC_SEED;
  if (canonicalSeed !== undefined && deprecatedSeed !== undefined) {
    const parsedCanonical = parseInteger("FUZZ_SEED", canonicalSeed, {
      min: 0,
      max: MAX_FUZZ_SEED,
    });
    const parsedDeprecated = parseInteger("FC_SEED", deprecatedSeed, {
      min: 0,
      max: MAX_FUZZ_SEED,
    });
    if (parsedCanonical !== parsedDeprecated) {
      throw new Error("FUZZ_SEED and deprecated FC_SEED differ");
    }
    return { runs, seed: parsedCanonical, seedSource: "FUZZ_SEED" };
  }

  if (canonicalSeed !== undefined) {
    return {
      runs,
      seed: parseInteger("FUZZ_SEED", canonicalSeed, { min: 0, max: MAX_FUZZ_SEED }),
      seedSource: "FUZZ_SEED",
    };
  }
  if (deprecatedSeed !== undefined) {
    return {
      runs,
      seed: parseInteger("FC_SEED", deprecatedSeed, { min: 0, max: MAX_FUZZ_SEED }),
      seedSource: "FC_SEED",
    };
  }
  return { runs, seed: DEFAULT_FUZZ_SEED, seedSource: "default" };
}

export function fuzzBudgetFor(tool: FuzzTool, runs: number): FuzzBudget {
  if (!Number.isInteger(runs) || runs < 1 || runs > MAX_FUZZ_RUNS) {
    throw new Error(`fuzz runs must be an integer between 1 and ${MAX_FUZZ_RUNS}`);
  }
  const costClass =
    FUZZ_COST_OVERRIDES[tool.id as keyof typeof FUZZ_COST_OVERRIDES] ??
    (tool.executionHint === "long" ? "long" : "standard");
  const caseTimeoutMs = CASE_TIMEOUTS_MS[costClass];
  return {
    costClass,
    caseTimeoutMs,
    targetTimeoutMs: TARGET_STARTUP_BUFFER_MS + (runs + 1) * caseTimeoutMs,
  };
}

function formatSettings(settings: unknown): string {
  let serialized: string;
  try {
    serialized = JSON.stringify(settings) ?? String(settings);
  } catch {
    serialized = "[unserializable settings]";
  }
  if (serialized.length <= MAX_DIAGNOSTIC_SETTINGS_LENGTH) return serialized;
  return `${serialized.slice(0, MAX_DIAGNOSTIC_SETTINGS_LENGTH)}…`;
}

export async function runFuzzCaseWithWatchdog<T>(
  metadata: FuzzCaseMetadata,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(
        new Error(
          `[fuzz-timeout] tool=${metadata.toolId} seed=${metadata.seed} run=${metadata.run} ` +
            `timeoutMs=${metadata.timeoutMs} settings=${formatSettings(metadata.settings)}`,
        ),
      );
    }, metadata.timeoutMs);
  });

  try {
    return await Promise.race([operation(controller.signal), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
