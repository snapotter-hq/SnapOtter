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
# - apt takes any archive-dir file of the right name and size without
#   hashing it. So before every index-based install, a cached .deb is
#   deleted when the index lists its package but not its SHA256. Packages
#   that changed since the cache was saved then download as usual.
# - apt-get update exits 0 when it can't reach the mirror at all; it only
#   prints "W: Failed to fetch". An update that couldn't fetch from a URI
#   the Ubuntu sources name, or left an index that can't resolve the
#   requested packages, counts as failed, and the
#   cached archives are then installed as local files with --no-download,
#   so a warm cache survives a mirror that is down. That install trusts the
#   cache as saved (every saved .deb was hash-checked by apt or by the step
#   above), and never feeds a save. Afterwards one bounded update against
#   archive.ubuntu.com tries to leave an index for later steps. If the
#   offline install fails, the mirror swap runs; expect that right after a
#   runner image rollout, when the cache comes from the previous image and
#   some of its archives would be downgrades.
# - After an index-based install, archives it didn't use are pruned, apt's
#   partial/ and lock are removed, and $GITHUB_OUTPUT gets `fresh`: how many
#   kept archives weren't restored. action.yml saves only when it's non-zero.
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
restored=""
if [ -n "$archive_dir" ]; then
  mkdir -p "$archive_dir"
  apt_opts=(-o "Dir::Cache::Archives=$archive_dir" -o APT::Keep-Downloaded-Packages=true)
  for f in "$archive_dir"/*.deb; do restored+="${f##*/}"$'\n'; done
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

# Sets ubuntu_unreachable when apt couldn't fetch an index from a URI the
# Ubuntu sources name, which it reports as a warning with exit 0. GitHub's
# runners name `mirror+file:/etc/apt/apt-mirrors.txt` there, and apt reports
# failures under that URI. Failures from the runner's third-party sources
# (Microsoft's, say) don't count.
read -r -a ubuntu_sources <<< "${UBUNTU_SOURCES:-/etc/apt/sources.list /etc/apt/sources.list.d/ubuntu.sources}"
ubuntu_unreachable=false
apt_update() {
  local out rc=0 uri failed
  out="$(sudo timeout -k 30 "$1" apt-get update -qq 2>&1)" || rc=$?
  [ -z "$out" ] || printf '%s\n' "$out"
  ubuntu_unreachable=false
  failed="$(grep -E '^[WE]: Failed to fetch ' <<< "$out")" || return "$rc"
  while read -r uri; do
    if grep -qF "Failed to fetch ${uri%/}/" <<< "$failed"; then
      ubuntu_unreachable=true
    fi
  done < <(cat "${ubuntu_sources[@]}" 2>/dev/null |
    grep -vE '^[[:space:]]*#' | grep -oE '(mirror\+)?(https?|file):[^ ]+' | sort -u)
  return "$rc"
}
# The index can resolve every requested package (empty lists can't). Plain
# package names only: a virtual name would read as an unusable index.
index_ready() {
  apt-cache show --no-all-versions "${packages[@]}" >/dev/null 2>&1
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

# Deletes each cached .deb whose package the index lists without its SHA256.
# A package the index doesn't list at all can't be installed from the index,
# so its archive stays for the offline path.
verify_cached_debs() {
  [ -n "$archive_dir" ] || return 0
  local debs=("$archive_dir"/*.deb)
  [ "${#debs[@]}" -gt 0 ] || return 0
  local names=() f base name sum records
  for f in "${debs[@]}"; do
    base="${f##*/}"
    names+=("${base%%_*}")
  done
  # One "name sha256" line per indexed version. apt-cache exits non-zero when
  # any one name is missing; the records it printed for the rest still count.
  records="$(apt-cache show "${names[@]}" 2>/dev/null |
    awk '/^Package: /{p=$2} /^SHA256: /{print p, $2}')" || true
  if [ -z "$records" ]; then
    echo "::warning::the apt index lists none of the ${#debs[@]} cached packages; nothing to check them against"
    return 0
  fi
  local matched=0 dropped=0 unknown=0
  for f in "${debs[@]}"; do
    base="${f##*/}"
    name="${base%%_*}"
    if ! grep -q "^${name} " <<< "$records"; then
      unknown=$((unknown + 1))
      continue
    fi
    sum="$(sha256sum "$f")"
    sum="${sum%% *}"
    if grep -qxF "${name} ${sum}" <<< "$records"; then
      matched=$((matched + 1))
    else
      sudo rm -f "$f"
      dropped=$((dropped + 1))
      # A good copy downloaded under the same name is new to the cache.
      restored="$(grep -vxF "$base" <<< "$restored")" || true
    fi
  done
  echo "apt cache: ${matched} of ${#debs[@]} cached .deb archives match the index, ${dropped} dropped, ${unknown} not in it"
}

