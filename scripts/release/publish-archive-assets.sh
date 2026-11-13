#!/usr/bin/env bash
# The "Publish verified immutable archive assets" step of the archive-security job in .github/workflows/release.yml.
# A run step without a shell runs as `bash -e`, so this keeps -e and nothing more.
# archive_name comes from $GITHUB_ENV, written by "Verify checksum and safely extract archive".
# shellcheck disable=SC2154
set -e

REPOSITORY="snapotter-hq/SnapOtter"
# By id, not by tag: /releases/tags/{tag} 404s while the release is a draft.
release_id="$(
  gh release view "v${VERSION}" --repo "${REPOSITORY}" \
    --json databaseId --jq .databaseId
)"
[[ "${release_id}" =~ ^[0-9]+$ ]] || {
  echo "::error::GitHub release did not resolve to one immutable ID"
  exit 1
}
asset_list="$(mktemp)"
trap 'rm -f "${asset_list}" /tmp/existing-release-asset-*' EXIT

refresh_assets() {
  gh api --paginate \
    "repos/${REPOSITORY}/releases/${release_id}/assets?per_page=100" \
    > "${asset_list}"
}

matching_asset_ids() {
  local asset_name="$1"
  jq -r --arg name "${asset_name}" \
    '.[] | select(.name == $name) | .id' "${asset_list}"
}

compare_asset() {
  local asset_id="$1"
  local asset_path="$2"
  local asset_name
  local downloaded
  asset_name="$(basename "${asset_path}")"
  downloaded="/tmp/existing-release-asset-${asset_id}"
  gh api \
    -H "Accept: application/octet-stream" \
    "repos/${REPOSITORY}/releases/assets/${asset_id}" \
    > "${downloaded}"
  cmp --silent "${asset_path}" "${downloaded}" || {
    echo "::error::Existing immutable release asset differs: ${asset_name}"
    exit 1
  }
  rm -f "${downloaded}"
}

verify_or_upload_asset() {
  local asset_path="$1"
  local asset_name
  local asset_ids
  asset_name="$(basename "${asset_path}")"
  refresh_assets
  mapfile -t asset_ids < <(matching_asset_ids "${asset_name}")
  [[ ${#asset_ids[@]} -le 1 ]] || {
    echo "::error::Immutable release asset name collides: ${asset_name}"
    exit 1
  }
  if [[ ${#asset_ids[@]} -eq 1 ]]; then
    compare_asset "${asset_ids[0]}" "${asset_path}"
    echo "Verified existing immutable release asset: ${asset_name}"
    return
  fi
  gh release upload "v${VERSION}" "${asset_path}" --repo "${REPOSITORY}"
}

assets=(
  "/tmp/prebuilt/${archive_name}"
  "/tmp/prebuilt/${archive_name}.sha256"
  "snapotter-v${VERSION}-archive-linux-${ARCH}-sbom.cdx.json"
  "snapotter-v${VERSION}-archive-linux-${ARCH}-sbom.spdx.json"
  "snapotter-v${VERSION}-archive-linux-${ARCH}-trivy.json"
)
for asset_path in "${assets[@]}"; do
  verify_or_upload_asset "${asset_path}"
done
for asset_path in "${assets[@]}"; do
  asset_name="$(basename "${asset_path}")"
  refresh_assets
  mapfile -t asset_ids < <(matching_asset_ids "${asset_name}")
  [[ ${#asset_ids[@]} -eq 1 ]] || {
    echo "::error::Expected exactly one immutable release asset after upload: ${asset_name}"
    exit 1
  }
  compare_asset "${asset_ids[0]}" "${asset_path}"
done
