#!/usr/bin/env bash
# The "Recover expired digest artifacts from the GitHub release" step of the manifest job in .github/workflows/release.yml.
# A run step without a shell runs as `bash -e`, so this keeps -e and nothing more.
set -e

valid_action_digests=true
mapfile -t digest_files < <(find /tmp/digests -maxdepth 1 -type f -print 2>/dev/null)
[[ ${#digest_files[@]} -eq 2 ]] || valid_action_digests=false
if [[ "${valid_action_digests}" == true ]]; then
  for digest_file in "${digest_files[@]}"; do
    [[ "$(basename "${digest_file}")" =~ ^[a-f0-9]{64}$ ]] || \
      valid_action_digests=false
  done
fi
if [[ "${valid_action_digests}" != true ]]; then
  rm -rf /tmp/digests /tmp/release-digest-assets
  mkdir -p /tmp/digests /tmp/release-digest-assets
  gh release download "v${VERSION}" \
    --pattern "snapotter-v${VERSION}-linux-*.digest" \
    --dir /tmp/release-digest-assets \
    --repo snapotter-hq/SnapOtter
  mapfile -t release_assets < <(
    find /tmp/release-digest-assets -mindepth 1 -maxdepth 1 -type f -print
  )
  [[ ${#release_assets[@]} -eq 2 ]] || {
    echo "::error::Expected exactly two immutable platform digest release assets"
    exit 1
  }
  for platform in linux-amd64 linux-arm64; do
    asset="/tmp/release-digest-assets/snapotter-v${VERSION}-${platform}.digest"
    [[ -f "${asset}" && ! -L "${asset}" ]] || {
      echo "::error::Missing immutable ${platform} digest release asset"
      exit 1
    }
    digest="$(<"${asset}")"
    [[ "$(wc -c < "${asset}")" -eq 72 \
      && "$(wc -l < "${asset}")" -eq 1 \
      && "${digest}" =~ ^sha256:[a-f0-9]{64}$ ]] || {
      echo "::error::Invalid immutable ${platform} digest release asset"
      exit 1
    }
    touch "/tmp/digests/${digest#sha256:}"
  done
fi
mapfile -t final_digests < <(find /tmp/digests -maxdepth 1 -type f -print)
[[ ${#final_digests[@]} -eq 2 ]] || {
  echo "::error::Expected exactly two verified platform digests"
  exit 1
}
for digest_file in "${final_digests[@]}"; do
  [[ "$(basename "${digest_file}")" =~ ^[a-f0-9]{64}$ ]] || {
    echo "::error::Invalid platform digest filename"
    exit 1
  }
done
mapfile -t digest_names < <(
  find /tmp/digests -maxdepth 1 -type f -exec basename {} \; | sort
)
platform_digests="$(IFS=,; echo "${digest_names[*]}")"
echo "platform_digests=${platform_digests}" >> "$GITHUB_OUTPUT"
