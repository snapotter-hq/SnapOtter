#!/usr/bin/env bash
set -euo pipefail

SYSTEM="${1:?Usage: bench.sh <system-name> <fixture-dir> [port]}"
FIXTURE_DIR="${2:?Usage: bench.sh <system-name> <fixture-dir> [port]}"
PORT="${3:-1349}"
BASE_URL="http://localhost:${PORT}"
RESULTS_FILE="bench-results-${SYSTEM}.jsonl"

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

record() {
  local tier="$1" tool="$2" variant="$3" time_s="$4" pass="$5" output_size="${6:-0}" mem_mb="${7:-0}" cpu_pct="${8:-0}" extra="${9:-}"
  printf '{"system":"%s","tier":"%s","tool":"%s","variant":"%s","time_s":%s,"pass":%s,"output_size":%s,"mem_mb":%s,"cpu_pct":%s%s}\n' \
    "$SYSTEM" "$tier" "$tool" "$variant" "$time_s" "$pass" "$output_size" "$mem_mb" "$cpu_pct" "$extra" >> "$RESULTS_FILE"
}

bench_tool() {
  local tier="$1" tool="$2" variant="$3" file="$4" settings="${5:-}" extra_args="${6:-}"
  local cid time_s http_code mem_before mem_after cpu output_file pass output_size

  cid=$(get_container_id)
  mem_before=$(docker_mem_mb "$cid" 2>/dev/null || echo "0")

  output_file=$(mktemp)
  local timing_file=$(mktemp)

  local curl_args=(-s -X POST "${BASE_URL}/api/v1/tools/${tool}" -H "Authorization: Bearer ${TOKEN}")

  if [ -n "$file" ] && [ "$file" != "NONE" ]; then
    curl_args+=(-F "file=@${file}")
  fi

  if [ -n "$settings" ]; then
    curl_args+=(-F "settings=${settings}")
  fi

  if [ -n "$extra_args" ]; then
    eval "curl_args+=($extra_args)"
  fi

  curl_args+=(-o "$output_file" -w "%{http_code} %{time_total}")

  local result
  result=$(curl "${curl_args[@]}" 2>/dev/null) || result="000 0.000"

  http_code=$(echo "$result" | awk '{print $1}')
  time_s=$(echo "$result" | awk '{print $2}')

  mem_after=$(docker_mem_mb "$cid" 2>/dev/null || echo "0")
  cpu=$(docker_cpu_pct "$cid" 2>/dev/null || echo "0")

  output_size=$(stat -c%s "$output_file" 2>/dev/null || stat -f%z "$output_file" 2>/dev/null || echo "0")

  if [ "$http_code" = "200" ]; then
    pass="true"
  else
    pass="false"
  fi

  record "$tier" "$tool" "$variant" "$time_s" "$pass" "$output_size" "$mem_after" "$cpu"

  log "$tier/$tool/$variant: ${time_s}s HTTP:${http_code} mem:${mem_after}MB pass:${pass}"

  rm -f "$output_file" "$timing_file"
}

bench_tool_multifile() {
  local tier="$1" tool="$2" variant="$3" settings="${4:-}"
  shift 4
  local files=("$@")

  local cid time_s http_code mem_after cpu output_file pass output_size

  cid=$(get_container_id)
  output_file=$(mktemp)

  local curl_args=(-s -X POST "${BASE_URL}/api/v1/tools/${tool}" -H "Authorization: Bearer ${TOKEN}")

  for f in "${files[@]}"; do
    curl_args+=(-F "file=@${f}")
  done

  if [ -n "$settings" ]; then
    curl_args+=(-F "settings=${settings}")
  fi

  curl_args+=(-o "$output_file" -w "%{http_code} %{time_total}")

  local result
  result=$(curl "${curl_args[@]}" 2>/dev/null) || result="000 0.000"

  http_code=$(echo "$result" | awk '{print $1}')
  time_s=$(echo "$result" | awk '{print $2}')

  mem_after=$(docker_mem_mb "$cid" 2>/dev/null || echo "0")
  cpu=$(docker_cpu_pct "$cid" 2>/dev/null || echo "0")
  output_size=$(stat -c%s "$output_file" 2>/dev/null || stat -f%z "$output_file" 2>/dev/null || echo "0")

  if [ "$http_code" = "200" ]; then
    pass="true"
  else
    pass="false"
  fi

  record "$tier" "$tool" "$variant" "$time_s" "$pass" "$output_size" "$mem_after" "$cpu"
  log "$tier/$tool/$variant: ${time_s}s HTTP:${http_code} pass:${pass}"

  rm -f "$output_file"
}

