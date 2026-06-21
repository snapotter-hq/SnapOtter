#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────────────────────────────────────
# verify-bundle.sh -- Verify an AI bundle tarball inside the Docker container
#
# Usage: verify-bundle.sh <bundleId> <arch>
#
#   bundleId  - One of: background-removal, face-detection, object-eraser-colorize,
#               upscale-enhance, photo-restoration, ocr, transcription
#   arch      - Architecture variant: amd64-gpu or arm64-cpu
#
# Expects:
#   /bundles/<bundleId>-<arch>.tar.gz       (read-only mount)
#   /bundles/<bundleId>-<arch>.tar.gz.sha256
#   /fixtures/                              (test fixtures, read-only mount)
#
# Runs with --entrypoint bash (no entrypoint bootstrap), so uses /opt/venv
# directly rather than /data/ai/venv.
#
# Exit codes: 0=pass, 1=integrity, 2=import, 3=smoke
# ──────────────────────────────────────────────────────────────────────────────

BUNDLE_ID="${1:?Usage: verify-bundle.sh <bundleId> <arch>}"
ARCH="${2:?Usage: verify-bundle.sh <bundleId> <arch>}"

ARCHIVE="/bundles/${BUNDLE_ID}-${ARCH}.tar.gz"
SHA_FILE="/bundles/${BUNDLE_ID}-${ARCH}.tar.gz.sha256"
STAGING="/tmp/verify-staging"

VENV="/opt/venv"
PYTHON="${VENV}/bin/python3"
SITE_PACKAGES="${VENV}/lib/python3.11/site-packages"

export MODELS_PATH="${MODELS_PATH:-/tmp/verify-models}"
export U2NET_HOME="${MODELS_PATH}/rembg"
export PYTHONPATH="/app/packages/ai/python"
export SNAPOTTER_GPU=0
export CUDA_VISIBLE_DEVICES=""

# ── Helpers ──────────────────────────────────────────────────────────────────

log() {
  echo "=== $* ==="
}

pass() {
  echo -e "\033[32mPASS: $*\033[0m"
}

fail() {
  local msg="$1"
  local code="${2:-1}"
  echo -e "\033[31mFAIL: ${msg}\033[0m" >&2
  exit "${code}"
}

run_python() {
  "${PYTHON}" "$@"
}

check_imports() {
  local mods="$1"
  for mod in ${mods}; do
    if run_python -c "import ${mod}" 2>/dev/null; then
      pass "import ${mod}"
    else
      fail "import ${mod} failed" 2
    fi
  done
}

# ── Phase 1: Integrity Checks ───────────────────────────────────────────────

log "Phase 1: Integrity Checks"

if [[ ! -f "${ARCHIVE}" ]]; then
  fail "Tarball not found: ${ARCHIVE}"
fi
pass "Tarball exists"

if [[ ! -f "${SHA_FILE}" ]]; then
  fail "SHA256 file not found: ${SHA_FILE}"
fi
pass "SHA256 file exists"

EXPECTED_SHA="$(cat "${SHA_FILE}" | awk '{print $1}')"
ACTUAL_SHA="$(sha256sum "${ARCHIVE}" | awk '{print $1}')"

if [[ "${EXPECTED_SHA}" != "${ACTUAL_SHA}" ]]; then
  fail "SHA256 mismatch: expected=${EXPECTED_SHA} actual=${ACTUAL_SHA}"
fi
pass "SHA256 checksum matches"

rm -rf "${STAGING}"
mkdir -p "${STAGING}"
tar -xzf "${ARCHIVE}" -C "${STAGING}"
pass "Tarball extracted to ${STAGING}"

if [[ ! -f "${STAGING}/bundle.json" ]]; then
  fail "bundle.json not found in archive"
fi

# Validate required fields in bundle.json
run_python -c "
import json, sys
with open('${STAGING}/bundle.json') as f:
    b = json.load(f)
for field in ('bundleId', 'arch', 'version', 'models'):
    if field not in b:
        print(f'Missing required field: {field}', file=sys.stderr)
        sys.exit(1)
