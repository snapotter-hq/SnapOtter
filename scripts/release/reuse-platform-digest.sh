#!/usr/bin/env bash
# The "Reuse an existing published platform digest" step of the docker job in .github/workflows/release.yml.
# A run step without a shell runs as `bash -e`, so this keeps -e and nothing more.
set -e

ghcr_ref="ghcr.io/snapotter-hq/snapotter"
dockerhub_ref="snapotter/snapotter"
architecture="${PLATFORM#linux/}"
expected_source="https://github.com/${GITHUB_REPOSITORY}"

registry_digest_state() {
  local reference="$1"
  local digest="$2"
  local label="$3"
  local manifest="/tmp/${label}-release-platform-manifest.json"
  local error="/tmp/${label}-release-platform-manifest.error"
  if docker buildx imagetools inspect "${reference}@${digest}" --raw \
    > "${manifest}" 2> "${error}"; then
    local actual_digest
    actual_digest="sha256:$(sha256sum "${manifest}" | cut -d ' ' -f 1)"
    if [[ "${actual_digest}" != "${digest}" ]]; then
      echo "::error::Registry returned different bytes for ${reference}@${digest}"
      return 2
    fi
    if ! docker buildx imagetools inspect "${reference}@${digest}" \
      --format '{{json .Image}}' > "${manifest}.image" 2> "${error}"; then
      cat "${error}" >&2
      echo "::error::Could not inspect image configuration for ${reference}@${digest}"
      return 2
    fi
    if ! jq -e --arg architecture "${architecture}" \
      '.os == "linux" and .architecture == $architecture' \
      "${manifest}.image" >/dev/null; then
      echo "::error::Registry digest has the wrong platform: ${reference}@${digest}"
      return 2
    fi
    if ! jq -e \
      --arg release_commit "${RELEASE_COMMIT}" \
      --arg expected_source "${expected_source}" \
      --arg version "${VERSION}" \
      '(.config.Labels | type == "object")
        and .config.Labels["org.opencontainers.image.revision"] == $release_commit
        and .config.Labels["org.opencontainers.image.source"] == $expected_source
        and .config.Labels["org.opencontainers.image.version"] == $version' \
      "${manifest}.image" >/dev/null; then
      echo "::warning::Registry digest does not bind the exact release provenance: ${reference}@${digest}"
      return 3
    fi
    return 0
  fi
  if grep -Eqi 'manifest unknown|name unknown|not found' "${error}"; then
    return 1
  fi
  cat "${error}" >&2
  echo "::error::Could not inspect ${reference}@${digest}"
  return 2
}

repair_digest_replica() {
  local source="$1"
  local destination="$2"
  local digest="$3"
  local destination_label="$4"
  docker buildx imagetools create --prefer-index=false \
    --tag "${destination}@${digest}" "${source}@${digest}"
  if registry_digest_state "${destination}" "${digest}" "${destination_label}"; then
    echo "Repaired exact ${digest} replica in ${destination}."
    return 0
  fi
  echo "::error::Failed to repair exact ${digest} replica in ${destination}"
  return 2
}

ensure_digest_replication() {
  local digest="$1"
  local ghcr_status dockerhub_status
  if registry_digest_state "${ghcr_ref}" "${digest}" ghcr; then
    ghcr_status=0
  else
    ghcr_status=$?
  fi
  if registry_digest_state "${dockerhub_ref}" "${digest}" dockerhub; then
    dockerhub_status=0
  else
    dockerhub_status=$?
  fi
  if (( ghcr_status == 2 || dockerhub_status == 2 )); then
    return 2
  fi
  if (( ghcr_status == 3 || dockerhub_status == 3 )); then
    return 3
  fi
  if (( ghcr_status == 1 && dockerhub_status == 1 )); then
    echo "::warning::Release digest is unavailable in both registries: ${digest}"
    return 1
  fi
  if (( ghcr_status == 1 )); then
    repair_digest_replica "${dockerhub_ref}" "${ghcr_ref}" "${digest}" ghcr \
      || return $?
  elif (( dockerhub_status == 1 )); then
    repair_digest_replica "${ghcr_ref}" "${dockerhub_ref}" "${digest}" dockerhub \
      || return $?
  fi
  return 0
}

