#!/usr/bin/env bash
# The "Export digest" step of the docker job in .github/workflows/release.yml.
# A run step without a shell runs as `bash -e`, so this keeps -e and nothing more.
set -e

mkdir -p /tmp/digests /tmp/release-digests
digest="${EXISTING_DIGEST:-${BUILT_DIGEST}}"
[[ "${digest}" =~ ^sha256:[a-f0-9]{64}$ ]] || {
  echo "::error::Release image did not produce a valid digest"
  exit 1
}
registry_index=0
architecture="${PLATFORM_PAIR#linux-}"
expected_source="https://github.com/${GITHUB_REPOSITORY}"
for reference in \
  ghcr.io/snapotter-hq/snapotter \
  snapotter/snapotter; do
  manifest="/tmp/exported-release-manifest-${registry_index}.json"
  docker buildx imagetools inspect "${reference}@${digest}" --raw > "${manifest}"
  actual_digest="sha256:$(sha256sum "${manifest}" | cut -d ' ' -f 1)"
  [[ "${actual_digest}" == "${digest}" ]] || {
    echo "::error::Registry returned different bytes for ${reference}@${digest}"
    exit 1
  }
  docker buildx imagetools inspect "${reference}@${digest}" \
    --format '{{json .Image}}' > "${manifest}.image"
  jq -e --arg architecture "${architecture}" \
    '.os == "linux" and .architecture == $architecture' \
    "${manifest}.image" >/dev/null || {
      echo "::error::Registry digest has the wrong platform: ${reference}@${digest}"
      exit 1
    }
  jq -e \
    --arg release_commit "${RELEASE_COMMIT}" \
    --arg expected_source "${expected_source}" \
    --arg version "${VERSION}" \
    '(.config.Labels | type == "object")
      and .config.Labels["org.opencontainers.image.revision"] == $release_commit
      and .config.Labels["org.opencontainers.image.source"] == $expected_source
      and .config.Labels["org.opencontainers.image.version"] == $version' \
    "${manifest}.image" >/dev/null || {
      echo "::error::Release image has invalid source provenance: ${reference}@${digest}"
      exit 1
    }
  registry_index=$((registry_index + 1))
done
touch "/tmp/digests/${digest#sha256:}"
printf '%s\n' "${digest}" \
  > "/tmp/release-digests/snapotter-v${VERSION}-${PLATFORM_PAIR}.digest"
