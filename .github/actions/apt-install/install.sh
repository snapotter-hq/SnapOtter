#!/usr/bin/env bash
# Bounded apt install with a mirror fallback (#876).
#
# Every network step runs under timeout(1): apt's own Acquire::http::Timeout
# only catches dead connections, not a mirror that keeps trickling bytes at
# kB/s. When the first attempt stalls or fails, swap the Azure mirror for the
# canonical archive in the apt sources and retry once, so the worst case is
# bounded instead of eating the job's whole timeout budget.
set -euo pipefail

read -r -a packages <<< "$PACKAGES"

attempt() {
  sudo timeout -k 30 "${UPDATE_TIMEOUT:-120}" apt-get update -qq &&
    sudo timeout -k 30 "${INSTALL_TIMEOUT:-420}" apt-get install -y \
      --no-install-recommends "${packages[@]}"
}

if attempt; then exit 0; fi

echo "::warning::apt via the Azure mirror stalled or failed; retrying via archive.ubuntu.com"
# A timed-out apt can leave packages unpacked but unconfigured.
sudo dpkg --configure -a || true
# Classic sources.list and deb822 ubuntu.sources both just name the host.
sudo find /etc/apt/sources.list /etc/apt/sources.list.d -maxdepth 1 -type f \
  -exec sed -i 's|azure\.archive\.ubuntu\.com|archive.ubuntu.com|g' {} + 2>/dev/null || true
attempt
