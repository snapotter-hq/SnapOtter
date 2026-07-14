#!/usr/bin/env bash
# seed-ai-models.sh -- Install real AI models into a running SnapOtter container.
# Designed for QA seeding: runs entirely via `docker exec`, idempotent, resumable.
# Usage: bash tests/qa/seed-ai-models.sh [container_name]

set -uo pipefail

CONTAINER="${1:-snapotter-qa}"
# IMPORTANT: Use "python3 -m pip" NOT the pip binary directly.
# The pip shebang points to /opt/venv/bin/python3 (the build-time venv),
# but the runtime venv is /data/ai/venv. Using python3 -m pip ensures
# packages land in the correct site-packages.
PYTHON="/data/ai/venv/bin/python3"
MODELS="/data/ai/models"
INSTALLED="/data/ai/installed.json"
VERSION="2.0.0"

# ── Helpers ──────────────────────────────────────────────────────────────

dexec()   { docker exec "$CONTAINER" "$@"; }
dpip()    { docker exec "$CONTAINER" "$PYTHON" -m pip "$@"; }
dpython() { docker exec "$CONTAINER" "$PYTHON" "$@"; }

log()  { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }
ok()   { printf '[%s] \033[32mOK\033[0m %s\n'   "$(date +%H:%M:%S)" "$*"; }
warn() { printf '[%s] \033[33mWARN\033[0m %s\n' "$(date +%H:%M:%S)" "$*"; }
fail() { printf '[%s] \033[31mFAIL\033[0m %s\n' "$(date +%H:%M:%S)" "$*"; }

declare -A BUNDLE_STATUS  # populated as we go

# Check a file exists in the container and meets a minimum size (0 = any).
file_ok() {
  local path="$1" min_size="${2:-0}"
  local size
  size=$(dexec stat -c '%s' "$path" 2>/dev/null) || return 1
  [[ "$size" -ge "$min_size" ]]
}

# Check a directory exists (non-empty) in the container.
dir_ok() {
  dexec test -d "$1" 2>/dev/null
}

# Install pip packages idempotently. Accepts flags BEFORE the package spec.
pip_install() {
  local flags=()
  while [[ "$1" == --* ]]; do flags+=("$1"); shift; done
  local pkg="$1"
  log "pip install ${flags[*]:-} $pkg"
  dpip install --cache-dir /data/ai/pip-cache "${flags[@]}" "$pkg" 2>&1
}

# Download a URL to a path inside the container (skip if already present).
curl_model() {
  local url="$1" dest="$2" min_size="${3:-0}"
  if file_ok "$dest" "$min_size"; then
    ok "Already present: $dest"
    return 0
  fi
  local dir
  dir=$(dirname "$dest")
  dexec mkdir -p "$dir"
  log "Downloading $(basename "$dest") ..."
  dexec curl -fSL --retry 3 --retry-delay 5 -o "$dest" "$url" 2>&1
}

# Download a single file from HuggingFace Hub (skip if already present).
hf_file() {
  local repo="$1" filename="$2" local_dir="$3" min_size="${4:-0}" repo_type="${5:-model}"
  local dest="$local_dir/$filename"
  if file_ok "$dest" "$min_size"; then
    ok "Already present: $dest"
    return 0
  fi
  log "HF download $repo / $filename -> $local_dir"
  dpython -c "
from huggingface_hub import hf_hub_download
hf_hub_download('$repo', '$filename', local_dir='$local_dir', repo_type='$repo_type')
print('Done')
" 2>&1
}

# Download a full HuggingFace repo snapshot (skip if dir already exists).
hf_snapshot() {
  local repo="$1" local_dir="$2"
  if dir_ok "$local_dir"; then
    ok "Already present: $local_dir"
    return 0
  fi
  log "HF snapshot $repo -> $local_dir"
  dpython -c "
from huggingface_hub import snapshot_download
snapshot_download('$repo', local_dir='$local_dir')
print('Done')
" 2>&1
}

# Write/update a bundle entry in installed.json.
mark_installed() {
  local bundle_id="$1"
  shift
  # Remaining args are model IDs
  local models_json="["
  local first=true
  for m in "$@"; do
    if $first; then first=false; else models_json+=","; fi
    models_json+="\"$m\""
  done
  models_json+="]"

  dpython -c "
import json, os
path = '$INSTALLED'
try:
    with open(path) as f:
        data = json.load(f)
except:
    data = {'bundles': {}}
from datetime import datetime, timezone
data['bundles']['$bundle_id'] = {
    'version': '$VERSION',
    'installedAt': datetime.now(timezone.utc).isoformat(),
    'models': $models_json
}
with open(path + '.tmp', 'w') as f:
    json.dump(data, f, indent=2)
os.rename(path + '.tmp', path)
print('Marked $bundle_id as installed')
" 2>&1
}


