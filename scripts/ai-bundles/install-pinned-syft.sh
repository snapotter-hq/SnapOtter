#!/usr/bin/env bash
set -e
# Published in Syft's v1.42.3 syft_1.42.3_checksums.txt release asset.
case "$(uname -m)" in
  x86_64)
    syft_arch="amd64"
    expected_sha256="0d6be741479eddd2c8644a288990c04f3df0d609bbc1599a005532a9dff63509"
    ;;
  aarch64 | arm64)
    syft_arch="arm64"
    expected_sha256="dc630590c953347789d08f8ebf57c7d8094db89100785fcd94b1cddeac791804"
    ;;
  *)
    echo "::error::Unsupported Syft installer architecture: $(uname -m)"
    exit 1
    ;;
esac
archive="syft_${SYFT_VERSION}_linux_${syft_arch}.tar.gz"
install_root="${RUNNER_TEMP}/syft-${SYFT_VERSION}"
rm -rf "${install_root}"
mkdir -p "${install_root}"
curl --fail --location --silent --show-error \
  --proto '=https' --tlsv1.2 --retry 3 \
  --output "${install_root}/${archive}" \
  "https://github.com/anchore/syft/releases/download/v${SYFT_VERSION}/${archive}"
printf '%s  %s\n' "${expected_sha256}" "${install_root}/${archive}" \
  | sha256sum --check --strict -
tar -xzf "${install_root}/${archive}" -C "${install_root}" syft
chmod 0755 "${install_root}/syft"
"${install_root}/syft" version -o json \
  | jq -e --arg version "${SYFT_VERSION}" '.version == $version' >/dev/null
echo "${install_root}" >> "$GITHUB_PATH"
