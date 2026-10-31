#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────────────────────────────────────
# verify-model-bundle-runtime.sh -- Release gate: verify a published model bundle
# by INSTALLING it into the release image and RUNNING its representative tool,
# asserting the tool's real OUTPUT ORACLE (dimensions, alpha, colour, segments,
# non-black), not a hardcoded import list.
#
# Why this exists (and why it is NOT verify-bundle.sh): verify-bundle.sh gates on
# a hand-maintained list of expected imports per bundle (Phase 3). That list has
# rotted -- e.g. it demands `import onnxruntime` for upscale-enhance, which that
# bundle neither ships nor needs (its tools use torch/realesrgan), so it FALSE-
# FAILS a bundle that works. A release gate must assert real behaviour, so this
# script drops the import list and checks that each bundle's tool produces
# correct output against a fixture.
#
# Usage: verify-model-bundle-runtime.sh <bundleId> <arch>
#   bundleId : background-removal, face-detection, object-eraser-colorize,
#              upscale-enhance, photo-restoration, transcription
#   arch     : amd64-gpu | arm64-cpu
#
# Expects (read-only mounts):
#   /bundles/<bundleId>-<arch>.tar.gz        + .tar.gz.sha256
#   /fixtures/                               (repo tests/fixtures)
#   /verify-model-bundle-runtime.sh          (this script)
#
# Runs with --entrypoint bash (no entrypoint bootstrap); installs into /opt/venv
# and runs on CPU (SNAPOTTER_GPU=0), mirroring verify-bundle.sh's proven Phase 1/2.
#
# Exit codes: 0=pass, 1=integrity, 3=oracle
# ──────────────────────────────────────────────────────────────────────────────

BUNDLE_ID="${1:?Usage: verify-model-bundle-runtime.sh <bundleId> <arch>}"
ARCH="${2:?Usage: verify-model-bundle-runtime.sh <bundleId> <arch>}"

ARCHIVE="/bundles/${BUNDLE_ID}-${ARCH}.tar.gz"
SHA_FILE="/bundles/${BUNDLE_ID}-${ARCH}.tar.gz.sha256"
STAGING="/tmp/vmbr-staging"
AI_SCRIPTS="/app/packages/ai/python"

VENV="/opt/venv"
PYTHON="${VENV}/bin/python3"
SITE_PACKAGES="$("${PYTHON}" -c 'import sysconfig; print(sysconfig.get_paths()["purelib"])')"

# Mirror the runtime model layout. The image already exports MODELS_PATH
# (=/data/ai/models); keep its value if present, otherwise fall back.
export MODELS_PATH="${MODELS_PATH:-/data/ai/models}"
export U2NET_HOME="${MODELS_PATH}/rembg"
export PYTHONPATH="${AI_SCRIPTS}"
export SNAPOTTER_GPU=0
export CUDA_VISIBLE_DEVICES=""

log()  { echo "=== $* ==="; }
pass() { echo -e "\033[32mPASS: $*\033[0m"; }
fail() { echo -e "\033[31mFAIL: $1\033[0m" >&2; exit "${2:-1}"; }
run_python() { "${PYTHON}" "$@"; }
# Run a bundle tool under a wall-clock cap. `timeout` needs a real executable, not
# a shell function, so this invokes the interpreter directly.
run_tool() { timeout "${TOOL_TIMEOUT}" "${PYTHON}" "$@"; }

# ── Phase 1: Integrity ──────────────────────────────────────────────────────
log "Phase 1: Integrity (${BUNDLE_ID}/${ARCH})"
[[ -f "${ARCHIVE}" ]]  || fail "Tarball not found: ${ARCHIVE}"
[[ -f "${SHA_FILE}" ]] || fail "SHA256 file not found: ${SHA_FILE}"
EXPECTED_SHA="$(awk '{print $1}' "${SHA_FILE}")"
ACTUAL_SHA="$(sha256sum "${ARCHIVE}" | awk '{print $1}')"
[[ "${EXPECTED_SHA}" == "${ACTUAL_SHA}" ]] || fail "SHA256 mismatch: expected=${EXPECTED_SHA} actual=${ACTUAL_SHA}"
pass "SHA256 checksum matches"