image="${ghcr_ref}:${VERSION}"
digest=""
reuse_description=""
if docker buildx imagetools inspect "${image}" --raw \
  > /tmp/existing-release-manifest.json 2> /tmp/existing-release-manifest.error; then
  jq -e '.manifests | type == "array"' /tmp/existing-release-manifest.json >/dev/null || {
    echo "::error::Existing ${image} is not a multi-platform image index"
    exit 1
  }
  mapfile -t platform_digests < <(
    jq -r --arg architecture "${architecture}" \
      '.manifests[] | select(.platform.os == "linux" and .platform.architecture == $architecture) | .digest' \
      /tmp/existing-release-manifest.json
  )
  [[ ${#platform_digests[@]} -eq 1 ]] || {
    echo "::error::Existing ${image} does not contain exactly one ${PLATFORM} manifest"
    exit 1
  }
  digest="${platform_digests[0]}"
  reuse_description="${image} ${PLATFORM}"
else
  if ! grep -Eqi 'manifest unknown|name unknown|not found' \
    /tmp/existing-release-manifest.error; then
    cat /tmp/existing-release-manifest.error >&2
    echo "::error::Could not determine whether ${image} already exists"
    exit 1
  fi
  asset_name="snapotter-v${VERSION}-${PLATFORM_PAIR}.digest"
  # By id, not by tag: /releases/tags/{tag} 404s while the release is a draft.
  reuse_release_id="$(
    gh release view "v${VERSION}" --repo "${GITHUB_REPOSITORY}" \
      --json databaseId --jq .databaseId 2>/dev/null || true
  )"
  if [[ ! "${reuse_release_id}" =~ ^[0-9]+$ ]]; then
    echo "::warning::Could not resolve the release id; rebuilding ${PLATFORM}"
    echo "reused=false" >> "$GITHUB_OUTPUT"
    exit 0
  fi
  if ! gh api "repos/${GITHUB_REPOSITORY}/releases/${reuse_release_id}" \
    --jq ".assets[] | select(.name == \"${asset_name}\") | .id" \
    > /tmp/existing-platform-asset-ids 2> /tmp/existing-platform-asset.error; then
    echo "::warning::Could not read ${asset_name}; rebuilding ${PLATFORM}"
    echo "reused=false" >> "$GITHUB_OUTPUT"
    exit 0
  fi
  mapfile -t asset_ids < /tmp/existing-platform-asset-ids
  [[ ${#asset_ids[@]} -le 1 ]] || {
    echo "::error::GitHub release contains duplicate ${asset_name} checkpoints"
    exit 1
  }
  if [[ ${#asset_ids[@]} -eq 0 ]]; then
    echo "reused=false" >> "$GITHUB_OUTPUT"
    echo "No published ${image} manifest or ${asset_name} checkpoint exists; building ${PLATFORM}."
    exit 0
  fi
  if ! gh api -H "Accept: application/octet-stream" \
    "repos/${GITHUB_REPOSITORY}/releases/assets/${asset_ids[0]}" \
    > "/tmp/${asset_name}"; then
    echo "::warning::Could not download ${asset_name}; rebuilding ${PLATFORM}"
    echo "reused=false" >> "$GITHUB_OUTPUT"
    exit 0
  fi
  checkpoint="/tmp/${asset_name}"
  digest="$(<"${checkpoint}")"
  if [[ "$(wc -c < "${checkpoint}")" -ne 72 ]] \
    || [[ "$(wc -l < "${checkpoint}")" -ne 1 ]] \
    || [[ ! "${digest}" =~ ^sha256:[a-f0-9]{64}$ ]]; then
    echo "::warning::Ignoring unreadable ${asset_name}; rebuilding ${PLATFORM}"
    echo "reused=false" >> "$GITHUB_OUTPUT"
    exit 0
  fi
  reuse_description="immutable ${asset_name} checkpoint"
fi
[[ "${digest}" =~ ^sha256:[a-f0-9]{64}$ ]] || {
  echo "::error::Existing release contains an invalid ${PLATFORM} digest"
  exit 1
}
if ensure_digest_replication "${digest}"; then
  echo "digest=${digest}" >> "$GITHUB_OUTPUT"
  echo "reused=true" >> "$GITHUB_OUTPUT"
  echo "Reusing ${reuse_description} at ${digest}."
  exit 0
else
  replication_status=$?
fi
if (( replication_status == 1 )); then
  echo "::warning::No trustworthy registry source remains for ${digest}; rebuilding ${PLATFORM}"
  echo "reused=false" >> "$GITHUB_OUTPUT"
  exit 0
fi
if (( replication_status == 3 )); then
  echo "::warning::Existing digest is not from release ${RELEASE_COMMIT}; rebuilding ${PLATFORM}"
  echo "reused=false" >> "$GITHUB_OUTPUT"
  exit 0
fi
exit "${replication_status}"
