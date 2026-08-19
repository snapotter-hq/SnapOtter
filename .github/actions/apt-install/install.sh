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
  sudo timeout -k 30 "$1" apt-get update -qq &&
    sudo timeout -k 30 "$2" apt-get install -y \
      --no-install-recommends "${packages[@]}"
}

update_budget="${UPDATE_TIMEOUT:-120}"
install_budget="${INSTALL_TIMEOUT:-360}"

if attempt "$update_budget" "$install_budget"; then exit 0; fi

echo "::warning::apt via the Azure mirror stalled or failed; retrying via archive.ubuntu.com"
# A timed-out apt can leave packages unpacked but unconfigured.
sudo dpkg --configure -a || true
# Classic sources.list and deb822 ubuntu.sources both just name the host.
sudo find /etc/apt/sources.list /etc/apt/sources.list.d -maxdepth 1 -type f \
  -exec sed -i 's|azure\.archive\.ubuntu\.com|archive.ubuntu.com|g' {} + 2>/dev/null || true
# The retry is the last chance before the job fails, and the mirror swap
# forces a full index refresh, so it gets patient budgets: a slow-but-flowing
# mirror beats a dead job (a 120s retry update died on a real degraded day).
attempt "$((update_budget * 3))" "$((install_budget * 2))"
