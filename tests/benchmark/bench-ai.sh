#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
source "${SCRIPT_DIR}/lib/job-aware.sh"

SYSTEM="${1:?Usage: bench-ai.sh <system-name> <fixture-dir> [port] [gpu-mode]}"
FIXTURE_DIR="${2:?Usage: bench-ai.sh <system-name> <fixture-dir> [port] [gpu-mode]}"
PORT="${3:-1349}"
GPU_MODE="${4:-gpu}"
BASE_URL="http://localhost:${PORT}"
RESULTS_FILE="bench-ai-results-${SYSTEM}-${GPU_MODE}.jsonl"

CONTAINER_NAME="SnapOtter"

log() { echo "[$(date +%H:%M:%S)] $*" >&2; }

get_token() {
  curl -sf -X POST "${BASE_URL}/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d '{"username":"admin","password":"admin"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])"
}

get_container_id() {
  docker ps -q -f name="${CONTAINER_NAME}" | head -1
}

docker_mem_mb() {
  local cid="$1"
  docker stats "$cid" --no-stream --format "{{.MemUsage}}" 2>/dev/null | awk -F/ '{gsub(/[^0-9.]/, "", $1); if($1+0 > 0) print $1; else print 0}'
}

docker_cpu_pct() {
  local cid="$1"
  docker stats "$cid" --no-stream --format "{{.CPUPerc}}" 2>/dev/null | tr -d '%'
}

gpu_vram_mb() {
  nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits 2>/dev/null || echo "0"
}

record() {
  local tier="$1" tool="$2" variant="$3" time_s="$4" pass="$5" output_size="${6:-0}" mem_mb="${7:-0}" cpu_pct="${8:-0}" vram_mb="${9:-0}"
  local admission_status="${10:-0}" completion_status="${11:-failed}" completion_latency_s="${12:-0}" output_mime="${13:-unknown}"
  printf '{"system":"%s","tier":"%s","tool":"%s","variant":"%s","time_s":%s,"pass":%s,"output_size":%s,"mem_mb":%s,"cpu_pct":%s,"vram_mb":%s,"gpu_mode":"%s","admission_status":%s,"completion_status":"%s","completion_latency_s":%s,"output_mime":"%s"}\n' \
    "$SYSTEM" "$tier" "$tool" "$variant" "$time_s" "$pass" "$output_size" "$mem_mb" "$cpu_pct" "$vram_mb" "$GPU_MODE" "$admission_status" "$completion_status" "$completion_latency_s" "$output_mime" >> "$RESULTS_FILE"
}

bench_ai_tool() {
  local tool="$1" variant="$2" file="$3" settings="${4:-}"
  local cid time_s http_code response_mime mem_after cpu vram admission_file artifact_file pass output_size

  cid=$(get_container_id)
  admission_file=$(mktemp)
  artifact_file=$(mktemp)

  local curl_args=(-sS -X POST "${BASE_URL}/api/v1/tools/${tool}" -H "Authorization: Bearer ${TOKEN}")

  if [ -n "$file" ] && [ "$file" != "NONE" ]; then
    curl_args+=(-F "file=@${file}")
  fi

  if [ -n "$settings" ]; then
    curl_args+=(-F "settings=${settings}")
  fi

  curl_args+=(-o "$admission_file" -w $'%{http_code}\t%{time_total}\t%{content_type}')

  local result
  result=$(curl --max-time 300 "${curl_args[@]}" 2>/dev/null) || result=$'000\t0.000\tapplication/octet-stream'

  IFS=$'\t' read -r http_code time_s response_mime <<< "$result"
  resolve_benchmark_response "$BASE_URL" "$TOKEN" "$http_code" "$response_mime" \
    "$admission_file" "$artifact_file" "$time_s" || true
  pass="$BENCH_PASS"
  time_s="$BENCH_COMPLETION_LATENCY_S"
  output_size="$BENCH_OUTPUT_SIZE"

  mem_after=$(docker_mem_mb "$cid" 2>/dev/null || echo "0")
  cpu=$(docker_cpu_pct "$cid" 2>/dev/null || echo "0")
  vram=$(gpu_vram_mb)

  record "ai" "$tool" "$variant" "$time_s" "$pass" "$output_size" "$mem_after" "$cpu" "$vram" \
    "$BENCH_ADMISSION_STATUS" "$BENCH_COMPLETION_STATUS" "$BENCH_COMPLETION_LATENCY_S" "$BENCH_OUTPUT_MIME"
  log "ai/$tool/$variant: ${time_s}s admission:${BENCH_ADMISSION_STATUS} completion:${BENCH_COMPLETION_STATUS} mime:${BENCH_OUTPUT_MIME} mem:${mem_after}MB vram:${vram}MB pass:${pass}"

  rm -f "$admission_file" "$artifact_file"
}

F="${FIXTURE_DIR}"
P="${F}/content/portrait-color.jpg"
ISO="${F}/content/portrait-isolated.png"
J="${F}/test-100x100.jpg"
BW="${F}/content/portrait-bw.jpeg"
OCR="${F}/content/ocr-chat.jpeg"
OCRJP="${F}/content/ocr-japanese.png"
FACE="${F}/content/multi-face.webp"
HEAD="${F}/content/portrait-headshot.heic"
REDEYE="${F}/content/red-eye.jpg"
S="${F}/test-200x150.png"
L="${F}/content/stress-large.jpg"

> "$RESULTS_FILE"

log "=== Starting AI benchmarks on ${SYSTEM} (${GPU_MODE}) ==="
TOKEN=$(get_token)
log "Auth token obtained"

