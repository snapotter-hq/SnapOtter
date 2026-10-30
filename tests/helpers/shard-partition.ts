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
 * single costliest file (format-matrix-exotic, ~250s of test time). That is the
 * floor for any shard count, and it only holds if that file starts first:
 * vitest sorts each shard's files after sharding, and its default sort put a
 * ~240s spec 173s into its shard's run (CI run 41043484659, shard 6/8, 415s).
 */

/**
 * Total test time per spec in seconds, averaged over the green PR runs
 * 40986384901, 41043484659, and 41044674435 (2026-10-30). Only the expensive
 * tail is listed; everything else is close enough to the default that ranking
 * it adds no value. Unit specs are listed too since the unit job is sharded.
 *
 * These are load hints, not assertions. A stale number costs balance, never
 * correctness: the partition stays total and disjoint whatever the weights say.
 * Refresh by parsing per-test durations out of the Unit and Integration job logs.
 */
export const FILE_COST_SECONDS: Record<string, number> = {
  "tests/integration/generated/format-matrix-exotic.test.ts": 248,
  "tests/integration/generated/format-matrix-multimodal.test.ts": 246,
  "tests/integration/generated/format-matrix-generated-3.test.ts": 242,
  "tests/integration/generated/format-matrix-expanded.test.ts": 216,
  "tests/integration/generated/format-matrix-generated-1.test.ts": 212,
  "tests/integration/generated/format-matrix-4.test.ts": 197,
  "tests/integration/generated/format-matrix-3.test.ts": 194,
  "tests/integration/generated/format-matrix-comprehensive-3.test.ts": 189,
  "tests/integration/generated/format-matrix-comprehensive-2.test.ts": 179,
  "tests/integration/generated/format-matrix-comprehensive-4.test.ts": 142,
  "tests/integration/generated/format-matrix-2.test.ts": 137,
  "tests/integration/generated/format-matrix-comprehensive-1.test.ts": 129,
  "tests/integration/tools/image/image-enhancement.test.ts": 121,
  "tests/integration/generated/format-matrix-generated-2.test.ts": 120,
  "tests/integration/generated/format-matrix-1.test.ts": 104,
  "tests/integration/generated/settings-pairwise.test.ts": 78,
  "tests/integration/generated/settings-matrix.test.ts": 64,
  "tests/integration/platform/worker-timeout.test.ts": 52,
  "tests/integration/generated/new-formats.test.ts": 52,
  "tests/integration/security/adversarial-coverage-gaps.test.ts": 48,
  "tests/integration/platform/scim.test.ts": 46,
  "tests/integration/platform/redis-consumer-recovery.test.ts": 40,
  "tests/integration/security/hostile-inputs.test.ts": 39,
  "tests/integration/platform/batch.test.ts": 34,
  "tests/integration/tools/image/compress.test.ts": 32,
  "tests/integration/tools/image/collage.test.ts": 30,
  "tests/integration/tools/image/info.test.ts": 29,
  "tests/integration/tools/image/passport-photo.test.ts": 26,
  "tests/integration/platform/auth-edge-cases.test.ts": 26,
  "tests/integration/tools/image/edit-metadata.test.ts": 24,
  "tests/integration/security/adversarial-final-gaps.test.ts": 22,
  "tests/integration/platform/batch-cancel.test.ts": 22,
  "tests/integration/security/adversarial-matrix.test.ts": 20,
  "tests/integration/security/adversarial-extended.test.ts": 20,
  "tests/integration/generated/convert-formats.test.ts": 20,
  "tests/integration/tools/image/beautify.test.ts": 18,
  "tests/integration/tools/compress-presets.test.ts": 18,
  "tests/integration/tools/image/vectorize.test.ts": 16,
  "tests/integration/platform/worker-branches.test.ts": 16,
  "tests/integration/tools/conversion-presets.test.ts": 15,
  "tests/unit/web/automate-import-errors.test.tsx": 61,
  "tests/unit/infra/apt-install-script.test.ts": 28,
  "tests/unit/e2e-harness-contract.test.ts": 26,
  "tests/unit/api/format-decoders.test.ts": 22,
  "tests/unit/api/svg-decompress-sanitize-custom-routes.test.ts": 22,
  "tests/unit/web/automate-page-file-reset.test.tsx": 18,
  "tests/unit/web/features-store.test.ts": 16,
  "tests/unit/features/feature-status.test.ts": 15,
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

/** Costliest first, ties broken on path so every process agrees on the order. */
export function compareHeaviestFirst(a: string, b: string): number {
  const byCost = costOf(b) - costOf(a);
  if (byCost !== 0) return byCost;
  return a < b ? -1 : a > b ? 1 : 0;
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

  const heaviestFirst = [...files].sort(compareHeaviestFirst);

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