rm -rf "${STAGING}"; mkdir -p "${STAGING}"
tar -xzf "${ARCHIVE}" -C "${STAGING}"
[[ -f "${STAGING}/bundle.json" ]] || fail "bundle.json not found in archive"
run_python - "${STAGING}/bundle.json" "${BUNDLE_ID}" "${ARCH}" <<'PY' || fail "bundle.json invalid"
import json, sys
path, want_id, want_arch = sys.argv[1], sys.argv[2], sys.argv[3]
b = json.load(open(path))
for field in ("bundleId", "arch", "version", "models"):
    if field not in b:
        sys.exit(f"bundle.json missing field: {field}")
if b["bundleId"] != want_id or b["arch"] != want_arch:
    sys.exit(f"bundle.json identity mismatch: {b['bundleId']}/{b['arch']} != {want_id}/{want_arch}")
print(f"  bundleId={b['bundleId']} arch={b['arch']} version={b['version']} models={len(b['models'])}")
PY
pass "bundle.json valid"

# ── Phase 2: Install (into /opt/venv + models dir) ──────────────────────────
log "Phase 2: Install"
if [[ -d "${STAGING}/site-packages" ]]; then
  cp -a "${STAGING}/site-packages/." "${SITE_PACKAGES}/"
  pass "site-packages merged into ${SITE_PACKAGES}"
fi
mkdir -p "${MODELS_PATH}"
if [[ -d "${STAGING}/models" ]]; then
  cp -a "${STAGING}/models/." "${MODELS_PATH}/"
  pass "models copied to ${MODELS_PATH}"
