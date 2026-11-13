#!/usr/bin/env bash
set -e
RUNNER_UID="$(id -u)"
RUNNER_GID="$(id -g)"
rm -rf /tmp/ocr-quality
install -d -m 1777 /tmp/ocr-quality
docker run --rm --network none --memory 3g --memory-swap 3g \
  -v "$PWD/docker/verify-ocr-runtime.sh:/verify-ocr-runtime.sh:ro" \
  -v "$PWD/packages/ai/python/install_runtime.py:/app/packages/ai/python/install_runtime.py:ro" \
  -v "/tmp/bundles:/bundles:ro" \
  -e EMBEDDED=0 \
  -e PUID="${RUNNER_UID}" \
  -e PGID="${RUNNER_GID}" \
  -e CUDA_VISIBLE_DEVICES \
  -e NVIDIA_VISIBLE_DEVICES \
  "${SNAPOTTER_BUNDLE_IMAGE}" \
  /verify-ocr-runtime.sh "${TARGET}" memory-preflight
docker run --rm --network none --memory 4g --memory-swap 4g \
  --user 20001:0 \
  -v "$PWD/docker/verify-ocr-runtime.sh:/verify-ocr-runtime.sh:ro" \
  -v "$PWD/packages/ai/python/install_runtime.py:/app/packages/ai/python/install_runtime.py:ro" \
  -v "/tmp/bundles:/bundles:ro" \
  -e EMBEDDED=0 \
  -e CUDA_VISIBLE_DEVICES \
  -e NVIDIA_VISIBLE_DEVICES \
  "${SNAPOTTER_BUNDLE_IMAGE}" \
  /verify-ocr-runtime.sh "${TARGET}" install-smoke
docker run --rm --network none --memory 4g --memory-swap 4g \
  -v "$PWD/docker/verify-ocr-runtime.sh:/verify-ocr-runtime.sh:ro" \
  -v "$PWD/packages/ai/python/install_runtime.py:/app/packages/ai/python/install_runtime.py:ro" \
  -v "$PWD/tests/fixtures:/fixtures:ro" \
  -v "/tmp/bundles:/bundles:ro" \
  -v "/tmp/ocr-quality:/reports" \
  -e EMBEDDED=0 \
  -e PUID="${RUNNER_UID}" \
  -e PGID="${RUNNER_GID}" \
  -e CUDA_VISIBLE_DEVICES \
  -e NVIDIA_VISIBLE_DEVICES \
  -e OCR_VERIFY_ENVIRONMENT=native-cpu \
  -e OCR_VERIFY_REPORT_DIR=/reports \
  "${SNAPOTTER_BUNDLE_IMAGE}" \
  /verify-ocr-runtime.sh "${TARGET}" full
chmod 0755 /tmp/ocr-quality
test -r "/tmp/ocr-quality/ocr-${TARGET}-native-cpu.quality.json"