run_n_times() {
  local n="$1"
  shift
  local times=()
  for i in $(seq 1 "$n"); do
    "$@"
  done
}

F="${FIXTURE_DIR}"
S="${F}/test-200x150.png"
J="${F}/test-100x100.jpg"
L="${F}/content/stress-large.jpg"
P="${F}/content/portrait-color.jpg"
BW="${F}/content/portrait-bw.jpeg"
SVG="${F}/content/svg-logo.svg"
GIF="${F}/content/animated-simpsons.gif"
PDF="${F}/test-3page.pdf"
EXIF="${F}/test-with-exif.jpg"
FACE="${F}/content/multi-face.webp"
OCR="${F}/content/ocr-chat.jpeg"
OCRJP="${F}/content/ocr-japanese.png"
ISO="${F}/content/portrait-isolated.png"
HEAD="${F}/content/portrait-headshot.heic"
REDEYE="${F}/content/red-eye.jpg"
BARCODE="${F}/content/barcode.avif"

echo "[]" > /dev/null
> "$RESULTS_FILE"

log "=== Starting benchmarks on ${SYSTEM} ==="
TOKEN=$(get_token)
log "Auth token obtained"

log "=== TIER 1: Core Tool Benchmarks ==="

for run in 1 2 3; do
  log "--- Run $run of 3 ---"

  bench_tool "core" "resize" "small-r${run}" "$S" '{"width":100,"fit":"cover"}'
  bench_tool "core" "resize" "large-r${run}" "$L" '{"width":800,"fit":"cover"}'

  bench_tool "core" "crop" "small-r${run}" "$S" '{"left":10,"top":10,"width":100,"height":100}'
  bench_tool "core" "crop" "large-r${run}" "$L" '{"left":10,"top":10,"width":100,"height":100}'

  bench_tool "core" "rotate" "small-r${run}" "$S" '{"angle":90}'
  bench_tool "core" "rotate" "large-r${run}" "$L" '{"angle":90}'

  bench_tool "core" "convert" "jpg-webp-small-r${run}" "$J" '{"format":"webp","quality":80}'
  bench_tool "core" "convert" "jpg-webp-large-r${run}" "$L" '{"format":"webp","quality":80}'
  bench_tool "core" "convert" "jpg-avif-small-r${run}" "$J" '{"format":"avif","quality":50}'
  bench_tool "core" "convert" "jpg-avif-large-r${run}" "$L" '{"format":"avif","quality":50}'

  bench_tool "core" "compress" "quality-small-r${run}" "$S" '{"mode":"quality","quality":60}'
  bench_tool "core" "compress" "quality-large-r${run}" "$L" '{"mode":"quality","quality":60}'
  bench_tool "core" "compress" "targetSize-large-r${run}" "$L" '{"mode":"targetSize","targetSizeKb":500}'

  bench_tool "core" "strip-metadata" "small-r${run}" "$EXIF" '{"stripAll":true}'
  bench_tool "core" "strip-metadata" "large-r${run}" "$L" '{"stripAll":true}'

  bench_tool "core" "edit-metadata" "small-r${run}" "$EXIF" '{"title":"Bench","clearGps":true}'
  bench_tool "core" "edit-metadata" "large-r${run}" "$L" '{"title":"Bench","clearGps":true}'

  bench_tool "core" "color-adjustments" "small-r${run}" "$S" '{"brightness":20,"contrast":10,"effect":"grayscale"}'
  bench_tool "core" "color-adjustments" "large-r${run}" "$L" '{"brightness":20,"contrast":10,"effect":"grayscale"}'

  bench_tool "core" "sharpening" "small-r${run}" "$S" '{"method":"adaptive","sigma":1.5}'
  bench_tool "core" "sharpening" "large-r${run}" "$L" '{"method":"adaptive","sigma":1.5}'

  bench_tool "core" "watermark-text" "small-r${run}" "$S" '{"text":"BENCHMARK","position":"tiled"}'
  bench_tool "core" "watermark-text" "large-r${run}" "$L" '{"text":"BENCHMARK","position":"tiled"}'

  bench_tool_multifile "core" "compose" "small-r${run}" '{"blendMode":"overlay"}' "$S" "$J"
  bench_tool_multifile "core" "compose" "large-r${run}" '{"blendMode":"overlay"}' "$L" "$P"

  bench_tool_multifile "core" "collage" "4img-small-r${run}" '{"templateId":"4-grid"}' "$S" "$J" "${F}/test-50x50.webp" "${F}/test-100x100.svg"
  bench_tool_multifile "core" "collage" "4img-large-r${run}" '{"templateId":"4-grid"}' "$L" "$P" "$BW" "${F}/content/watermark.jpg"

  bench_tool_multifile "core" "stitch" "3img-small-r${run}" '{"direction":"horizontal"}' "$S" "$J" "${F}/test-50x50.webp"
  bench_tool_multifile "core" "stitch" "3img-large-r${run}" '{"direction":"horizontal"}' "$L" "$P" "$BW"

  bench_tool "core" "split" "small-r${run}" "$S" '{"columns":2,"rows":2}'
  bench_tool "core" "split" "large-r${run}" "$L" '{"columns":2,"rows":2}'

  bench_tool "core" "border" "small-r${run}" "$S" '{"borderWidth":20,"cornerRadius":10,"shadow":true}'
  bench_tool "core" "border" "large-r${run}" "$L" '{"borderWidth":20,"cornerRadius":10,"shadow":true}'

  bench_tool "core" "svg-to-raster" "small-r${run}" "${F}/test-100x100.svg" '{"width":2000,"dpi":300}'

  bench_tool "core" "vectorize" "small-r${run}" "$S" '{"colorMode":"color"}'
  bench_tool "core" "vectorize" "large-r${run}" "$P" '{"colorMode":"color"}'

  bench_tool "core" "gif-tools" "optimize-r${run}" "$GIF" '{"mode":"optimize","colors":64}'

  bench_tool "core" "pdf-to-image" "r${run}" "$PDF" '{"format":"png","dpi":300}'

  bench_tool "core" "optimize-for-web" "large-r${run}" "$L" '{"format":"webp","quality":80,"maxWidth":1920}'

  bench_tool "core" "favicon" "small-r${run}" "$S" ''
  bench_tool "core" "favicon" "large-r${run}" "$P" ''

  bench_tool_multifile "core" "image-to-pdf" "3img-r${run}" '{"pageSize":"A4"}' "$S" "$J" "${F}/test-50x50.webp"

  bench_tool "core" "replace-color" "small-r${run}" "$S" '{"sourceColor":"#FFFFFF","targetColor":"#FF0000","tolerance":30}'
  bench_tool "core" "replace-color" "large-r${run}" "$L" '{"sourceColor":"#FFFFFF","targetColor":"#FF0000","tolerance":30}'

  bench_tool "core" "info" "small-r${run}" "$S" ''
  bench_tool "core" "info" "large-r${run}" "$L" ''

  bench_tool_multifile "core" "compare" "small-r${run}" '' "$S" "$S"
  bench_tool_multifile "core" "compare" "large-r${run}" '' "$L" "$L"

  bench_tool_multifile "core" "find-duplicates" "5img-r${run}" '{"threshold":5}' "$S" "$J" "${F}/test-50x50.webp" "$S" "$J"

  bench_tool "core" "color-palette" "small-r${run}" "$P" ''
  bench_tool "core" "color-palette" "large-r${run}" "$L" ''

  bench_tool "core" "barcode-read" "r${run}" "$BARCODE" '{"tryHarder":true}'

  bench_tool "core" "image-to-base64" "small-r${run}" "$S" '{"outputFormat":"webp"}'
  bench_tool "core" "image-to-base64" "large-r${run}" "$L" '{"outputFormat":"webp"}'

  bench_tool "core" "content-aware-resize" "small-r${run}" "$S" '{"width":100}'
  bench_tool "core" "content-aware-resize" "large-r${run}" "$L" '{"width":100}'

  bench_tool "core" "image-enhancement" "small-r${run}" "$S" '{"mode":"auto","intensity":50}'
  bench_tool "core" "image-enhancement" "large-r${run}" "$L" '{"mode":"auto","intensity":50}'