# ========================================================================
# 1. FACE-DETECTION  (~200-300 MB)
# ========================================================================
install_face_detection() {
  log "=== Bundle 1/7: face-detection ==="

  # --- pip packages ---
  pip_install "mediapipe>=0.10.18" || { fail "mediapipe pip failed"; BUNDLE_STATUS[face-detection]="FAILED: mediapipe pip install"; return 1; }

  # --- models ---
  curl_model \
    "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite" \
    "$MODELS/mediapipe/blaze_face_short_range.tflite" 100000 \
    || { fail "blaze_face download failed"; BUNDLE_STATUS[face-detection]="FAILED: model download"; return 1; }

  curl_model \
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task" \
    "$MODELS/mediapipe/face_landmarker.task" 1000000 \
    || { fail "face_landmarker download failed"; BUNDLE_STATUS[face-detection]="FAILED: model download"; return 1; }

  # --- verify ---
  if file_ok "$MODELS/mediapipe/blaze_face_short_range.tflite" 100000 && \
     file_ok "$MODELS/mediapipe/face_landmarker.task" 1000000; then
    mark_installed face-detection mediapipe-face-detector mediapipe-face-landmarker
    BUNDLE_STATUS[face-detection]="INSTALLED"
    ok "face-detection complete"
  else
    fail "face-detection verification failed"
    BUNDLE_STATUS[face-detection]="FAILED: verification"
    return 1
  fi
}


# ========================================================================
# 2. TRANSCRIPTION  (~600 MB)
# ========================================================================
install_transcription() {
  log "=== Bundle 2/7: transcription ==="

  # --- pip packages ---
  pip_install "huggingface-hub" || { fail "huggingface-hub pip failed"; BUNDLE_STATUS[transcription]="FAILED: pip"; return 1; }
  pip_install "faster-whisper>=1.0.0" || { fail "faster-whisper pip failed"; BUNDLE_STATUS[transcription]="FAILED: pip"; return 1; }

  # --- model (full repo snapshot) ---
  hf_snapshot "Systran/faster-whisper-small" "$MODELS/faster-whisper-small" \
    || { fail "faster-whisper-small download failed"; BUNDLE_STATUS[transcription]="FAILED: model download"; return 1; }

  # --- verify ---
  if dir_ok "$MODELS/faster-whisper-small"; then
    mark_installed transcription faster-whisper-small
    BUNDLE_STATUS[transcription]="INSTALLED"
    ok "transcription complete"
  else
    fail "transcription verification failed"
    BUNDLE_STATUS[transcription]="FAILED: verification"
    return 1
  fi
}


