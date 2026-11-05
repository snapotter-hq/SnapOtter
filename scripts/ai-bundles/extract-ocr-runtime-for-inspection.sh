#!/usr/bin/env bash
set -e
rm -rf /tmp/ocr-runtime-scan /tmp/ocr-security
mkdir -p /tmp/ocr-runtime-scan /tmp/ocr-security
python3 - <<'PY'
import hashlib
import json
import os
import pathlib
import stat
import tarfile

bundles = pathlib.Path("/tmp/bundles")
scan_root = pathlib.Path("/tmp/ocr-runtime-scan")
target = os.environ["TARGET"]
artifact_path = bundles / f"ocr-{target}.artifact.json"
artifact = json.loads(artifact_path.read_bytes())
archive_metadata = artifact["archive"]
archive_name = f"ocr-{target}.tar.gz"

def file_sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()

if (
    artifact.get("family") != "ocr"
    or artifact.get("target") != target
    or archive_metadata.get("file") != archive_name
):
    raise SystemExit("OCR artifact identity changed after runtime verification")
if artifact.get("resources", {}).get("minimumMemoryBytes") != 4 * 1024 * 1024 * 1024:
    raise SystemExit("OCR artifact memory policy changed after runtime verification")

archive_path = bundles / archive_name
if archive_path.stat().st_size != archive_metadata["size"]:
    raise SystemExit("OCR archive size changed after runtime verification")
if file_sha256(archive_path) != artifact["archive"]["sha256"]:
    raise SystemExit("OCR archive digest changed after runtime verification")

with tarfile.open(archive_path, "r:gz") as archive:
    for member in archive.getmembers():
        path = pathlib.PurePosixPath(member.name)
        if path.is_absolute() or ".." in path.parts:
            raise SystemExit(f"Unsafe OCR archive path: {member.name}")
        if not member.isfile() and not member.isdir():
            raise SystemExit(f"Unsupported OCR archive entry: {member.name}")
    archive.extractall(scan_root, filter=tarfile.data_filter)

expected_files = {record["path"]: record for record in artifact["files"]}
if len(expected_files) != len(artifact["files"]):
    raise SystemExit("OCR artifact file manifest contains duplicate paths")
actual_files = {
    path.relative_to(scan_root).as_posix(): path
    for path in scan_root.rglob("*")
    if path.is_file()
}
if set(actual_files) != set(expected_files):
    raise SystemExit("Extracted OCR runtime file manifest mismatch")
for relative_path, expected in expected_files.items():
    path = actual_files[relative_path]
    info = path.stat()
    if (
        info.st_size != expected["size"]
        or stat.S_IMODE(info.st_mode) != expected["mode"]
        or file_sha256(path) != expected["sha256"]
    ):
        raise SystemExit(f"Extracted OCR runtime file mismatch: {relative_path}")
PY
echo "ready=true" >> "$GITHUB_OUTPUT"
