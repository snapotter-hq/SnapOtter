#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
source "${SCRIPT_DIR}/lib/job-aware.sh"
source "${SCRIPT_DIR}/lib/metrics.sh"

SYSTEM="${1:?Usage: bench-limits.sh <system-name> <fixture-dir> <docker-image>}"
FIXTURE_DIR="${2:?}"
DOCKER_IMAGE="${3:-snapotter:latest}"
RUN_ID="${SNAPOTTER_BENCH_RUN_ID:-$$_${RANDOM}_${RANDOM}}"
if [[ ! "$SYSTEM" =~ ^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$ ]]; then
  echo "system-name must be 1-64 letters, digits, underscores, or hyphens" >&2
  exit 2
fi
if [[ ! "$RUN_ID" =~ ^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$ ]]; then
  echo "SNAPOTTER_BENCH_RUN_ID must be 1-64 letters, digits, underscores, or hyphens" >&2
  exit 2
fi
OWNER_LABEL_KEY="com.snapotter.benchmark.run"
OWNER_LABEL="${OWNER_LABEL_KEY}=${RUN_ID}"
BASE_URL=""
RESULTS_FILE="bench-limits-results-${SYSTEM}-${RUN_ID}.jsonl"
CONTAINER_NAME="snapotter-bench-limits-${RUN_ID}"

log() { echo "[$(date +%H:%M:%S)] $*" >&2; }

if [ -e "$RESULTS_FILE" ]; then
  log "Refusing to overwrite benchmark results: ${RESULTS_FILE}"
  exit 2
fi
: > "$RESULTS_FILE"

container_is_owned() {
  local owner
  owner=$(docker inspect --type container \
    --format "{{ index .Config.Labels \"${OWNER_LABEL_KEY}\" }}" \
    "$CONTAINER_NAME" 2>/dev/null) || return 1
  [ "$owner" = "$RUN_ID" ]
}

cleanup() {
  if ! docker inspect --type container "$CONTAINER_NAME" >/dev/null 2>&1; then
    return 0
  fi
  if ! container_is_owned; then
    log "Refusing to remove container without exact ${OWNER_LABEL} ownership"
    return 1
  fi
  docker rm -f "$CONTAINER_NAME" >/dev/null
}

trap 'exit 130' INT
trap 'exit 143' TERM
trap cleanup EXIT

resolve_base_url() {
  local binding port
  binding=$(docker port "$CONTAINER_NAME" 1349/tcp 2>/dev/null) || return 1
  port="${binding##*:}"
  if [[ ! "$port" =~ ^[0-9]+$ ]]; then
    log "Docker returned an invalid host port binding: ${binding}"
    return 1
  fi
  BASE_URL="http://127.0.0.1:${port}"
}

create_container() {
  local cpus="$1" memory="$2"

  if docker inspect --type container "$CONTAINER_NAME" >/dev/null 2>&1; then
    log "Unique container name collision: ${CONTAINER_NAME}"
    return 1
  fi

  docker run --rm -d \
    --cpus="$cpus" --memory="$memory" \
    -p "127.0.0.1::1349" \
    --label "$OWNER_LABEL" \
    -e AUTH_ENABLED=false \
    -e SKIP_MUST_CHANGE_PASSWORD=true \
    --name "$CONTAINER_NAME" \
    "$DOCKER_IMAGE" >/dev/null || return 1

  if ! container_is_owned || ! resolve_base_url; then
    log "Created container failed ownership or port validation"
    return 1
  fi
}

start_container() {
  local cpus="$1" memory="$2"
  cleanup
  log "Starting container: --cpus=${cpus} --memory=${memory}"

  create_container "$cpus" "$memory" || return 1

  log "Waiting for health..."
  local attempts=0
  while ! curl -sf "${BASE_URL}/api/v1/health" >/dev/null 2>&1; do
    sleep 2
    attempts=$((attempts + 1))
    if [ "$attempts" -gt 60 ]; then
      log "Container failed to become healthy after 120s"
      return 1
    fi
  done
  log "Container healthy"
}

