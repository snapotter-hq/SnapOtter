#!/usr/bin/env bash
set -euo pipefail

SYSTEM="${1:?Usage: bench-limits.sh <system-name> <fixture-dir> <docker-image>}"
FIXTURE_DIR="${2:?}"
DOCKER_IMAGE="${3:-snapotter:latest}"
PORT=13491
BASE_URL="http://localhost:${PORT}"
RESULTS_FILE="bench-limits-results-${SYSTEM}.jsonl"
CONTAINER_NAME="SnapOtter-bench-limits"

log() { echo "[$(date +%H:%M:%S)] $*" >&2; }

> "$RESULTS_FILE"

cleanup() {
  docker rm -f "$CONTAINER_NAME" 2>/dev/null || true
}

start_container() {
  local cpus="$1" memory="$2"
  cleanup
  log "Starting container: --cpus=${cpus} --memory=${memory}"

  docker run --rm -d \
    --cpus="$cpus" --memory="$memory" \
    -p "${PORT}:1349" \
    -e AUTH_ENABLED=false \
    -e SKIP_MUST_CHANGE_PASSWORD=true \
    --name "$CONTAINER_NAME" \
    "$DOCKER_IMAGE" >/dev/null

  log "Waiting for health..."
  local attempts=0
  while ! curl -sf "http://localhost:${PORT}/api/v1/health" >/dev/null 2>&1; do
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
  local cpus="$1" memory="$2" tool="$3" variant="$4" file="$5" settings="${6:-}"
  local output_file time_s http_code pass output_size mem_after

  output_file=$(mktemp)

  local curl_args=(-s --max-time 120 -X POST "${BASE_URL}/api/v1/tools/${tool}")

  if [ -n "$file" ] && [ "$file" != "NONE" ]; then
    curl_args+=(-F "file=@${file}")
  fi

  if [ -n "$settings" ]; then
    curl_args+=(-F "settings=${settings}")
  fi

  curl_args+=(-o "$output_file" -w "%{http_code} %{time_total}")

  local result
  result=$(curl "${curl_args[@]}" 2>/dev/null) || result="000 0.000"

  http_code=$(echo "$result" | awk '{print $1}')
  time_s=$(echo "$result" | awk '{print $2}')

  mem_after=$(docker stats "$CONTAINER_NAME" --no-stream --format "{{.MemUsage}}" 2>/dev/null | awk -F/ '{gsub(/[^0-9.]/, "", $1); if($1+0 > 0) print $1; else print 0}' || echo "0")

  output_size=$(stat -c%s "$output_file" 2>/dev/null || stat -f%z "$output_file" 2>/dev/null || echo "0")

  if [ "$http_code" = "200" ]; then
    pass="true"
  else
    pass="false"
  fi

  printf '{"system":"%s","tier":"resource-limit","cpus":"%s","memory":"%s","tool":"%s","variant":"%s","time_s":%s,"pass":%s,"output_size":%s,"mem_mb":%s}\n' \
    "$SYSTEM" "$cpus" "$memory" "$tool" "$variant" "$time_s" "$pass" "$output_size" "$mem_after" >> "$RESULTS_FILE"

  log "cpus=${cpus} mem=${memory} ${tool}/${variant}: ${time_s}s HTTP:${http_code} pass:${pass}"
  rm -f "$output_file"
}

run_batch_bench() {
  local cpus="$1" memory="$2" count="$3"
  local output_file time_s http_code pass mem_after

  output_file=$(mktemp)

  local curl_args=(-s --max-time 180 -X POST "${BASE_URL}/api/v1/tools/resize")

  for i in $(seq 1 "$count"); do
    curl_args+=(-F "file=@${F}/test-200x150.png")
  done

  curl_args+=(-F 'settings={"width":100}')
  curl_args+=(-o "$output_file" -w "%{http_code} %{time_total}")

  local result
  result=$(curl "${curl_args[@]}" 2>/dev/null) || result="000 0.000"

  http_code=$(echo "$result" | awk '{print $1}')
  time_s=$(echo "$result" | awk '{print $2}')

  mem_after=$(docker stats "$CONTAINER_NAME" --no-stream --format "{{.MemUsage}}" 2>/dev/null | awk -F/ '{gsub(/[^0-9.]/, "", $1); if($1+0 > 0) print $1; else print 0}' || echo "0")

  if [ "$http_code" = "200" ]; then pass="true"; else pass="false"; fi

  printf '{"system":"%s","tier":"resource-limit","cpus":"%s","memory":"%s","tool":"batch-resize","variant":"b%d","time_s":%s,"pass":%s,"output_size":0,"mem_mb":%s}\n' \
    "$SYSTEM" "$cpus" "$memory" "$count" "$time_s" "$pass" "$mem_after" >> "$RESULTS_FILE"

  log "cpus=${cpus} mem=${memory} batch-resize/b${count}: ${time_s}s HTTP:${http_code} pass:${pass}"
  rm -f "$output_file"
}

F="${FIXTURE_DIR}"
L="${F}/content/stress-large.jpg"

log "=== Resource Limit Sweep on ${SYSTEM} ==="

configs=(
  "1:512m"
  "1:1g"
  "1:2g"
  "2:1g"
  "2:2g"
  "2:4g"
  "4:2g"
  "4:4g"
)

for config in "${configs[@]}"; do
  cpus="${config%%:*}"
  memory="${config##*:}"

  if start_container "$cpus" "$memory"; then
    sleep 2

    run_bench "$cpus" "$memory" "resize" "large" "$L" '{"width":800,"fit":"cover"}'
    run_bench "$cpus" "$memory" "compress" "targetSize" "$L" '{"mode":"targetSize","targetSizeKb":500}'
    run_bench "$cpus" "$memory" "convert" "avif" "$L" '{"format":"avif","quality":50}'

    run_batch_bench "$cpus" "$memory" 5

    run_bench "$cpus" "$memory" "collage" "4img" "NONE" '' \
      || log "Collage test skipped (needs multi-file support)"

    cleanup
  else
    log "FAILED to start container at cpus=${cpus} mem=${memory}"
    printf '{"system":"%s","tier":"resource-limit","cpus":"%s","memory":"%s","tool":"startup","variant":"failed","time_s":0,"pass":false,"output_size":0,"mem_mb":0}\n' \
      "$SYSTEM" "$cpus" "$memory" >> "$RESULTS_FILE"
    cleanup
  fi
done

log "=== Cold Start Timing ==="

for config in "1:512m" "2:2g" "4:4g"; do
  cpus="${config%%:*}"
  memory="${config##*:}"
  cleanup

  start_time=$(date +%s%N)
  docker run --rm -d --cpus="$cpus" --memory="$memory" -p "${PORT}:1349" \
    -e AUTH_ENABLED=false -e SKIP_MUST_CHANGE_PASSWORD=true \
    --name "$CONTAINER_NAME" "$DOCKER_IMAGE" >/dev/null

  attempts=0
  while ! curl -sf "http://localhost:${PORT}/api/v1/health" >/dev/null 2>&1; do
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
