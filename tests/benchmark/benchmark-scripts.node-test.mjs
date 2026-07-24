import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

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