print(f'  bundleId={b[\"bundleId\"]} arch={b[\"arch\"]} version={b[\"version\"]} models={len(b[\"models\"])}')
" || fail "bundle.json missing required fields"
pass "bundle.json valid"

# ── Phase 2: Installation ────────────────────────────────────────────────────

log "Phase 2: Installation"

if [[ -d "${STAGING}/site-packages" ]]; then
  cp -a "${STAGING}/site-packages/." "${SITE_PACKAGES}/"
  pass "site-packages merged into ${SITE_PACKAGES}"
else
  echo "  No site-packages/ in bundle, skipping"
fi

mkdir -p "${MODELS_PATH}"
if [[ -d "${STAGING}/models" ]]; then
  cp -a "${STAGING}/models/." "${MODELS_PATH}/"
  pass "Models copied to ${MODELS_PATH}"
else
  echo "  No models/ in bundle, skipping"
fi

if [[ -d "${STAGING}/fixups" ]]; then
  WHEELS=("${STAGING}/fixups"/*.whl)
  if [[ -f "${WHEELS[0]}" ]]; then
    run_python -m pip install --no-index --no-cache-dir "${STAGING}/fixups"/*.whl 2>/dev/null
    pass "Fixup wheels installed"
  else
    echo "  No .whl files in fixups/, skipping"
  fi
else
  echo "  No fixups/ directory, skipping"
fi

rm -rf "${STAGING}"
pass "Staging cleaned up"

df -h

# ── Phase 3: Import Checks ──────────────────────────────────────────────────

log "Phase 3: Import Checks"

case "${BUNDLE_ID}" in
  background-removal)
    check_imports "rembg onnxruntime"
    ;;
  face-detection)
    check_imports "mediapipe"
    ;;
  object-eraser-colorize)
    check_imports "onnxruntime cv2"
    ;;
  upscale-enhance)
    check_imports "torch realesrgan onnxruntime"
    ;;
  photo-restoration)
    check_imports "torch onnxruntime mediapipe"
    ;;
  ocr)
    check_imports "paddleocr paddle"
    ;;
  transcription)
    check_imports "faster_whisper"
    ;;
  *)
    fail "Unknown bundle: ${BUNDLE_ID}" 2
    ;;
esac

pass "All imports OK for ${BUNDLE_ID}"

# ── Phase 4: Functional Smoke Tests ─────────────────────────────────────────

log "Phase 4: Functional Smoke Tests"

AI_SCRIPTS="/app/packages/ai/python"

smoke_background_removal() {
  local input="/fixtures/test-200x150.png"
  [[ -f "$input" ]] || fail "Fixture missing: $input" 3
  local output="/tmp/verify-smoke-rembg.png"
  timeout 300 run_python "${AI_SCRIPTS}/remove_bg.py" "${input}" "${output}" 2>/dev/null || true
  [[ -f "${output}" && -s "${output}" ]] || fail "remove_bg output missing or empty" 3
  # Verify it's a valid PNG (check magic bytes)
  run_python -c "
import sys
with open('${output}', 'rb') as f:
    magic = f.read(8)
if magic[:4] != b'\\x89PNG':
    sys.exit(1)
" || fail "remove_bg output is not a valid PNG" 3
  pass "remove_bg produced valid PNG output"
}

smoke_face_detection() {
  local input="/fixtures/sample-photo.jpg"
  [[ -f "$input" ]] || fail "Fixture missing: $input" 3
  local output="/tmp/verify-smoke-faces.png"
  timeout 300 run_python "${AI_SCRIPTS}/detect_faces.py" "${input}" "${output}" 2>/dev/null || true
  [[ -f "${output}" ]] || fail "detect_faces output missing" 3
  pass "detect_faces produced output"
}

smoke_object_eraser_colorize() {
  local input="/tmp/verify-smoke-gray.png"
  local output="/tmp/verify-smoke-color.png"
  # Generate a 64x64 grayscale test image
  run_python -c "
from PIL import Image
img = Image.new('L', (64, 64), 128)
img.save('${input}')
" 2>/dev/null
  timeout 300 run_python "${AI_SCRIPTS}/colorize.py" "${input}" "${output}" '{"model":"ddcolor"}' 2>/dev/null || true
  [[ -f "${output}" && -s "${output}" ]] || fail "colorize output missing or empty" 3
  pass "colorize produced output"
}

smoke_upscale_enhance() {
  local input="/fixtures/test-100x100.jpg"
  [[ -f "$input" ]] || fail "Fixture missing: $input" 3
  local output="/tmp/verify-smoke-upscale.png"
  timeout 300 run_python "${AI_SCRIPTS}/upscale.py" "${input}" "${output}" '{"scale":2}' 2>/dev/null || true
  [[ -f "${output}" && -s "${output}" ]] || fail "upscale output missing or empty" 3
  run_python -c "
from PIL import Image
inp = Image.open('${input}')
out = Image.open('${output}')
if out.width <= inp.width or out.height <= inp.height:
    print(f'Output {out.size} not larger than input {inp.size}')
    exit(1)
print(f'  Upscale: {inp.size} -> {out.size}')
" || fail "upscale output dimensions not larger than input" 3
  pass "upscale produced larger output"
}

smoke_photo_restoration() {
  local input="/fixtures/test-100x100.jpg"
  [[ -f "$input" ]] || fail "Fixture missing: $input" 3
  local output="/tmp/verify-smoke-restore.png"
  timeout 300 run_python "${AI_SCRIPTS}/restore.py" "${input}" "${output}" 2>/dev/null || true
  [[ -f "${output}" && -s "${output}" ]] || fail "restore output missing or empty" 3
  pass "restore produced output"
}

smoke_ocr() {
  local input="/tmp/verify-smoke-ocr.png"
  # Generate a 400x100 image with large, clear text for reliable OCR
  run_python -c "
from PIL import Image, ImageDraw, ImageFont
img = Image.new('RGB', (400, 100), 'white')
draw = ImageDraw.Draw(img)
try:
    font = ImageFont.load_default(size=40)
except TypeError:
    font = ImageFont.load_default()
draw.text((20, 20), 'Hello SnapOtter', fill='black', font=font)
img.save('${input}')
" 2>/dev/null
  local result
  result="$(timeout 300 run_python "${AI_SCRIPTS}/ocr.py" "${input}" '{"quality":"balanced","enhance":false}' 2>/dev/null)" || result=""
  # Check stdout JSON has success=true and non-empty text
  echo "${result}" | run_python -c "
import json, sys
data = json.load(sys.stdin)
if not data.get('success'):
    print('OCR did not return success=true', file=sys.stderr)
    sys.exit(1)
text = data.get('text', '')
if not text.strip():
    print('OCR returned empty text', file=sys.stderr)
    sys.exit(1)
print(f'  OCR text: {text[:80]}')
" || fail "OCR smoke test assertion failed" 3
  pass "ocr returned valid result"
}

smoke_transcription() {
  local input="/fixtures/content/speech-10s.wav"
  [[ -f "$input" ]] || fail "Fixture missing: $input" 3
  local result
  result="$(timeout 300 run_python "${AI_SCRIPTS}/transcribe.py" "${input}" 2>/dev/null)" || result=""
  # Check stdout JSON has success=true and non-empty segments
  echo "${result}" | run_python -c "
import json, sys
data = json.load(sys.stdin)
if not data.get('success'):
    print('Transcription did not return success=true', file=sys.stderr)
    sys.exit(1)
segments = data.get('segments', [])
if not segments:
    print('Transcription returned empty segments', file=sys.stderr)
    sys.exit(1)
print(f'  Transcription segments: {len(segments)}')
" || fail "Transcription smoke test assertion failed" 3
  pass "transcribe returned valid result"
}

case "${BUNDLE_ID}" in
  background-removal)    smoke_background_removal ;;
  face-detection)        smoke_face_detection ;;
  object-eraser-colorize) smoke_object_eraser_colorize ;;
  upscale-enhance)       smoke_upscale_enhance ;;
  photo-restoration)     smoke_photo_restoration ;;
  ocr)                   smoke_ocr ;;
  transcription)         smoke_transcription ;;
esac

# ── Done ─────────────────────────────────────────────────────────────────────

log "All phases passed for ${BUNDLE_ID} (${ARCH})"
exit 0
