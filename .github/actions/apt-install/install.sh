#!/usr/bin/env bash
# Bounded apt install with a mirror fallback (#876).
#
# Every network step runs under timeout(1): apt's own Acquire::http::Timeout
# only catches dead connections, not a mirror that keeps trickling bytes at
# kB/s. The pieces degrade differently, so they recover differently:
#
# - Package downloads resume across attempts and the degradation is
#   per-connection (one runner pulled 154 MB at 3.7 MB/s from the same host
#   that trickled kB/s to another), so installs get cheap re-rolls: each new
#   attempt draws a new connection and keeps the bytes already fetched.
# - Index fetches (apt-get update) barely resume, and the mirror swap
#   invalidates the cache by hostname. When the Azure update succeeded,
#   relabeling its just-fetched list files sidesteps the refresh entirely:
#   the mirrors carry identical content and apt keys downloaded indexes by
#   hostname-derived filename. Only when the Azure update itself failed is
#   a real post-swap refresh needed, with patience instead of re-rolls
#   (120s and 360s post-swap updates both died on a real degraded day).
set -euo pipefail

read -r -a packages <<< "$PACKAGES"

update_budget="${UPDATE_TIMEOUT:-120}"
install_budget="${INSTALL_TIMEOUT:-300}"

apt_update() {
  sudo timeout -k 30 "$1" apt-get update -qq
}
apt_install() {
  sudo timeout -k 30 "$install_budget" apt-get install -y \
    --no-install-recommends "${packages[@]}"
}

azure_lists_ok=false
if apt_update "$update_budget"; then
  azure_lists_ok=true
  if apt_install; then exit 0; fi
fi

echo "::warning::apt via the Azure mirror stalled or failed; swapping to archive.ubuntu.com"
# A timed-out apt can leave packages unpacked but unconfigured.
sudo dpkg --configure -a || true
# Classic sources.list and deb822 ubuntu.sources both just name the host.
sudo find /etc/apt/sources.list /etc/apt/sources.list.d -maxdepth 1 -type f \
  -exec sed -i 's|azure\.archive\.ubuntu\.com|archive.ubuntu.com|g' {} + 2>/dev/null || true

if $azure_lists_ok; then
  for f in /var/lib/apt/lists/azure.archive.ubuntu.com_*; do
    [ -e "$f" ] || continue
    sudo mv "$f" "${f/azure.archive.ubuntu.com/archive.ubuntu.com}"
  done
else
  apt_update "$((update_budget * 3))" || apt_update "$((update_budget * 3))"
fi

for i in 1 2 3; do
  if apt_install; then exit 0; fi
  echo "::warning::apt install re-roll ${i}/3 stalled or failed"
  sudo dpkg --configure -a || true
done
exit 1
