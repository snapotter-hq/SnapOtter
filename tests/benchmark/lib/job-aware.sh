#!/usr/bin/env bash

JOB_AWARE_LIB_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
JOB_AWARE_NODE="${JOB_AWARE_LIB_DIR}/job-aware.mjs"
BENCH_JOB_TIMEOUT_MS="${BENCH_JOB_TIMEOUT_MS:-300000}"
BENCHMARK_FAILURES=0

resolve_benchmark_response() {
  local base_url="$1" token="$2" status="$3" mime="$4" body_file="$5" output_file="$6"
  local admission_latency="$7" timeout_ms="${8:-$BENCH_JOB_TIMEOUT_MS}"
  local resolution rc

  if resolution=$(node "$JOB_AWARE_NODE" \
    --base-url "$base_url" \
    --token "$token" \
    --status "$status" \
    --mime "${mime:-application/octet-stream}" \
    --body "$body_file" \
    --output "$output_file" \
    --admission-latency "$admission_latency" \
    --timeout-ms "$timeout_ms"); then
    rc=0
  else
    rc=$?
  fi

  IFS=$'\t' read -r \
    BENCH_PASS \
    BENCH_ADMISSION_STATUS \
    BENCH_COMPLETION_STATUS \
    BENCH_COMPLETION_LATENCY_S \
    BENCH_OUTPUT_SIZE \
    BENCH_OUTPUT_MIME \
    BENCH_ERROR <<< "$resolution"

  if [ "$rc" -ne 0 ]; then
    BENCHMARK_FAILURES=$((BENCHMARK_FAILURES + 1))
    return "$rc"
  fi
  return 0
}

benchmark_assert_success() {
  if [ "$BENCHMARK_FAILURES" -gt 0 ]; then
    echo "Benchmark failed: ${BENCHMARK_FAILURES} request(s) timed out or returned invalid output" >&2
    return 1
  fi
}