# ========================================================================
# 3. OBJECT-ERASER-COLORIZE  (~1-2 GB)
# ========================================================================
install_object_eraser_colorize() {
  log "=== Bundle 3/7: object-eraser-colorize ==="

  # --- pip packages (huggingface-hub already from transcription) ---
  pip_install "huggingface-hub" || true  # already installed, no-op
  pip_install "onnxruntime==1.20.1" || { fail "onnxruntime pip failed"; BUNDLE_STATUS[object-eraser-colorize]="FAILED: pip"; return 1; }

  # --- LaMa ONNX model ---
  hf_file "Carve/LaMa-ONNX" "lama_fp32.onnx" "$MODELS/lama" 100000000 \
    || { fail "lama download failed"; BUNDLE_STATUS[object-eraser-colorize]="FAILED: lama model"; return 1; }

  # --- DDColor ONNX model (from facefusion repo, single file) ---
  hf_file "facefusion/models-3.0.0" "ddcolor.onnx" "$MODELS/ddcolor" 50000000 \
    || { fail "ddcolor download failed"; BUNDLE_STATUS[object-eraser-colorize]="FAILED: ddcolor model"; return 1; }

  # --- OpenCV colorize prototxt ---
  curl_model \
    "https://raw.githubusercontent.com/richzhang/colorization/caffe/colorization/models/colorization_deploy_v2.prototxt" \
    "$MODELS/colorize-opencv/colorization_deploy_v2.prototxt" 0 \
    || { fail "prototxt download failed"; BUNDLE_STATUS[object-eraser-colorize]="FAILED: prototxt"; return 1; }

  # --- OpenCV colorize points (npy) ---
  curl_model \
    "https://raw.githubusercontent.com/richzhang/colorization/caffe/colorization/resources/pts_in_hull.npy" \
    "$MODELS/colorize-opencv/pts_in_hull.npy" 0 \
    || { fail "npy download failed"; BUNDLE_STATUS[object-eraser-colorize]="FAILED: npy"; return 1; }

  # --- OpenCV colorize caffemodel (from HF space) ---
  hf_file "BilalSardar/Black-N-White-To-Color" "colorization_release_v2.caffemodel" \
    "$MODELS/colorize-opencv" 100000000 "space" \
    || { fail "caffemodel download failed"; BUNDLE_STATUS[object-eraser-colorize]="FAILED: caffemodel"; return 1; }

  # --- verify ---
  local all_ok=true
  file_ok "$MODELS/lama/lama_fp32.onnx" 100000000             || all_ok=false
  file_ok "$MODELS/ddcolor/ddcolor.onnx" 50000000             || all_ok=false
  file_ok "$MODELS/colorize-opencv/colorization_deploy_v2.prototxt" 0 || all_ok=false
  file_ok "$MODELS/colorize-opencv/pts_in_hull.npy" 0         || all_ok=false
  file_ok "$MODELS/colorize-opencv/colorization_release_v2.caffemodel" 100000000 || all_ok=false

  if $all_ok; then
    mark_installed object-eraser-colorize \
      lama-onnx ddcolor-onnx opencv-colorize-prototxt opencv-colorize-caffemodel opencv-colorize-points
    BUNDLE_STATUS[object-eraser-colorize]="INSTALLED"
    ok "object-eraser-colorize complete"
  else
    fail "object-eraser-colorize verification failed"
    BUNDLE_STATUS[object-eraser-colorize]="FAILED: verification"
    return 1
  fi
}


# ========================================================================
# 4. BACKGROUND-REMOVAL  (~4-5 GB)
# ========================================================================
install_background_removal() {
  log "=== Bundle 4/7: background-removal ==="

  # --- pip packages ---
  pip_install "onnxruntime==1.20.1" || true  # likely already installed
  pip_install "mediapipe>=0.10.18"  || true  # likely already installed
  pip_install "rembg==2.0.62"       || { fail "rembg pip failed"; BUNDLE_STATUS[background-removal]="FAILED: pip rembg"; return 1; }

  # --- Standard rembg sessions (6 models) ---
  local STANDARD_SESSIONS=("u2net" "isnet-general-use" "bria-rmbg" "birefnet-general-lite" "birefnet-portrait" "birefnet-general")
  for sess in "${STANDARD_SESSIONS[@]}"; do
    if file_ok "$MODELS/rembg/${sess}.onnx" 0; then
      ok "Already present: rembg/$sess.onnx"
      continue
    fi
    log "Downloading rembg session: $sess"
    dexec env U2NET_HOME="$MODELS/rembg" "$PYTHON" -c "
import os
os.makedirs('$MODELS/rembg', exist_ok=True)
from rembg import new_session
sess = new_session('$sess')
print(f'Session $sess loaded OK')
" 2>&1 || { warn "rembg session $sess failed (non-fatal, continuing)"; }
  done

  # --- Custom sessions: birefnet-matting and birefnet-hr-matting ---
  # These use direct download URLs (from remove_bg.py custom classes).
  curl_model \
    "https://github.com/ZhengPeng7/BiRefNet/releases/download/v1/BiRefNet-matting-epoch_100.onnx" \
    "$MODELS/rembg/birefnet-matting.onnx" 0 \
    || warn "birefnet-matting download failed (non-fatal)"

  curl_model \
    "https://github.com/ZhengPeng7/BiRefNet/releases/download/v1/BiRefNet_HR-matting-epoch_135.onnx" \
    "$MODELS/rembg/birefnet-hr-matting.onnx" 0 \
    || warn "birefnet-hr-matting download failed (non-fatal)"

  # --- verify (check all 8) ---
  local all_ok=true
  for sess in "${STANDARD_SESSIONS[@]}" birefnet-matting birefnet-hr-matting; do
    file_ok "$MODELS/rembg/${sess}.onnx" 0 || { warn "Missing: rembg/$sess.onnx"; all_ok=false; }
  done

  if $all_ok; then
    mark_installed background-removal \
      rembg-u2net rembg-isnet-general-use rembg-bria-rmbg \
      rembg-birefnet-general-lite rembg-birefnet-portrait rembg-birefnet-general \
      rembg-birefnet-matting rembg-birefnet-hr-matting
    BUNDLE_STATUS[background-removal]="INSTALLED"
    ok "background-removal complete"
  else
    fail "background-removal verification failed (some sessions missing)"
    BUNDLE_STATUS[background-removal]="FAILED: missing rembg sessions"
    return 1
  fi
}


