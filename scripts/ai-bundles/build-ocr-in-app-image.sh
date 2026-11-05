#!/usr/bin/env bash
set -e
rm -rf /tmp/bundles
mkdir -p /tmp/bundles/primary /tmp/bundles/rebuild
[[ "${WORKFLOW_COMMIT}" =~ ^[a-f0-9]{40}$ ]] || {
  echo "::error::Reusable workflow revision is not an immutable commit"
  exit 1
}
for build in primary rebuild; do
  docker run --rm --entrypoint bash \
    -v "$PWD/docker/build-bundle.sh:/build-bundle.sh:ro" \
    -v "$PWD/docker/build-ocr-runtime.sh:/build-ocr-runtime.sh:ro" \
    -v "$PWD/docker/ocr-runtime-models.json:/ocr-runtime-models.json:ro" \
    -v "$PWD/docker/ocr-runtime-requirements-amd64.txt:/ocr-runtime-requirements-amd64.txt:ro" \
    -v "$PWD/docker/ocr-runtime-requirements-arm64.txt:/ocr-runtime-requirements-arm64.txt:ro" \
    -v "$PWD/docker/ocr-best-v1-calibration.json:/app/docker/ocr-best-v1-calibration.json:ro" \
    -v "$PWD/docker/feature-manifest.json:/app/docker/feature-manifest.json:ro" \
    -v "/tmp/bundles/${build}:/output" \
    -e SNAPOTTER_VERSION="${VERSION}" \
    -e SNAPOTTER_OCR_SOURCE_IMAGE_DIGEST="${SNAPOTTER_BUNDLE_IMAGE_DIGEST}" \
    -e SNAPOTTER_OCR_SOURCE_COMMIT="${RELEASE_COMMIT}" \
    -e SNAPOTTER_OCR_BUILDER_ID="github-actions:.github/workflows/ai-bundles.yml@${WORKFLOW_COMMIT}" \
    "${SNAPOTTER_BUNDLE_IMAGE}" \
    /build-bundle.sh ocr "${TARGET}" /output
done
for suffix in tar.gz tar.gz.sha256 artifact.json index-input.json; do
  test -s "/tmp/bundles/primary/ocr-${TARGET}.${suffix}"
  test -s "/tmp/bundles/rebuild/ocr-${TARGET}.${suffix}"
  cmp --silent "/tmp/bundles/primary/ocr-${TARGET}.${suffix}" \
    "/tmp/bundles/rebuild/ocr-${TARGET}.${suffix}" || {
      echo "::error::OCR runtime rebuild is not byte-reproducible: ${suffix}"
      exit 1
    }
done
