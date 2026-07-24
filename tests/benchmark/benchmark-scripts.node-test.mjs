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
