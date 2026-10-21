import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPTS = ["bench.sh", "bench-ai.sh", "bench-limits.sh"];

for (const script of SCRIPTS) {
  test(`${script} uses the shared completion-aware response adapter`, () => {
    const path = new URL(script, import.meta.url);
    const source = readFileSync(path, "utf8");

    assert.match(source, /lib\/job-aware\.sh/);
    assert.match(source, /resolve_benchmark_response/);
    assert.match(source, /admission_status/);
    assert.match(source, /completion_status/);
    assert.match(source, /completion_latency_s/);
    assert.match(source, /output_mime/);
    assert.doesNotMatch(source, /eval\s+"curl_args/);
  });

  test(`${script} remains valid Bash`, () => {
    execFileSync("bash", ["-n", new URL(script, import.meta.url).pathname]);
  });
}

test("concurrent accounting observes every requested row and every child exit", () => {
  const adapter = new URL("lib/job-aware.sh", import.meta.url).pathname;
  const probe = `
    set -u
    source "$1"
    rows=$(mktemp)
    (printf 'true\\t1\\n' >> "$rows") & first=$!
    (exit 9) & second=$!
    if wait_for_benchmark_children 2 "$rows" "$first" "$second"; then
      exit 90
    fi
    test "$BENCH_CHILD_EXIT_FAILURES" -eq 1
    test "$BENCH_OBSERVED_ROWS" -eq 1
    test "$BENCH_EXPECTED_ROWS" -eq 2
  `;

  execFileSync("bash", ["-c", probe, "probe", adapter]);
});

test("the shell adapter forwards output MIME and ZIP-entry expectations", () => {
  const adapter = readFileSync(new URL("lib/job-aware.sh", import.meta.url), "utf8");
  const limits = readFileSync(new URL("bench-limits.sh", import.meta.url), "utf8");

  assert.match(adapter, /--expected-mime/);
  assert.match(adapter, /--expected-zip-entries/);
  assert.match(limits, /"application\/zip"\s+"\$count"/);
});

test("benchmark fixture references resolve against the tracked modality layout", () => {
  const fixtureRoot = fileURLToPath(new URL("../fixtures/", import.meta.url));

  for (const script of SCRIPTS) {
    const source = readFileSync(new URL(script, import.meta.url), "utf8");
    const references = new Set(
      [...source.matchAll(/\$\{F\}\/([A-Za-z0-9_./-]+)/g)].map((match) => match[1]),
    );

    assert.ok(references.size > 0, `${script} should reference benchmark fixtures`);
    for (const reference of references) {
      assert.ok(
        existsSync(new URL(`../fixtures/${reference}`, import.meta.url)),
        `${script} references missing fixture path ${reference} under ${fixtureRoot}`,
      );
    }
  }
});

test("endpoint benchmarks collect Docker metrics only from an explicit exact container", () => {
  for (const script of ["bench.sh", "bench-ai.sh"]) {
    const source = readFileSync(new URL(script, import.meta.url), "utf8");

    assert.match(source, /SNAPOTTER_BENCH_CONTAINER/);
    assert.match(source, /docker inspect/);
    assert.doesNotMatch(source, /CONTAINER_NAME=["']SnapOtter["']/);
    assert.doesNotMatch(source, /docker ps[^\n]+(?:--filter|-f)\s+name=/);
  }
});

test("resource-limit benchmarks own labeled containers on dynamic loopback ports", () => {
  const source = readFileSync(new URL("bench-limits.sh", import.meta.url), "utf8");

  assert.match(source, /SNAPOTTER_BENCH_RUN_ID/);
  assert.match(source, /com\.snapotter\.benchmark\.run/);
  assert.match(source, /--label/);
  assert.match(source, /127\.0\.0\.1::1349/);
  assert.match(source, /docker port/);
  assert.match(source, /container_is_owned/);
  assert.doesNotMatch(source, /^PORT=13491$/m);
  assert.doesNotMatch(source, /CONTAINER_NAME=["']SnapOtter-bench-limits["']/);

  const cleanup = source.slice(source.indexOf("cleanup()"), source.indexOf("start_container()"));
  assert.match(cleanup, /container_is_owned/);
  assert.match(cleanup, /docker rm -f/);
});

test("container memory readings are normalised to MiB whatever unit Docker prints", () => {
  const metrics = new URL("lib/metrics.sh", import.meta.url).pathname;
  const probe = `
    set -eu
    source "$1"
    docker() { printf '%s\\n' "$FAKE_STATS"; }
    FAKE_STATS='1.68GiB / 6GiB'
    test "$(docker_mem_mb any)" = "1720.32"
    FAKE_STATS='512MiB / 6GiB'
    test "$(docker_mem_mb any)" = "512.00"
    FAKE_STATS='980KiB / 6GiB'
    test "$(docker_mem_mb any)" = "0.96"
    FAKE_STATS=''
    test "$(docker_mem_mb any)" = "0"
    test "$(docker_mem_mb "")" = "0"
  `;

  execFileSync("bash", ["-c", probe, "probe", metrics]);
});

test("the resource-limit sweep never submits a request it knows will be rejected", () => {
  const source = readFileSync(new URL("bench-limits.sh", import.meta.url), "utf8");

  // A multi-file tool called with no files always 400s, which pinned
  // BENCHMARK_FAILURES above zero and made the sweep unable to ever exit 0.
  assert.doesNotMatch(source, /run_bench[^\n]+"NONE"/);
});

test("benchmarked operations assert the property their settings asked for", () => {
  const bench = readFileSync(new URL("bench.sh", import.meta.url), "utf8");
  const limits = readFileSync(new URL("bench-limits.sh", import.meta.url), "utf8");

  assert.match(bench, /'\{"width":800,"fit":"cover"\}' '\{"width":800\}'/);
  assert.match(bench, /'\{"zipEach":\{"width":800\}\}'/);
  assert.match(bench, /'\{"pages":3\}'/);
  assert.match(limits, /'\{"width":800\}'/);
});

test("benchmark results are run-scoped and never overwrite an existing JSONL file", () => {
  for (const script of SCRIPTS) {
    const source = readFileSync(new URL(script, import.meta.url), "utf8");

    assert.match(source, /SNAPOTTER_BENCH_RUN_ID/);
    assert.match(source, /RESULTS_FILE=[^\n]+\$\{RUN_ID\}/);
    assert.match(source, /\[ -e "\$RESULTS_FILE" \]/);
    assert.match(source, /Refusing to overwrite benchmark results/);
  }
});

test("bench-ai.sh targets the batch endpoint for multi-file remove-background and Phase 1 settings for single-file calls", () => {
  const source = readFileSync(new URL("bench-ai.sh", import.meta.url), "utf8");
  const allowedPhase1Keys = new Set(["model", "edgeRefine", "decontaminate"]);

  const allSingleInvocations = [...source.matchAll(/bench_ai_tool\s+"image\/remove-background"/g)];
  const singleCalls = [
    ...source.matchAll(
      /bench_ai_tool\s+"image\/remove-background"\s+"[^"]+"\s+"[^"]+"\s+'([^']*)'/g,
    ),
  ];
  assert.ok(singleCalls.length >= 3);
  assert.equal(singleCalls.length, allSingleInvocations.length);
  for (const [, raw] of singleCalls) {
    const parsed = raw ? JSON.parse(raw) : {};
    for (const key of Object.keys(parsed)) {
      assert.equal(allowedPhase1Keys.has(key), true, `unexpected Phase 1 key: ${key}`);
    }
  }

  const tier3Start = source.indexOf("=== TIER 3: AI Batch Processing ===");
  const sustainedStart = source.indexOf("=== Sustained AI Load");
  assert.ok(tier3Start >= 0);
  assert.ok(sustainedStart > tier3Start);
  const batchSection = source.slice(tier3Start, sustainedStart);
  assert.match(batchSection, /\/api\/v1\/tools\/image\/remove-background\/batch"/);
  assert.doesNotMatch(batchSection, /\/api\/v1\/tools\/image\/remove-background"/);
  assert.match(batchSection, /"application\/zip"\s+"\$batch_size"/);
});

test("bench-ai.sh targets the passport-photo analyze sub-route instead of the 400 base route", () => {
  const source = readFileSync(new URL("bench-ai.sh", import.meta.url), "utf8");
  const passportInvocations = [
    ...source.matchAll(/bench_ai_tool\s+"(image\/passport-photo[^"]*)"/g),
  ].map((match) => match[1]);

  assert.ok(passportInvocations.length > 0, "bench-ai.sh should benchmark passport-photo");
  assert.deepEqual(
    passportInvocations,
    passportInvocations.map(() => "image/passport-photo/analyze"),
  );
  assert.doesNotMatch(source, /\/api\/v1\/tools\/image\/passport-photo"/);
});

test("bench.sh and bench-limits.sh target the /batch endpoints for resize and convert batch runs", () => {
  const bench = readFileSync(new URL("bench.sh", import.meta.url), "utf8");
  const limits = readFileSync(new URL("bench-limits.sh", import.meta.url), "utf8");

  const tier3Start = bench.indexOf("=== TIER 3: Batch Processing ===");
  const tier4Start = bench.indexOf("=== TIER 4: Pipeline Benchmarks ===");
  assert.ok(tier3Start >= 0);
  assert.ok(tier4Start > tier3Start);
  const batchSection = bench.slice(tier3Start, tier4Start);

  const batchInvocations = [
    ...batchSection.matchAll(/bench_tool_multifile\s+"batch"\s+"([^"]+)"/g),
  ].map((match) => match[1]);
  assert.deepEqual(batchInvocations, [
    "image/resize/batch",
    "image/resize/batch",
    "image/convert/batch",
  ]);

  const multifileStart = bench.indexOf("bench_tool_multifile()");
  const runNTimesStart = bench.indexOf("run_n_times()");
  assert.ok(multifileStart >= 0);
  assert.ok(runNTimesStart > multifileStart);
  const multifileFn = bench.slice(multifileStart, runNTimesStart);
  assert.match(multifileFn, /expected_mime="application\/zip"/);
  assert.match(multifileFn, /expected_zip_entries="\$\{#files\[@\]\}"/);
  assert.match(multifileFn, /"\$expected_mime"\s+"\$expected_zip_entries"\s+"\$oracle"/);

  const probe = `
    set -euo pipefail
    BASE_URL="http://127.0.0.1:1349"
    TOKEN="tok"
    BENCH_CONTAINER_ID=""
    BENCH_JOB_TIMEOUT_MS=300000
    CURL_LOG=$(mktemp)
    trap 'rm -f "$CURL_LOG"' EXIT
    ${multifileFn}
    curl() {
      printf '%s\\n' "$@" > "$CURL_LOG"
      printf '200\\t0.010\\tapplication/zip\\n'
    }
    resolve_benchmark_response() {
      LAST_EXPECTED_MIME="$9"
      LAST_EXPECTED_ENTRIES="\${10}"
      LAST_ORACLE="\${11}"
      BENCH_PASS="true"
      BENCH_ADMISSION_STATUS="200"
      BENCH_COMPLETION_STATUS="completed"
      BENCH_COMPLETION_LATENCY_S="0.010"
      BENCH_OUTPUT_SIZE="128"
      BENCH_OUTPUT_MIME="application/zip"
    }
    docker_mem_mb() { echo "0"; }
    docker_cpu_pct() { echo "0"; }
    record() { :; }
    log() { :; }

    bench_tool_multifile "batch" "image/resize/batch" "small-b3" '{"width":100}' '{"zipEach":{"width":100}}' a.png b.png c.png
    test "$LAST_EXPECTED_MIME" = "application/zip"
    test "$LAST_EXPECTED_ENTRIES" = "3"
    test "$LAST_ORACLE" = '{"zipEach":{"width":100}}'
    grep -Fxq "http://127.0.0.1:1349/api/v1/tools/image/resize/batch" "$CURL_LOG"

    bench_tool_multifile "core" "image/compose" "small-r1" '{"blendMode":"overlay"}' '' a.png b.png
    test -z "$LAST_EXPECTED_MIME"
    test -z "$LAST_EXPECTED_ENTRIES"
  `;
  execFileSync("bash", ["-c", probe]);

  const batchBenchStart = limits.indexOf("run_batch_bench()");
  const sweepStart = limits.indexOf("=== Resource Limit Sweep");
  assert.ok(batchBenchStart >= 0);
  assert.ok(sweepStart > batchBenchStart);
  const batchBenchFn = limits.slice(batchBenchStart, sweepStart);
  assert.match(batchBenchFn, /\/api\/v1\/tools\/image\/resize\/batch"/);
  assert.doesNotMatch(batchBenchFn, /\/api\/v1\/tools\/image\/resize"/);
});