install_offline() {
  [ -n "$archive_dir" ] || return 1
  local debs=("$archive_dir"/*.deb)
  [ "${#debs[@]}" -gt 0 ] || return 1
  echo "::warning::the Ubuntu mirror is unreachable; installing the ${#debs[@]} cached .deb archives without the network"
  if apt_install --no-download "${debs[@]}"; then return 0; fi
  echo "::warning::installing from the cached archives failed; trying the mirrors"
  recover_dpkg
  return 1
}

# Keeps only the archives of package versions now installed, so a saved
# cache is exactly what this install used. Skipped after an offline install,
# which reports nothing fresh, so it never saves.
finish() {
  [ -n "$archive_dir" ] || return 0
  local installed f base name kept=0 fresh=0
  installed="$(dpkg-query -W -f='${Package}_${Version}_${Architecture}\n' 2>/dev/null)" || true
  if [ -z "$installed" ]; then
    echo "::warning::dpkg-query listed nothing; not caching any .deb archives"
  fi
  for f in "$archive_dir"/*.deb; do
    name="${f##*/}"
    base="${name%.deb}"
    # apt names archives name_version_arch.deb with ':' (epochs) as %3a.
    base="$(printf '%b' "${base//%/\\x}")"
    if [ -n "$installed" ] && grep -qxF "$base" <<< "$installed"; then
      kept=$((kept + 1))
      grep -qxF "$name" <<< "$restored" || fresh=$((fresh + 1))
    else
      sudo rm -f "$f"
    fi
  done
  sudo rm -rf "$archive_dir/partial" "$archive_dir/lock"
  # apt wrote the archives as root; actions/cache runs as the runner user.
  sudo chown -R "$(id -u):$(id -g)" "$archive_dir"
  echo "apt cache: keeping ${kept} .deb archives, ${fresh} of them new to the cache"
  echo "fresh=${fresh}" >> "${GITHUB_OUTPUT:-/dev/null}"
}

swap_to_archive() {
  # Classic sources.list and deb822 ubuntu.sources both just name the host.
  sudo find /etc/apt/sources.list /etc/apt/sources.list.d -maxdepth 1 -type f \
    -exec sed -i 's|azure\.archive\.ubuntu\.com|archive.ubuntu.com|g' {} + 2>/dev/null || true
}

update_ok=false
if apt_update "$update_budget" && index_ready; then update_ok=true; fi
cached=false
[ -z "$archive_dir" ] || [ -z "$(compgen -G "$archive_dir/*.deb")" ] || cached=true

azure_lists_ok=false
# With nothing cached, a partly failed update still goes ahead as it always
# did; with a cache, any Ubuntu host failing sends the install offline.
if $update_ok && ! { $ubuntu_unreachable && $cached; }; then
  azure_lists_ok=true
  verify_cached_debs
  if apt_install; then finish; exit 0; fi
elif install_offline; then
  echo "fresh=0" >> "${GITHUB_OUTPUT:-/dev/null}"
  # Later steps may still query apt (ci.yml looks up the ImageMagick EXR
  # coder), so try once, bounded, for an index from the canonical archive.
  # The install already succeeded; no index only gets a warning.
  swap_to_archive
  if ! apt_update "$update_budget" || $ubuntu_unreachable || ! index_ready; then
    echo "::warning::no fresh apt index after the offline install; later apt steps in this job may fail"
  fi
  exit 0
fi

echo "::warning::apt via the Azure mirror stalled or failed; swapping to archive.ubuntu.com"
# A timed-out apt can leave packages unpacked but unconfigured.
recover_dpkg
swap_to_archive

if $azure_lists_ok; then
  for f in /var/lib/apt/lists/azure.archive.ubuntu.com_*; do
    sudo mv "$f" "${f/azure.archive.ubuntu.com/archive.ubuntu.com}"
  done
else
  # A second, equally patient try when the first errored or couldn't reach
  # the archive (apt reports the latter with exit 0).
  if ! apt_update "$((update_budget * 3))" || $ubuntu_unreachable; then
    apt_update "$((update_budget * 3))"
  fi
  verify_cached_debs
fi

for i in 1 2 3; do
  if apt_install; then finish; exit 0; fi
  echo "::warning::apt install re-roll ${i}/3 stalled or failed"
  recover_dpkg
done
exit 1