# ========================================================================
# 5. UPSCALE-ENHANCE  (~4-5 GB, heaviest, arm64 compile risk)
# ========================================================================
install_upscale_enhance() {
  log "=== Bundle 5/7: upscale-enhance ==="

  local pip_failed=""

  # --- pip packages (ordered for arm64 safety) ---
  pip_install "setuptools<75"           || true
  pip_install "einops"                  || true
  pip_install --no-deps "codeformer-pip==0.0.4" || { warn "codeformer-pip failed"; pip_failed+=" codeformer-pip"; }
  pip_install "lpips"                   || { warn "lpips failed"; pip_failed+=" lpips"; }

  # basicsr needs --no-build-isolation and can fail on arm64
  log "pip install basicsr==1.4.2 (may compile C extensions) ..."
  dpip install --cache-dir /data/ai/pip-cache --no-build-isolation "basicsr==1.4.2" 2>&1
  local basicsr_rc=$?
  if [[ $basicsr_rc -ne 0 ]]; then
    warn "basicsr==1.4.2 compile failed on arm64 (exit $basicsr_rc)"
    pip_failed+=" basicsr"
  fi

  # realesrgan depends on basicsr
  if [[ "$pip_failed" != *"basicsr"* ]]; then
    pip_install "realesrgan==0.3.0"     || { warn "realesrgan failed"; pip_failed+=" realesrgan"; }
  else
    warn "Skipping realesrgan (basicsr prerequisite failed)"
    pip_failed+=" realesrgan"
  fi

  pip_install "mediapipe>=0.10.18"      || true  # already installed

  # --- postInstall: force-reinstall numpy, re-pin Pillow and opencv ---
  log "Post-install: re-pinning numpy, Pillow, opencv"
  dpip install --cache-dir /data/ai/pip-cache --force-reinstall "numpy==1.26.4" 2>&1 || true
  dpip install --cache-dir /data/ai/pip-cache "Pillow==12.2.0" "opencv-python-headless==4.10.0.84" 2>&1 || true

  # --- Compat shim: basicsr 1.4.2 imports torchvision.transforms.functional_tensor ---
  # which was removed in torchvision 0.18+. Create a forwarding module.
  log "Creating torchvision.transforms.functional_tensor compatibility shim"
  dpython -c "
import torchvision.transforms as _t
import os
shim = os.path.join(_t.__path__[0], 'functional_tensor.py')
if not os.path.exists(shim):
    with open(shim, 'w') as f:
        f.write('from torchvision.transforms.functional import *\n')
    print('Shim created')
else:
    print('Shim already exists')
" 2>&1 || warn "Could not create torchvision shim (non-fatal)"

  if [[ -n "$pip_failed" ]]; then
    warn "Some pip packages failed:$pip_failed"
    warn "Continuing with model downloads (partially-working bundle)"
  fi

  # --- models ---
  curl_model \
    "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth" \
    "$MODELS/realesrgan/RealESRGAN_x4plus.pth" 60000000

  curl_model \
    "https://github.com/TencentARC/GFPGAN/releases/download/v1.3.0/GFPGANv1.3.pth" \
    "$MODELS/gfpgan/GFPGANv1.3.pth" 300000000

  curl_model \
    "https://github.com/sczhou/CodeFormer/releases/download/v0.1.0/codeformer.pth" \
    "$MODELS/codeformer/codeformer.pth" 350000000

  hf_file "facefusion/models-3.0.0" "codeformer.onnx" "$MODELS/codeformer" 100000000

  curl_model \
    "https://github.com/xinntao/facexlib/releases/download/v0.1.0/detection_Resnet50_Final.pth" \
    "$MODELS/gfpgan/facelib/detection_Resnet50_Final.pth" 100000000

  curl_model \
    "https://github.com/xinntao/facexlib/releases/download/v0.2.2/parsing_parsenet.pth" \
    "$MODELS/gfpgan/facelib/parsing_parsenet.pth" 80000000

  curl_model \
    "https://github.com/cszn/KAIR/releases/download/v1.0/scunet_color_real_psnr.pth" \
    "$MODELS/scunet/scunet_color_real_psnr.pth" 3000000

  hf_file "mikestealth/nafnet-models" "NAFNet-SIDD-width64.pth" "$MODELS/nafnet" 60000000

  # --- verify models ---
  local models_ok=true
  file_ok "$MODELS/realesrgan/RealESRGAN_x4plus.pth" 60000000            || models_ok=false
  file_ok "$MODELS/gfpgan/GFPGANv1.3.pth" 300000000                      || models_ok=false
  file_ok "$MODELS/codeformer/codeformer.pth" 350000000                   || models_ok=false
  file_ok "$MODELS/codeformer/codeformer.onnx" 100000000                  || models_ok=false
  file_ok "$MODELS/gfpgan/facelib/detection_Resnet50_Final.pth" 100000000 || models_ok=false
  file_ok "$MODELS/gfpgan/facelib/parsing_parsenet.pth" 80000000          || models_ok=false
  file_ok "$MODELS/scunet/scunet_color_real_psnr.pth" 3000000             || models_ok=false
  file_ok "$MODELS/nafnet/NAFNet-SIDD-width64.pth" 60000000               || models_ok=false

  if $models_ok; then
    if [[ -n "$pip_failed" ]]; then
      mark_installed upscale-enhance \
        realesrgan-x4plus gfpgan-v1.3 codeformer-pth codeformer-onnx \
        facexlib-detection facexlib-parsing scunet-color-real nafnet-sidd
      BUNDLE_STATUS[upscale-enhance]="INSTALLED (pip failures:$pip_failed -- models OK, tools may fail at import)"
      warn "upscale-enhance: models present but pip packages incomplete"
    else
      mark_installed upscale-enhance \
        realesrgan-x4plus gfpgan-v1.3 codeformer-pth codeformer-onnx \
        facexlib-detection facexlib-parsing scunet-color-real nafnet-sidd
      BUNDLE_STATUS[upscale-enhance]="INSTALLED"
      ok "upscale-enhance complete"
    fi
  else
    fail "upscale-enhance model verification failed"
    BUNDLE_STATUS[upscale-enhance]="FAILED: model files missing"
    return 1
  fi
}


