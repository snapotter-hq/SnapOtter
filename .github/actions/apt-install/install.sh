#!/usr/bin/env bash
# Bounded apt install with a mirror fallback (#876) and a .deb cache (#1801).
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
#
# Re-rolls can't make a mirror that trickles to everyone at ~40 kB/s deliver
# 154 MB, so when APT_ARCHIVE_DIR is set (action.yml restores it from
# actions/cache) apt downloads into it and installs from it:
#
# - After a successful update, every cached .deb whose SHA256 isn't in the
#   freshly fetched, signature-checked index is deleted first. apt itself
#   takes any archive-dir file of the right name and size without hashing
#   it, so this is what keeps a stale or corrupt cache from installing.
#   Packages that changed since the cache was saved download as usual.
# - If the update itself fails, the cached archives are installed as local
#   files with --no-download, so a mirror that is down entirely still can't
#   fail a job whose cache is warm. Only if that fails too does the mirror
#   swap below run.
# - On success, archives the install didn't end up using are pruned, apt's
#   partial/ and lock are removed, and the count goes to $GITHUB_OUTPUT as
#   `debs` so action.yml skips saving an empty cache.
set -euo pipefail
shopt -s nullglob

read -r -a packages <<< "$PACKAGES"

update_budget="${UPDATE_TIMEOUT:-120}"
install_budget="${INSTALL_TIMEOUT:-300}"
dpkg_lock_wait="${DPKG_LOCK_WAIT:-300}"
archive_dir="${APT_ARCHIVE_DIR:-}"
# One budget for every wait on the dpkg lock, started by the first wait.
lock_deadline=""

apt_opts=()
if [ -n "$archive_dir" ]; then
  mkdir -p "$archive_dir"
  apt_opts=(-o "Dir::Cache::Archives=$archive_dir" -o APT::Keep-Downloaded-Packages=true)
fi

lock_wait_left() {
  if [ -z "$lock_deadline" ]; then
    echo "$dpkg_lock_wait"
  elif [ "$SECONDS" -lt "$lock_deadline" ]; then
    echo $((lock_deadline - SECONDS))
  else
    echo 0
  fi
}

apt_update() {
  sudo timeout -k 30 "$1" apt-get update -qq
}
# Extra arguments (--no-download, local .deb paths) go after the package list.
apt_install() {
  sudo timeout -k 30 "$install_budget" apt-get ${apt_opts[@]+"${apt_opts[@]}"} \
    -o DPkg::Lock::Timeout="$(lock_wait_left)" install -y \
    --no-install-recommends "${packages[@]}" "$@"
}
# timeout signals apt-get, not the dpkg it started, so a slow download that
# runs the budget out mid-configure leaves dpkg running and holding its lock
# (#1786). Configuring needs no network, so let it finish rather than kill
# it, then tidy up whatever it didn't reach. All waits share one budget, so
# a dpkg that keeps the lock can't stretch the job past its timeout.
recover_dpkg() {
  [ -n "$lock_deadline" ] || lock_deadline=$((SECONDS + dpkg_lock_wait))
  while sudo fuser /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock >/dev/null 2>&1; do
    if [ "$SECONDS" -ge "$lock_deadline" ]; then
      echo "::warning::dpkg still holds its lock after the ${dpkg_lock_wait}s wait"
      break
    fi
    sleep 5
  done
  if ! sudo dpkg --configure -a; then
    echo "::warning::dpkg --configure -a failed; the next install attempt will report why"
  fi
}

# Deletes every cached .deb whose content hash the current index doesn't list.
verify_cached_debs() {
  local debs=("$archive_dir"/*.deb)
  [ "${#debs[@]}" -gt 0 ] || return 0
  local names=() f base sum known kept=0
  for f in "${debs[@]}"; do
    base="${f##*/}"
    names+=("${base%%_*}")
  done
  # apt-cache exits non-zero when any one name is gone from the index; the
  # records it did print still count. An empty result drops everything,
  # which only costs a download.
  known="$(apt-cache show "${names[@]}" 2>/dev/null | sed -n 's/^SHA256: //p')" || true
  for f in "${debs[@]}"; do
    sum="$(sha256sum "$f")"
    sum="${sum%% *}"
    if [ -n "$known" ] && grep -qxF "$sum" <<< "$known"; then
      kept=$((kept + 1))
    else
      sudo rm -f "$f"
    fi
  done
  echo "apt cache: ${kept} of ${#debs[@]} cached .deb archives match the index"
}

install_offline() {
  local debs=("$archive_dir"/*.deb)
  [ "${#debs[@]}" -gt 0 ] || return 1
  echo "::warning::apt-get update failed; installing the ${#debs[@]} cached .deb archives without the network"
  apt_install --no-download "${debs[@]}"
}

# Keeps only the archives of package versions now installed, so the saved
# cache is exactly what this install used.
finish() {
  [ -n "$archive_dir" ] || return 0
  local installed f base kept=0
  installed="$(dpkg-query -W -f='${Package}_${Version}_${Architecture}\n' 2>/dev/null)" || true
  if [ -z "$installed" ]; then
    echo "::warning::dpkg-query listed nothing; not caching any .deb archives"
  fi
  for f in "$archive_dir"/*.deb; do
    base="${f##*/}"
    base="${base%.deb}"
    # apt names archives name_version_arch.deb with ':' (epochs) as %3a.
    base="$(printf '%b' "${base//%/\\x}")"
    if [ -n "$installed" ] && grep -qxF "$base" <<< "$installed"; then
      kept=$((kept + 1))
    else
      sudo rm -f "$f"
    fi
  done
  sudo rm -rf "$archive_dir/partial" "$archive_dir/lock"
  # apt wrote the archives as root; actions/cache runs as the runner user.
  sudo chown -R "$(id -u):$(id -g)" "$archive_dir"
  echo "apt cache: keeping ${kept} .deb archives"
  echo "debs=${kept}" >> "${GITHUB_OUTPUT:-/dev/null}"
}

azure_lists_ok=false
if apt_update "$update_budget"; then
  azure_lists_ok=true
  [ -z "$archive_dir" ] || verify_cached_debs
  if apt_install; then finish; exit 0; fi
elif [ -n "$archive_dir" ] && install_offline; then
  finish
  exit 0
fi

echo "::warning::apt via the Azure mirror stalled or failed; swapping to archive.ubuntu.com"
# A timed-out apt can leave packages unpacked but unconfigured.
recover_dpkg
# Classic sources.list and deb822 ubuntu.sources both just name the host.
sudo find /etc/apt/sources.list /etc/apt/sources.list.d -maxdepth 1 -type f \
  -exec sed -i 's|azure\.archive\.ubuntu\.com|archive.ubuntu.com|g' {} + 2>/dev/null || true

if $azure_lists_ok; then
  for f in /var/lib/apt/lists/azure.archive.ubuntu.com_*; do
    sudo mv "$f" "${f/azure.archive.ubuntu.com/archive.ubuntu.com}"
  done
else
  apt_update "$((update_budget * 3))" || apt_update "$((update_budget * 3))"
fi

for i in 1 2 3; do
  if apt_install; then finish; exit 0; fi
  echo "::warning::apt install re-roll ${i}/3 stalled or failed"
  recover_dpkg
done
exit 1
