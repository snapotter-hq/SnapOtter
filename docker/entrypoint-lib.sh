#!/bin/sh
# Shared helpers for the SnapOtter container entrypoint. Sourced by
# docker/entrypoint.sh and kept in its own file so the permission logic can be
# unit-tested directly (tests/unit/security/entrypoint-permissions.test.ts)
# rather than mirrored. Sourcing has no side effects -- only function defs.
#
# Functions use _-prefixed variables (sh has no portable `local`) to avoid
# clobbering the caller's variables.

# dir_writable <dir>
# Creates <dir> (best-effort, recursive) and returns 0 if the current user can
# write inside it, 1 otherwise. Probes by creating then removing a temp file:
# an actual write is the only reliable check across ACLs, NFS root-squash, and
# read-only mounts, which ownership/mode arithmetic alone would miss.
dir_writable() {
  _dw_dir="$1"
  mkdir -p "$_dw_dir" 2>/dev/null || true
  _dw_probe="$_dw_dir/.snapotter-write-probe.$$"
  if touch "$_dw_probe" 2>/dev/null; then
    rm -f "$_dw_probe" 2>/dev/null || true
    return 0
  fi
  return 1
}

# print_storage_permission_error <dir>
# Emits an actionable remediation message to stderr. Mirrors the wording of
# storagePermissionMessage() in apps/api/src/lib/storage-writable.ts.
print_storage_permission_error() {
  _pe_dir="$1"
  _pe_uid="$(id -u 2>/dev/null || echo '?')"
  _pe_gid="$(id -g 2>/dev/null || echo '?')"
  {
    echo "FATAL: Storage directory \"$_pe_dir\" is not writable by the current user (uid=$_pe_uid gid=$_pe_gid)."
    echo "SnapOtter cannot upload, process, or store files until this is fixed. Common fixes:"
    echo "  - Host volume owned by another user: on the host run \"chown -R $_pe_uid:$_pe_gid <host-path>\""
    echo "    (or set the container user to match the volume's owner)."
    echo "  - Running as a non-root user (TrueNAS, Kubernetes runAsUser, OpenShift): run the container as"
    echo "    root (the default entrypoint self-corrects), set PUID/PGID to match the volume, or grant the"
    echo "    process supplementary group 0 (Kubernetes fsGroup: 0)."
    echo "  See https://docs.snapotter.com/guide/deployment#storage-permissions"
  } >&2
}

# ensure_writable <dir>...
# Verifies every directory is writable, printing an actionable error for each
# that is not. Returns 0 only when all are writable, 1 otherwise.
ensure_writable() {
  _ew_failed=0
  for _ew_dir in "$@"; do
    if ! dir_writable "$_ew_dir"; then
      print_storage_permission_error "$_ew_dir"
      _ew_failed=1
    fi
  done
  return "$_ew_failed"
}

# rewrite_venv_paths <venv> <from> <to>
# A Python venv is not fully relocatable after a raw copy: console scripts and
# activation files keep the source venv path. Patch only text files that still
# contain that path so feature installs do not fall back to the baked /opt/venv.
rewrite_venv_paths() {
  _rv_venv="$1"
  _rv_from="$2"
  _rv_to="$3"

  if [ ! -d "$_rv_venv" ] || [ -z "$_rv_from" ] || [ -z "$_rv_to" ]; then
    return 0
  fi

  grep -Il -- "$_rv_from" "$_rv_venv"/bin/* "$_rv_venv/pyvenv.cfg" 2>/dev/null |
    while IFS= read -r _rv_file; do
      [ -f "$_rv_file" ] || continue
      [ -L "$_rv_file" ] && continue
      python3 - "$_rv_file" "$_rv_from" "$_rv_to" <<'PY'
import os
import sys
import tempfile

path, old, new = sys.argv[1:]
old_bytes = old.encode()
new_bytes = new.encode()

with open(path, "rb") as source:
    data = source.read()

if old_bytes not in data:
    raise SystemExit(0)

stat = os.stat(path)
directory = os.path.dirname(path) or "."
prefix = f".{os.path.basename(path)}.snapotter-rewrite."
fd, tmp_path = tempfile.mkstemp(prefix=prefix, dir=directory)

try:
    with os.fdopen(fd, "wb") as target:
        target.write(data.replace(old_bytes, new_bytes))
    os.chmod(tmp_path, stat.st_mode & 0o7777)
    os.replace(tmp_path, path)
except Exception:
    try:
        os.unlink(tmp_path)
    except OSError:
        pass
    raise
PY
    done
}
