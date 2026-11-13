#!/usr/bin/env bash
set -e
set -euo pipefail
manifest=docker/feature-manifest.json
bundle_repo="$(jq -r '.bundleRepo // "deepsafe/feature-bundles"' "$manifest")"
# Explicit list: the verifier has an oracle per bundle. ocr is excluded.
bundles=(background-removal face-detection object-eraser-colorize upscale-enhance photo-restoration transcription inpaint-hq)
for bundle in "${bundles[@]}"; do
  jq -e --arg b "$bundle" '.bundles[$b]' "$manifest" >/dev/null || { echo "::error::${bundle} missing from manifest"; exit 1; }
done
mkdir -p /tmp/mb
for bundle in "${bundles[@]}"; do
  echo "::group::verify ${bundle} (${ARCH})"
  started=${SECONDS}
  file="$(jq -r --arg b "$bundle" --arg a "$ARCH" '.bundles[$b].archives[$a].file' "$manifest")"
  sha="$(jq -r --arg b "$bundle" --arg a "$ARCH" '.bundles[$b].archives[$a].sha256' "$manifest")"
  [[ "$file" != "null" && "$sha" =~ ^[a-f0-9]{64}$ ]] || { echo "::error::missing ${ARCH} archive for ${bundle}"; exit 1; }
  tar="/tmp/mb/${bundle}-${ARCH}.tar.gz"
  curl --fail --location --show-error --silent --proto '=https' --tlsv1.2 --retry 3 \
    -o "$tar" "https://huggingface.co/${bundle_repo}/resolve/main/${file}"
  echo "${sha}  ${tar}" | sha256sum --check --strict -
  printf '%s\n' "$sha" > "${tar}.sha256"
  docker run --rm --network none --entrypoint bash \
    -v "$PWD/docker/verify-model-bundle-runtime.sh:/verify-model-bundle-runtime.sh:ro" \
    -v "/tmp/mb:/bundles:ro" \
    -v "$PWD/tests/fixtures:/fixtures:ro" \
    "${SNAPOTTER_BUNDLE_IMAGE}" \
    /verify-model-bundle-runtime.sh "${bundle}" "${ARCH}"
  rm -f "$tar" "${tar}.sha256"
  echo "${bundle} (${ARCH}): $((SECONDS - started))s, disk after:"
  df -h /
  echo "::endgroup::"
done
echo "All ${#bundles[@]} model bundles ran correctly against the release image for ${ARCH}"
