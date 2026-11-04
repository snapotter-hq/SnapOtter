#!/usr/bin/env bash
# The two "Fetch and evaluate stable tags immediately before ... aliases" steps
# of the aliases job in .github/workflows/release.yml. ALIAS_IMAGE and
# ALIAS_REGISTRY_LABEL pick the registry.
# A run step without a shell runs as `bash -e`, so this keeps -e and nothing more.
set -e

git fetch --force --prune --prune-tags --tags origin
tag_commit="$(git rev-parse "refs/tags/v${VERSION}^{commit}")"
[[ "$(git rev-parse HEAD)" == "${RELEASE_COMMIT}" \
  && "${tag_commit}" == "${RELEASE_COMMIT}" ]] || {
    echo "::error::Remote release tag moved before ${ALIAS_REGISTRY_LABEL} alias publication"
    exit 1
  }
python3 /tmp/eligible-image-aliases.py
mapfile -t aliases < "${ALIAS_OUTPUT}"
if [[ ${#aliases[@]} -eq 0 ]]; then
  echo "No non-regressing ${ALIAS_REGISTRY_LABEL} aliases are eligible for v${VERSION}."
  exit 0
fi

IFS=',' read -r -a digests <<< "${PLATFORM_DIGESTS}"
[[ ${#digests[@]} -eq 2 ]] || {
  echo "::error::Approved platform digest closure is incomplete"
  exit 1
}
arguments=()
for alias in "${aliases[@]}"; do
  [[ "${alias}" =~ ^([0-9]+(\.[0-9]+)?|latest)$ ]] || {
    echo "::error::Freshness evaluator returned an invalid ${ALIAS_REGISTRY_LABEL} alias"
    exit 1
  }
  arguments+=("-t" "${ALIAS_IMAGE}:${alias}")
done
for digest in "${digests[@]}"; do
  [[ "${digest}" =~ ^[a-f0-9]{64}$ ]] || {
    echo "::error::Invalid approved ${ALIAS_REGISTRY_LABEL} platform digest"
    exit 1
  }
  arguments+=("${ALIAS_IMAGE}@sha256:${digest}")
done
docker buildx imagetools create "${arguments[@]}"
