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