# ========================================================================
# 6. PHOTO-RESTORATION  (mostly overlaps with #3 + #5)
# ========================================================================
install_photo_restoration() {
  log "=== Bundle 6/7: photo-restoration ==="

  # --- pip packages (all should be installed from previous bundles) ---
  pip_install "onnxruntime==1.20.1"     || true
  pip_install "mediapipe>=0.10.18"      || true
  pip_install "huggingface-hub"         || true
  pip_install "setuptools<75"           || true
  pip_install --no-deps "codeformer-pip==0.0.4" || true
  # lpips, basicsr, realesrgan: attempt but don't block on failure
  pip_install "lpips"                   || true
  pip_install --no-build-isolation "basicsr==1.4.2" || true
  pip_install "realesrgan==0.3.0"       || true

  # Re-pin numpy after any installs
  dpip install --cache-dir /data/ai/pip-cache --force-reinstall "numpy==1.26.4" 2>&1 || true

  # --- models (most overlap with previous bundles) ---
  # lama (shared with object-eraser-colorize)
  hf_file "Carve/LaMa-ONNX" "lama_fp32.onnx" "$MODELS/lama" 100000000 || true

  # codeformer.onnx (shared with upscale-enhance)
  hf_file "facefusion/models-3.0.0" "codeformer.onnx" "$MODELS/codeformer" 100000000 || true

  # realesrgan (shared with upscale-enhance)
  curl_model \
    "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth" \
    "$MODELS/realesrgan/RealESRGAN_x4plus.pth" 60000000 || true

  # facexlib (shared with upscale-enhance)
  curl_model \
    "https://github.com/xinntao/facexlib/releases/download/v0.1.0/detection_Resnet50_Final.pth" \
    "$MODELS/gfpgan/facelib/detection_Resnet50_Final.pth" 100000000 || true
  curl_model \
    "https://github.com/xinntao/facexlib/releases/download/v0.2.2/parsing_parsenet.pth" \
    "$MODELS/gfpgan/facelib/parsing_parsenet.pth" 80000000 || true

  # mediapipe (shared with face-detection)
  curl_model \
    "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite" \
    "$MODELS/mediapipe/blaze_face_short_range.tflite" 100000 || true
  curl_model \
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task" \
    "$MODELS/mediapipe/face_landmarker.task" 1000000 || true

  # scunet (shared with upscale-enhance)
  curl_model \
    "https://github.com/cszn/KAIR/releases/download/v1.0/scunet_color_real_psnr.pth" \
    "$MODELS/scunet/scunet_color_real_psnr.pth" 3000000 || true

  # --- verify ---
  local all_ok=true
  file_ok "$MODELS/lama/lama_fp32.onnx" 100000000                        || all_ok=false
  file_ok "$MODELS/codeformer/codeformer.onnx" 100000000                  || all_ok=false
  file_ok "$MODELS/realesrgan/RealESRGAN_x4plus.pth" 60000000            || all_ok=false
  file_ok "$MODELS/gfpgan/facelib/detection_Resnet50_Final.pth" 100000000 || all_ok=false
  file_ok "$MODELS/gfpgan/facelib/parsing_parsenet.pth" 80000000          || all_ok=false
  file_ok "$MODELS/mediapipe/blaze_face_short_range.tflite" 100000        || all_ok=false
  file_ok "$MODELS/mediapipe/face_landmarker.task" 1000000                || all_ok=false
  file_ok "$MODELS/scunet/scunet_color_real_psnr.pth" 3000000             || all_ok=false

  if $all_ok; then
    mark_installed photo-restoration \
      lama-onnx codeformer-onnx realesrgan-x4plus \
      facexlib-detection facexlib-parsing \
      mediapipe-face-detector mediapipe-face-landmarker \
      scunet-color-real
    BUNDLE_STATUS[photo-restoration]="INSTALLED"
    ok "photo-restoration complete"
  else
    fail "photo-restoration verification failed"
    BUNDLE_STATUS[photo-restoration]="FAILED: verification"
    return 1
  fi
}