for run in 1 2 3; do
  log "--- AI Run $run of 3 ---"

  bench_ai_tool "image/remove-background" "portrait-r${run}" "$P" '{"backgroundType":"transparent"}'
  bench_ai_tool "image/remove-background" "isolated-r${run}" "$ISO" '{"backgroundType":"color","backgroundColor":"#0000FF"}'

  bench_ai_tool "image/upscale" "2x-small-r${run}" "$J" '{"scale":2}'
  bench_ai_tool "image/upscale" "2x-large-r${run}" "$P" '{"scale":2}'
  bench_ai_tool "image/upscale" "face-r${run}" "$P" '{"scale":2,"faceEnhance":true}'

  bench_ai_tool "image/ocr" "fast-r${run}" "$OCR" '{"quality":"fast","language":"en"}'
  bench_ai_tool "image/ocr" "best-r${run}" "$OCR" '{"quality":"best","language":"en"}'
  bench_ai_tool "image/ocr" "japanese-r${run}" "$OCRJP" '{"quality":"balanced","language":"ja"}'

  bench_ai_tool "image/blur-faces" "r${run}" "$FACE" '{"blurRadius":30,"sensitivity":0.5}'

  bench_ai_tool "image/smart-crop" "face-r${run}" "$P" '{"mode":"face","width":400,"height":400}'

  bench_ai_tool "image/colorize" "r${run}" "$BW" '{"intensity":1.0}'

  bench_ai_tool "image/enhance-faces" "gfpgan-r${run}" "$P" '{"model":"gfpgan","strength":0.8}'
  bench_ai_tool "image/enhance-faces" "codeformer-r${run}" "$P" '{"model":"codeformer","strength":0.7}'

  bench_ai_tool "image/noise-removal" "quick-r${run}" "$S" '{"tier":"quick"}'
  bench_ai_tool "image/noise-removal" "quality-r${run}" "$L" '{"tier":"quality"}'

  bench_ai_tool "image/red-eye-removal" "r${run}" "$REDEYE" '{"sensitivity":50,"strength":80}'

  bench_ai_tool "image/restore-photo" "full-r${run}" "$BW" '{"mode":"auto","scratchRemoval":true,"faceEnhancement":true,"colorize":true}'

  bench_ai_tool "image/passport-photo" "r${run}" "$HEAD" ''

  bench_ai_tool "image/content-aware-resize" "face-r${run}" "$P" '{"width":300,"protectFaces":true}'
done

log "=== TIER 3: AI Batch Processing ==="

for batch_size in 3 5; do
  log "AI Batch ${batch_size} - remove-background"
  admission_file=$(mktemp)
  artifact_file=$(mktemp)
  cid=$(get_container_id)

  curl_args=(-s -X POST "${BASE_URL}/api/v1/tools/image/remove-background" -H "Authorization: Bearer ${TOKEN}")
  for i in $(seq 1 "$batch_size"); do
    curl_args+=(-F "file=@${P}")
  done
  curl_args+=(-F 'settings={"backgroundType":"transparent"}')
  curl_args+=(-o "$admission_file" -w $'%{http_code}\t%{time_total}\t%{content_type}')

  result=$(curl --max-time 600 "${curl_args[@]}" 2>/dev/null) || result=$'000\t0.000\tapplication/octet-stream'
  IFS=$'\t' read -r http_code time_s response_mime <<< "$result"
  resolve_benchmark_response "$BASE_URL" "$TOKEN" "$http_code" "$response_mime" \
    "$admission_file" "$artifact_file" "$time_s" 600000 || true
  pass="$BENCH_PASS"
  time_s="$BENCH_COMPLETION_LATENCY_S"
  output_size="$BENCH_OUTPUT_SIZE"
  mem_after=$(docker_mem_mb "$cid" 2>/dev/null || echo "0")
  vram=$(gpu_vram_mb)

  record "ai-batch" "remove-background" "b${batch_size}" "$time_s" "$pass" "$output_size" "$mem_after" "0" "$vram" \
    "$BENCH_ADMISSION_STATUS" "$BENCH_COMPLETION_STATUS" "$BENCH_COMPLETION_LATENCY_S" "$BENCH_OUTPUT_MIME"
  log "ai-batch/remove-background/b${batch_size}: ${time_s}s admission:${BENCH_ADMISSION_STATUS} completion:${BENCH_COMPLETION_STATUS} mime:${BENCH_OUTPUT_MIME}"
  rm -f "$admission_file" "$artifact_file"
done

log "=== Sustained AI Load (10 cycles) ==="
cid=$(get_container_id)
mem_start=$(docker_mem_mb "$cid" 2>/dev/null || echo "0")
vram_start=$(gpu_vram_mb)

for i in $(seq 1 10); do
  bench_ai_tool "image/remove-background" "sustained-${i}" "$P" '{"backgroundType":"transparent"}'
done

mem_end=$(docker_mem_mb "$cid" 2>/dev/null || echo "0")
vram_end=$(gpu_vram_mb)
printf '{"system":"%s","tier":"ai-sustained-summary","gpu_mode":"%s","mem_start_mb":%s,"mem_end_mb":%s,"vram_start_mb":%s,"vram_end_mb":%s}\n' \
  "$SYSTEM" "$GPU_MODE" "$mem_start" "$mem_end" "$vram_start" "$vram_end" >> "$RESULTS_FILE"

log "=== ALL AI BENCHMARKS COMPLETE for ${SYSTEM} (${GPU_MODE}) ==="
log "Results in: ${RESULTS_FILE}"
wc -l "$RESULTS_FILE" | awk '{print $1 " AI benchmark records written"}'
benchmark_assert_success
