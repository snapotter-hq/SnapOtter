/**
 * Weight-aware partitioning for `vitest --shard`.
 *
 * Vitest's BaseSequencer shards by SHA1 of the file path, sorted, then sliced
 * into equal FILE COUNTS (see `BaseSequencer.shard`). That is blind to how long
 * a file takes, so the split is effectively a coin toss. Measured on CI run
 * 30206780088 it put the four costliest generated matrix specs in one shard:
 *
 *   shard 1  3m47s   shard 2  5m13s   shard 3  16m04s   shard 4  24m47s
 *
 * The pipeline is gated by the slowest shard, so that cost the whole run ~20
 * minutes of idle. Partitioning by measured cost instead lands every shard near
 * the mean.
 *
 * A spec is never split across shards, so no shard can finish faster than the
 * single costliest file (format-matrix-comprehensive, ~1365s of test time).
 * That is the floor for any shard count.
 */

/**
 * Total test time per spec in seconds, measured from CI run 30206780088
 * (2026-07-26). Only the expensive tail is listed; everything else is close
 * enough to the default that ranking it adds no value.
 *
 * These are load hints, not assertions. A stale number costs balance, never
 * correctness: the partition stays total and disjoint whatever the weights say.
 * Refresh by parsing per-test durations out of the Integration job logs.
 */
export const FILE_COST_SECONDS: Record<string, number> = {
  "tests/integration/generated/format-matrix-exotic.test.ts": 370,
  "tests/integration/generated/format-matrix-comprehensive-2.test.ts": 348,
  "tests/integration/generated/format-matrix-comprehensive-1.test.ts": 343,
  "tests/integration/generated/format-matrix-comprehensive-3.test.ts": 343,
  "tests/integration/generated/format-matrix-comprehensive-4.test.ts": 343,
  "tests/integration/generated/format-matrix-expanded.test.ts": 319,
  "tests/integration/generated/format-matrix-1.test.ts": 309,
  "tests/integration/generated/format-matrix-2.test.ts": 309,
  "tests/integration/generated/format-matrix-generated-1.test.ts": 269,
  "tests/integration/generated/format-matrix-generated-2.test.ts": 269,
  "tests/integration/generated/format-matrix-generated-3.test.ts": 269,
  "tests/integration/generated/format-matrix-3.test.ts": 267,
  "tests/integration/generated/format-matrix-4.test.ts": 261,
  "tests/integration/tools/image/image-enhancement.test.ts": 226,
  "tests/integration/generated/new-formats.test.ts": 202,
  "tests/integration/generated/format-matrix-multimodal.test.ts": 126,
  "tests/integration/generated/settings-pairwise.test.ts": 109,
  "tests/integration/generated/settings-matrix.test.ts": 99,
  "tests/integration/security/hostile-inputs.test.ts": 72,
  "tests/integration/tools/image/collage.test.ts": 52,
  "tests/integration/security/adversarial-coverage-gaps.test.ts": 52,
  "tests/integration/security/adversarial-extended.test.ts": 24,
  "tests/integration/security/adversarial-matrix.test.ts": 19,
  "tests/integration/tools/image/beautify.test.ts": 18,
  "tests/integration/security/adversarial-final-gaps.test.ts": 18,
  "tests/integration/platform/batch.test.ts": 17,
  "tests/integration/tools/image/edit-metadata.test.ts": 17,
  "tests/integration/tools/image/qr-generate.test.ts": 16,
};

/** Median-ish cost of an unlisted spec. Most sit well under a second. */
const DEFAULT_COST_SECONDS = 2;

/**
 * Reduce an absolute moduleId, a leading-slash path, or an already-relative
 * path down to the repo-relative form used as the cost-table key.
 */
function normalize(file: string): string {
  const posix = file.replace(/\\/g, "/");
  const idx = posix.indexOf("tests/");
  return idx === -1 ? posix.replace(/^\/+/, "") : posix.slice(idx);
}

export function costOf(file: string): number {
  return FILE_COST_SECONDS[normalize(file)] ?? DEFAULT_COST_SECONDS;
}

/**
 * Longest-processing-time-first greedy bin packing: heaviest spec first, each
 * one onto whichever bin is currently lightest.
 *
 * Every shard runs this in its own vitest process and then keeps only its own
 * bin, so the result has to be identical everywhere. It is: the input is sorted
 * before packing, and ties break on path, so filesystem enumeration order
 * cannot change the answer.
 */
export function partitionByCost(files: string[], count: number): string[][] {
  if (count <= 0) return [];

  const bins: string[][] = Array.from({ length: count }, () => []);
  const loads: number[] = new Array(count).fill(0);

  const heaviestFirst = [...files].sort((a, b) => {
    const byCost = costOf(b) - costOf(a);
    if (byCost !== 0) return byCost;
    return a < b ? -1 : a > b ? 1 : 0;
  });

  for (const file of heaviestFirst) {
    let lightest = 0;
    for (let i = 1; i < count; i++) {
      if (loads[i] < loads[lightest]) lightest = i;
    }
    bins[lightest].push(file);
    loads[lightest] += costOf(file);
  }

  return bins;
}
