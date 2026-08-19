#!/usr/bin/env bash
# Bounded apt install with connection re-rolls and a mirror fallback (#876).
#
# Every network step runs under timeout(1): apt's own Acquire::http::Timeout
# only catches dead connections, not a mirror that keeps trickling bytes at
# kB/s. Mirror degradation is per-connection (one runner pulled 154 MB at
# 3.7 MB/s from the same host that trickled to another), and apt resumes
# partial downloads, so several cheap attempts beat one patient one: each
# new attempt re-rolls the connection and keeps the bytes already fetched.
# The Azure mirror gets one shot, then sources swap to the canonical archive.
set -euo pipefail

read -r -a packages <<< "$PACKAGES"

update_budget="${UPDATE_TIMEOUT:-120}"
install_budget="${INSTALL_TIMEOUT:-300}"
attempts="${ATTEMPTS:-3}"

attempt() {
  sudo timeout -k 30 "$update_budget" apt-get update -qq &&
    sudo timeout -k 30 "$install_budget" apt-get install -y \
      --no-install-recommends "${packages[@]}"
}

for i in $(seq 1 "$attempts"); do
  if attempt; then exit 0; fi
  echo "::warning::apt attempt ${i}/${attempts} stalled or failed"
  # A timed-out apt can leave packages unpacked but unconfigured.
  sudo dpkg --configure -a || true
  if [ "$i" = 1 ]; then
    # Classic sources.list and deb822 ubuntu.sources both just name the host.
    sudo find /etc/apt/sources.list /etc/apt/sources.list.d -maxdepth 1 -type f \
      -exec sed -i 's|azure\.archive\.ubuntu\.com|archive.ubuntu.com|g' {} + 2>/dev/null || true
  fi
done
exit 1