done

log "=== TIER 5: Format Decode Benchmarks ==="

for fmt_file in "${F}/formats/"*; do
  fname=$(basename "$fmt_file")
  for run in 1 2 3; do
    bench_tool "format" "resize" "fmt-${fname}-r${run}" "$fmt_file" '{"width":200}'
  done
done

log "=== TIER 6: Concurrent Load Benchmarks ==="

for concurrency in 1 3 5 10 20; do
  log "Concurrency: ${concurrency}"
  local_results=$(mktemp)

  for i in $(seq 1 "$concurrency"); do
    (
      result=$(curl -s -X POST "${BASE_URL}/api/v1/tools/resize" \
        -H "Authorization: Bearer ${TOKEN}" \
        -F "file=@${L}" \
        -F 'settings={"width":800}' \
        -o /dev/null -w "%{http_code} %{time_total}")
      echo "$result"
    ) >> "$local_results" &
  done
  wait

  cid=$(get_container_id)
  mem_after=$(docker_mem_mb "$cid" 2>/dev/null || echo "0")

  times=()
  errors=0
  while IFS= read -r line; do
    code=$(echo "$line" | awk '{print $1}')
    t=$(echo "$line" | awk '{print $2}')
    times+=("$t")
    if [ "$code" != "200" ]; then
      errors=$((errors + 1))
    fi
  done < "$local_results"

  sorted=$(printf '%s\n' "${times[@]}" | sort -n)
  count=${#times[@]}
  avg=$(printf '%s\n' "${times[@]}" | awk '{s+=$1} END {printf "%.3f", s/NR}')
  p95_idx=$(( (count * 95 / 100) ))
  [ "$p95_idx" -ge "$count" ] && p95_idx=$((count - 1))
  p95=$(echo "$sorted" | sed -n "$((p95_idx + 1))p")
  max=$(echo "$sorted" | tail -1)
  min=$(echo "$sorted" | head -1)

  printf '{"system":"%s","tier":"concurrent","tool":"resize","variant":"c%d","concurrency":%d,"avg_s":%s,"p95_s":%s,"max_s":%s,"min_s":%s,"errors":%d,"mem_mb":%s}\n' \
    "$SYSTEM" "$concurrency" "$concurrency" "$avg" "${p95:-0}" "${max:-0}" "${min:-0}" "$errors" "$mem_after" >> "$RESULTS_FILE"

  log "concurrent/c${concurrency}: avg=${avg}s p95=${p95}s max=${max}s errors=${errors} mem=${mem_after}MB"
  rm -f "$local_results"
done

log "=== TIER 7: Sustained Load (50 sequential resizes) ==="

cid=$(get_container_id)
mem_start=$(docker_mem_mb "$cid" 2>/dev/null || echo "0")

for i in $(seq 1 50); do
  bench_tool "sustained" "resize" "seq-${i}" "$L" '{"width":800}'
done

mem_end=$(docker_mem_mb "$cid" 2>/dev/null || echo "0")
mem_delta=$(echo "$mem_end - $mem_start" | bc 2>/dev/null || echo "0")
printf '{"system":"%s","tier":"sustained-summary","test":"50-resizes","mem_start_mb":%s,"mem_end_mb":%s,"mem_delta_mb":%s}\n' \
  "$SYSTEM" "$mem_start" "$mem_end" "$mem_delta" >> "$RESULTS_FILE"
log "Sustained: start=${mem_start}MB end=${mem_end}MB delta=${mem_delta}MB"

log "=== TIER 3: Batch Processing ==="

for batch_size in 3 5 10; do
  files=()
  for i in $(seq 1 "$batch_size"); do
    files+=("$S")
  done
  bench_tool_multifile "batch" "resize" "small-b${batch_size}" '{"width":100}' "${files[@]}"
done

for batch_size in 3 5; do
  files=()
  for i in $(seq 1 "$batch_size"); do
    files+=("$L")
  done
  bench_tool_multifile "batch" "resize" "large-b${batch_size}" '{"width":800}' "${files[@]}"
done

bench_tool_multifile "batch" "convert" "mixed-5" '{"format":"webp","quality":80}' \
  "$J" "$S" "${F}/test-50x50.webp" "${F}/test-200x150.heic" "${F}/formats/sample.avif"

log "=== TIER 4: Pipeline Benchmarks ==="

bench_tool "pipeline" "resize" "1step" "$L" '{"width":800}'

log "=== Container Cold Start ==="
# Record current time as baseline
log "Cold start measurement requires container restart - skipping in automated run"

log "=== ALL BENCHMARKS COMPLETE for ${SYSTEM} ==="
log "Results in: ${RESULTS_FILE}"
wc -l "$RESULTS_FILE" | awk '{print $1 " benchmark records written"}'