run_bench() {
  local cpus="$1" memory="$2" tool="$3" variant="$4" file="$5" settings="${6:-}" oracle="${7:-}"
  local admission_file artifact_file time_s http_code response_mime pass output_size mem_after

  admission_file=$(mktemp)
  artifact_file=$(mktemp)

  local curl_args=(-s --max-time 120 -X POST "${BASE_URL}/api/v1/tools/${tool}")

  if [ -n "$file" ] && [ "$file" != "NONE" ]; then
    curl_args+=(-F "file=@${file}")
  fi

  if [ -n "$settings" ]; then
    curl_args+=(-F "settings=${settings}")
  fi

  curl_args+=(-o "$admission_file" -w $'%{http_code}\t%{time_total}\t%{content_type}')

  local result
  result=$(curl "${curl_args[@]}" 2>/dev/null) || result=$'000\t0.000\tapplication/octet-stream'

  IFS=$'\t' read -r http_code time_s response_mime <<< "$result"
  resolve_benchmark_response "$BASE_URL" "" "$http_code" "$response_mime" \
    "$admission_file" "$artifact_file" "$time_s" 120000 "" "" "$oracle" || true
  pass="$BENCH_PASS"
  time_s="$BENCH_COMPLETION_LATENCY_S"
  output_size="$BENCH_OUTPUT_SIZE"

  mem_after=$(docker_mem_mb "$CONTAINER_NAME")

  printf '{"system":"%s","tier":"resource-limit","cpus":"%s","memory":"%s","tool":"%s","variant":"%s","time_s":%s,"pass":%s,"output_size":%s,"mem_mb":%s,"admission_status":%s,"completion_status":"%s","completion_latency_s":%s,"output_mime":"%s"}\n' \
    "$SYSTEM" "$cpus" "$memory" "$tool" "$variant" "$time_s" "$pass" "$output_size" "$mem_after" "$BENCH_ADMISSION_STATUS" "$BENCH_COMPLETION_STATUS" "$BENCH_COMPLETION_LATENCY_S" "$BENCH_OUTPUT_MIME" >> "$RESULTS_FILE"

  log "cpus=${cpus} mem=${memory} ${tool}/${variant}: ${time_s}s admission:${BENCH_ADMISSION_STATUS} completion:${BENCH_COMPLETION_STATUS} mime:${BENCH_OUTPUT_MIME} pass:${pass}"
  rm -f "$admission_file" "$artifact_file"
}

run_batch_bench() {
  local cpus="$1" memory="$2" count="$3"
  local admission_file artifact_file time_s http_code response_mime pass output_size mem_after

  admission_file=$(mktemp)
  artifact_file=$(mktemp)

  local curl_args=(-s --max-time 180 -X POST "${BASE_URL}/api/v1/tools/image/resize")

  for i in $(seq 1 "$count"); do
    curl_args+=(-F "file=@${F}/image/valid/test-200x150.png")
  done

  curl_args+=(-F 'settings={"width":100}')
  curl_args+=(-o "$admission_file" -w $'%{http_code}\t%{time_total}\t%{content_type}')

  local result
  result=$(curl "${curl_args[@]}" 2>/dev/null) || result=$'000\t0.000\tapplication/octet-stream'

  IFS=$'\t' read -r http_code time_s response_mime <<< "$result"
  resolve_benchmark_response "$BASE_URL" "" "$http_code" "$response_mime" \
    "$admission_file" "$artifact_file" "$time_s" 180000 "application/zip" "$count" \
    '{"zipEach":{"width":100}}' || true
  pass="$BENCH_PASS"
  time_s="$BENCH_COMPLETION_LATENCY_S"
  output_size="$BENCH_OUTPUT_SIZE"

  mem_after=$(docker_mem_mb "$CONTAINER_NAME")

  printf '{"system":"%s","tier":"resource-limit","cpus":"%s","memory":"%s","tool":"batch-resize","variant":"b%d","time_s":%s,"pass":%s,"output_size":%s,"mem_mb":%s,"admission_status":%s,"completion_status":"%s","completion_latency_s":%s,"output_mime":"%s"}\n' \
    "$SYSTEM" "$cpus" "$memory" "$count" "$time_s" "$pass" "$output_size" "$mem_after" "$BENCH_ADMISSION_STATUS" "$BENCH_COMPLETION_STATUS" "$BENCH_COMPLETION_LATENCY_S" "$BENCH_OUTPUT_MIME" >> "$RESULTS_FILE"

  log "cpus=${cpus} mem=${memory} batch-resize/b${count}: ${time_s}s admission:${BENCH_ADMISSION_STATUS} completion:${BENCH_COMPLETION_STATUS} mime:${BENCH_OUTPUT_MIME} pass:${pass}"
  rm -f "$admission_file" "$artifact_file"
}

