#!/usr/bin/env bash
# The "Verify checksum and safely extract archive" step of the archive-security job in .github/workflows/release.yml.
# A run step without a shell runs as `bash -e`, so this keeps -e and nothing more.
set -e

archive_name="snapotter-v${VERSION}-linux-${ARCH}.tar.gz"
[[ -f "/tmp/prebuilt/${archive_name}" \
  && ! -L "/tmp/prebuilt/${archive_name}" \
  && -f "/tmp/prebuilt/${archive_name}.sha256" \
  && ! -L "/tmp/prebuilt/${archive_name}.sha256" ]] || {
    echo "::error::Archive artifact closure is incomplete"
    exit 1
  }
[[ "$(find /tmp/prebuilt -mindepth 1 -maxdepth 1 -type f | wc -l)" -eq 2 ]] || {
  echo "::error::Archive artifact contains unexpected files"
  exit 1
}
(cd /tmp/prebuilt && sha256sum --check --strict "${archive_name}.sha256")
rm -rf /tmp/prebuilt-root
mkdir -p /tmp/prebuilt-root
python3 - "/tmp/prebuilt/${archive_name}" <<'PY'
import pathlib
import sys
import tarfile

archive = pathlib.Path(sys.argv[1])
root = pathlib.Path("/tmp/prebuilt-root")
with tarfile.open(archive, "r:gz") as handle:
    members = handle.getmembers()
    if not members:
        raise SystemExit("release archive is empty")
    for member in members:
        parts = pathlib.PurePosixPath(member.name).parts
        if not parts or parts[0] != "snapotter" or ".." in parts:
            raise SystemExit(f"unsafe release archive member: {member.name}")
    handle.extractall(root, filter="data")
PY
test -s /tmp/prebuilt-root/snapotter/apps/web/dist/index.html
test -s /tmp/prebuilt-root/snapotter/apps/api/src/index.ts
# tsx is a prod dependency of apps/api, so pnpm's workspace layout puts
# its bin under apps/api/node_modules/.bin, not the workspace root. This
# is exactly where the Docker CMD runs it from (WORKDIR apps/api,
# ./node_modules/.bin/tsx). The root path never existed; this assertion
# was added in #649 and this is its first real release run.
test -x /tmp/prebuilt-root/snapotter/apps/api/node_modules/.bin/tsx
( cd /tmp/prebuilt-root/snapotter/apps/api && ./node_modules/.bin/tsx --version )
echo "archive_name=${archive_name}" >> "$GITHUB_ENV"