fi
if [[ -d "${STAGING}/fixups" ]] && compgen -G "${STAGING}/fixups/*.whl" >/dev/null; then
  run_python -m pip install --no-index --no-cache-dir "${STAGING}/fixups"/*.whl
  pass "fixup wheels installed"
fi
rm -rf "${STAGING}"

# ── Phase 3: Runtime oracle (run the tool, assert real output) ──────────────
log "Phase 3: Runtime oracle"
TOOL_TIMEOUT="${VMBR_TOOL_TIMEOUT:-600}"

oracle_background_removal() {
  local in="/fixtures/image/valid/test-200x150.png" out="/tmp/vmbr-rembg.png"
  [[ -f "$in" ]] || fail "fixture missing: $in" 3
  run_tool "${AI_SCRIPTS}/remove_bg.py" "$in" "$out" || fail "remove_bg crashed" 3
  run_python - "$out" <<'PY' || fail "remove_bg oracle: output lacks transparency" 3
import sys
from PIL import Image
img = Image.open(sys.argv[1]).convert("RGBA")
alpha = img.getchannel("A")
lo, hi = alpha.getextrema()
transparent = sum(1 for p in alpha.getdata() if p < 255)
if lo >= 255 or transparent == 0:
    sys.exit(f"no transparent pixels (alpha extrema={lo},{hi})")
print(f"  remove_bg: {img.size} RGBA, {transparent} transparent px (alpha min={lo})")
PY
  pass "remove_bg produced a partially-transparent cutout"
}

oracle_face_detection() {
  # ABI/protobuf failures crash mediapipe on import/run; a working bundle returns
  # valid JSON. We assert the tool runs and reports a non-negative face count on a
  # portrait fixture (>=1 when the fixture has a detectable face).
  local in="/fixtures/image/valid/sample-photo.jpg" out="/tmp/vmbr-faces.png" jf="/tmp/vmbr-faces.json"
  [[ -f "$in" ]] || fail "fixture missing: $in" 3
  # Tool writes result JSON to stdout, progress to stderr. Capture stdout to a file
  # and read it via argv (piping into `python - <<EOF` fails: the heredoc is stdin).
  run_tool "${AI_SCRIPTS}/detect_faces.py" "$in" "$out" >"$jf" 2>/dev/null \
    || fail "detect_faces crashed (mediapipe/protobuf regression?)" 3
  run_python - "$jf" <<'PY' || fail "detect_faces oracle failed" 3
import json, sys
d = None
for line in open(sys.argv[1]):  # tolerate any progress lines before the result JSON
    line = line.strip()
    if line:
        try: d = json.loads(line)
        except Exception: pass
if d is None:
    sys.exit("no JSON in detect_faces output")
if d.get("success") is not True or not isinstance(d.get("facesDetected"), int) or d["facesDetected"] < 0:
    sys.exit(f"invalid detect_faces result: {d}")
print(f"  detect_faces: success, facesDetected={d['facesDetected']}")
PY
  pass "detect_faces ran and returned a valid result (mediapipe healthy)"
}

oracle_object_eraser_colorize() {
  # Grayscale in -> colour out. Assert mean saturation rises meaningfully.
  local in="/tmp/vmbr-gray.png" out="/tmp/vmbr-color.png"
  run_python - "$in" <<'PY'
import sys
from PIL import Image
Image.new("L", (128, 128), 128).save(sys.argv[1])
PY
  run_tool "${AI_SCRIPTS}/colorize.py" "$in" "$out" '{"model":"ddcolor"}' \
    || fail "colorize crashed" 3
  run_python - "$in" "$out" <<'PY' || fail "colorize oracle: output not colourised" 3
import sys
from PIL import Image
def sat(p):
    s = Image.open(p).convert("HSV").getchannel("S")
    return sum(s.getdata()) / (s.width * s.height)
si, so = sat(sys.argv[1]), sat(sys.argv[2])
if so <= si + 5:
    sys.exit(f"saturation did not rise: in={si:.1f} out={so:.1f}")
print(f"  colorize: mean saturation {si:.1f} -> {so:.1f}")
PY
  pass "colorize added colour to a grayscale input"
}

oracle_upscale_enhance() {
  local in="/fixtures/image/valid/test-100x100.jpg" out="/tmp/vmbr-upscale.png"
  [[ -f "$in" ]] || fail "fixture missing: $in" 3
  run_tool "${AI_SCRIPTS}/upscale.py" "$in" "$out" '{"scale":2}' \
    || fail "upscale crashed" 3
  run_python - "$in" "$out" <<'PY' || fail "upscale oracle: output not 2x" 3
import sys
from PIL import Image
i = Image.open(sys.argv[1]); o = Image.open(sys.argv[2])
if o.width != i.width * 2 or o.height != i.height * 2:
    sys.exit(f"expected 2x {i.size} got {o.size}")
print(f"  upscale: {i.size} -> {o.size}")
PY
  pass "upscale produced exact 2x output"
}

oracle_photo_restoration() {
  local in="/fixtures/image/valid/test-100x100.jpg" out="/tmp/vmbr-restore.png"
  [[ -f "$in" ]] || fail "fixture missing: $in" 3
  run_tool "${AI_SCRIPTS}/restore.py" "$in" "$out" \
    || fail "restore crashed" 3
  run_python - "$out" <<'PY' || fail "restore oracle: output missing/degenerate" 3
import sys
from PIL import Image, ImageStat
img = Image.open(sys.argv[1]).convert("RGB")
if img.width < 1 or img.height < 1:
    sys.exit("empty image")
mean = sum(ImageStat.Stat(img).mean) / 3
if mean < 2:  # not all-black
    sys.exit(f"output is (near) all-black: mean={mean:.2f}")
print(f"  restore: {img.size} valid, mean={mean:.1f}")
PY
  pass "restore produced a valid non-black image"
}

oracle_transcription() {
  local in="/fixtures/audio/valid/speech-10s.wav" jf="/tmp/vmbr-transcribe.json"
  [[ -f "$in" ]] || fail "fixture missing: $in" 3
  run_tool "${AI_SCRIPTS}/transcribe.py" "$in" >"$jf" 2>/dev/null \
    || fail "transcribe crashed" 3
  run_python - "$jf" <<'PY' || fail "transcribe oracle failed" 3
import json, sys
d = None
for line in open(sys.argv[1]):  # tolerate any progress lines before the result JSON
    line = line.strip()
    if line:
        try: d = json.loads(line)
        except Exception: pass
if d is None:
    sys.exit("no JSON in transcribe output")
if not d.get("success") or not d.get("segments"):
    sys.exit(f"transcription empty/failed: success={d.get('success')} segments={len(d.get('segments', []))}")
print(f"  transcribe: {len(d['segments'])} segment(s)")
PY
  pass "transcribe returned non-empty segments"
}

case "${BUNDLE_ID}" in
  background-removal)      oracle_background_removal ;;
  face-detection)         oracle_face_detection ;;
  object-eraser-colorize) oracle_object_eraser_colorize ;;
  upscale-enhance)        oracle_upscale_enhance ;;
  photo-restoration)      oracle_photo_restoration ;;
  transcription)          oracle_transcription ;;
  ocr)                    fail "OCR uses the signed v3 runtime pipeline (verify-ocr-runtime.sh), not this gate" 1 ;;
  *)                      fail "Unknown model bundle: ${BUNDLE_ID}" 1 ;;
esac

log "PASS: ${BUNDLE_ID} (${ARCH}) installs and runs correctly against the release image"
exit 0
