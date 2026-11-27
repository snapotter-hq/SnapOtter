#!/usr/bin/env bash
# The "Persist immutable platform digest on the GitHub release" step of the docker job in .github/workflows/release.yml.
# A run step without a shell runs as `bash -e`, so this keeps -e and nothing more.
set -e

# Scratch files go in the job's own temp dir (#5155, see reuse-platform-digest.sh).
scratch="${RUNNER_TEMP:-/tmp}"

asset_name="snapotter-v${VERSION}-${PLATFORM_PAIR}.digest"
# By id, not by tag: /releases/tags/{tag} 404s while the release is a draft.
persist_release_id="$(
  gh release view "v${VERSION}" --repo "${GITHUB_REPOSITORY}" \
    --json databaseId --jq .databaseId
)"
[[ "${persist_release_id}" =~ ^[0-9]+$ ]] || {
  echo "::error::GitHub release did not resolve to one immutable ID"
  exit 1
}
gh api "repos/${GITHUB_REPOSITORY}/releases/${persist_release_id}" \
  --jq ".assets[] | select(.name == \"${asset_name}\") | .id" \
  > "${scratch}/platform-digest-asset-ids"
mapfile -t asset_ids < "${scratch}/platform-digest-asset-ids"
[[ ${#asset_ids[@]} -le 1 ]] || {
  echo "::error::GitHub release contains duplicate ${asset_name} assets"
  exit 1
}
if [[ ${#asset_ids[@]} -eq 1 ]]; then
  gh api -H "Accept: application/octet-stream" \
    "repos/${GITHUB_REPOSITORY}/releases/assets/${asset_ids[0]}" \
    > "${scratch}/existing-${asset_name}"
  cmp --silent "${scratch}/existing-${asset_name}" "/tmp/release-digests/${asset_name}" || {
    echo "::error::Existing GitHub release platform digest differs for ${PLATFORM_PAIR}"
    exit 1
  }
  echo "Verified existing immutable GitHub release asset ${asset_name}."
else
  gh release upload "v${VERSION}" "/tmp/release-digests/${asset_name}" \
    --repo snapotter-hq/SnapOtter
fi