F="${FIXTURE_DIR}"
L="${F}/image/valid/stress-large.jpg"

log "=== Resource Limit Sweep on ${SYSTEM} ==="

# Override with SNAPOTTER_BENCH_LIMIT_CONFIGS="2:2g 4:4g" to run a subset; each
# entry costs a full cold container boot, so the whole sweep is not always what
# a run needs.
IFS=' ' read -r -a configs <<< "${SNAPOTTER_BENCH_LIMIT_CONFIGS:-1:512m 1:1g 1:2g 2:1g 2:2g 2:4g 4:2g 4:4g}"

for config in "${configs[@]}"; do
  cpus="${config%%:*}"
  memory="${config##*:}"

  if start_container "$cpus" "$memory"; then
    sleep 2

    run_bench "$cpus" "$memory" "image/resize" "large" "$L" '{"width":800,"fit":"cover"}' \
      '{"width":800}'
    run_bench "$cpus" "$memory" "image/compress" "targetSize" "$L" '{"mode":"targetSize","targetSizeKb":500}' \
      '{"maxBytes":512000}'
    run_bench "$cpus" "$memory" "image/convert" "avif" "$L" '{"format":"avif","quality":50}'

    run_batch_bench "$cpus" "$memory" 5

    cleanup
  else
    log "FAILED to start container at cpus=${cpus} mem=${memory}"
    printf '{"system":"%s","tier":"resource-limit","cpus":"%s","memory":"%s","tool":"startup","variant":"failed","time_s":0,"pass":false,"output_size":0,"mem_mb":0}\n' \
      "$SYSTEM" "$cpus" "$memory" >> "$RESULTS_FILE"
    cleanup
  fi
done

log "=== Cold Start Timing ==="

IFS=' ' read -r -a cold_start_configs <<< "${SNAPOTTER_BENCH_COLD_START_CONFIGS:-1:512m 2:2g 4:4g}"
for config in "${cold_start_configs[@]}"; do
  cpus="${config%%:*}"
  memory="${config##*:}"
  cleanup

  start_time=$(date +%s%N)
  create_container "$cpus" "$memory"

  attempts=0
  while ! curl -sf "${BASE_URL}/api/v1/health" >/dev/null 2>&1; do
    sleep 0.5
    attempts=$((attempts + 1))
    if [ "$attempts" -gt 120 ]; then break; fi
  done
  end_time=$(date +%s%N)

  startup_s=$(echo "scale=3; ($end_time - $start_time) / 1000000000" | bc 2>/dev/null || echo "0")

  printf '{"system":"%s","tier":"cold-start","cpus":"%s","memory":"%s","startup_s":%s}\n' \
    "$SYSTEM" "$cpus" "$memory" "$startup_s" >> "$RESULTS_FILE"

  log "Cold start cpus=${cpus} mem=${memory}: ${startup_s}s"
  cleanup
done

log "=== Resource Limit Sweep COMPLETE ==="
log "Results in: ${RESULTS_FILE}"
wc -l "$RESULTS_FILE" | awk '{print $1 " records written"}'
benchmark_assert_success