# ========================================================================
# 7. OCR (Fast is built in; the signed accurate pack is application-managed)
# ========================================================================
install_ocr() {
  log "=== Bundle 7/7: ocr ==="

  if ! dexec command -v tesseract >/dev/null 2>&1; then
    fail "built-in Tesseract is missing from the container"
    BUNDLE_STATUS[ocr]="FAILED: built-in Tesseract missing"
    return 1
  fi

  # Do not recreate the old pip/model seeding path here. Balanced and Best are
  # an immutable, signed runtime with architecture-specific native wheels. They
  # must be installed through POST /api/v1/admin/features/ocr/install (or the AI
  # Features UI) so signature, disk, transaction, compatibility, and rollback
  # checks cannot be bypassed by QA tooling.
  BUNDLE_STATUS[ocr]="FAST BUILT IN; ACCURATE PACK APPLICATION-MANAGED"
  ok "ocr Fast tier is available; use the feature API to test the accurate pack"
}


# ========================================================================
# Main
# ========================================================================

main() {
  log "Seeding AI models into container: $CONTAINER"
  log "Architecture: $(dexec uname -m)"
  log "Python: $(dpython --version 2>&1)"
  echo

  # Remove stale install lock if present
  dexec rm -f /data/ai/install.lock 2>/dev/null || true

  # Ensure models directory
  dexec mkdir -p "$MODELS" "$MODELS/rembg" "$MODELS/mediapipe" 2>/dev/null || true

  # Run bundles smallest-first
  install_face_detection        || true
  echo
  install_transcription         || true
  echo
  install_object_eraser_colorize || true
  echo
  install_background_removal    || true
  echo
  install_upscale_enhance       || true
  echo
  install_photo_restoration     || true
  echo
  install_ocr                   || true
  echo

  # -- Summary --
  log "========================================"
  log "SEED COMPLETE -- Per-bundle results:"
  log "========================================"
  for b in face-detection transcription object-eraser-colorize background-removal \
           upscale-enhance photo-restoration ocr; do
    local status="${BUNDLE_STATUS[$b]:-NOT RUN}"
    if [[ "$status" == INSTALLED* || "$status" == "FAST BUILT IN;"* ]]; then
      ok "$b: $status"
    else
      fail "$b: $status"
    fi
  done

  echo
  log "Models directory:"
  dexec du -sh "$MODELS" 2>/dev/null || true
  dexec du -sh "$MODELS"/* 2>/dev/null || true

  echo
  log "installed.json:"
  dexec cat "$INSTALLED" 2>/dev/null || warn "No installed.json"

  echo
  log "Total /data disk usage:"
  dexec du -sh /data 2>/dev/null || true
}

main
