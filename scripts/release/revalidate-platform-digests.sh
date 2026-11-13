#!/usr/bin/env bash
# The "Revalidate platform digest provenance before publication" step of the manifest job in .github/workflows/release.yml.
# A run step without a shell runs as `bash -e`, so this keeps -e and nothing more.
set -e

mapfile -t digest_files < <(find . -maxdepth 1 -type f -exec basename {} \;)
[[ ${#digest_files[@]} -eq 2 ]] || {
  echo "::error::Recovered platform digest closure is invalid"
  exit 1
}

expected_source="https://github.com/${GITHUB_REPOSITORY}"
validated_architectures=()
registry_index=0
for digest_sha in "${digest_files[@]}"; do
  [[ "${digest_sha}" =~ ^[a-f0-9]{64}$ ]] || {
    echo "::error::Recovered platform digest is invalid"
    exit 1
  }
  digest="sha256:${digest_sha}"
  digest_architecture=""
  for reference in \
    ghcr.io/snapotter-hq/snapotter \
    snapotter/snapotter; do
    manifest="/tmp/publish-platform-manifest-${digest_sha}-${registry_index}.json"
    error="${manifest}.error"
    if ! docker buildx imagetools inspect "${reference}@${digest}" --raw \
      > "${manifest}" 2> "${error}"; then
      cat "${error}" >&2
      echo "::error::Could not inspect release digest ${reference}@${digest}"
      exit 1
    fi
    actual_digest="sha256:$(sha256sum "${manifest}" | cut -d ' ' -f 1)"
    [[ "${actual_digest}" == "${digest}" ]] || {
      echo "::error::Registry returned different bytes for ${reference}@${digest}"
      exit 1
    }
    if ! docker buildx imagetools inspect "${reference}@${digest}" \
      --format '{{json .Image}}' > "${manifest}.image" 2> "${error}"; then
      cat "${error}" >&2
      echo "::error::Could not inspect image configuration for ${reference}@${digest}"
      exit 1
    fi
    if ! jq -e \
      --arg release_commit "${RELEASE_COMMIT}" \
      --arg expected_source "${expected_source}" \
      --arg version "${VERSION}" \
      '.os == "linux"
        and (.architecture == "amd64" or .architecture == "arm64")
        and (.config.Labels | type == "object")
        and .config.Labels["org.opencontainers.image.revision"] == $release_commit
        and .config.Labels["org.opencontainers.image.source"] == $expected_source
        and .config.Labels["org.opencontainers.image.version"] == $version' \
      "${manifest}.image" >/dev/null; then
      echo "::error::Release platform digest has invalid provenance: ${reference}@${digest}"
      exit 1
    fi
    registry_architecture="$(jq -r '.architecture' "${manifest}.image")"
    if [[ -n "${digest_architecture}" \
      && "${registry_architecture}" != "${digest_architecture}" ]]; then
      echo "::error::Registries disagree on the platform for ${digest}"
      exit 1
    fi
    digest_architecture="${registry_architecture}"
    registry_index=$((registry_index + 1))
  done
  validated_architectures+=("${digest_architecture}")
done

if [[ ! (
  "${validated_architectures[0]}" == "amd64" \
    && "${validated_architectures[1]}" == "arm64"
  ) && ! (
  "${validated_architectures[0]}" == "arm64" \
    && "${validated_architectures[1]}" == "amd64"
  ) ]]; then
  echo "::error::Recovered platform digest closure is invalid"
  exit 1
fi
