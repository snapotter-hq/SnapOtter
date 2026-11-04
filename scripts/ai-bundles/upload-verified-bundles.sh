#!/usr/bin/env bash
set -e
/tmp/hf-release-venv/bin/python - <<'PY'
import hashlib
import json
import os
import subprocess
from pathlib import Path, PurePosixPath

from huggingface_hub import HfApi, hf_hub_download

repo_id = "deepsafe/feature-bundles"
token = os.environ["HF_TOKEN"]
version = os.environ["VERSION"]
parent_commit = os.environ["HF_PARENT_COMMIT"]
if (
    len(parent_commit) != 40
    or any(character not in "0123456789abcdef" for character in parent_commit)
):
    raise SystemExit("Hugging Face parent revision is not an immutable commit")

root = Path("/tmp/upload") / f"v{version}"
manifest_path = root / "manifest.json"
manifest_raw = manifest_path.read_bytes()
manifest = json.loads(manifest_raw)

def canonical(value):
    return (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()

def file_sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()

if (
    manifest_raw != canonical(manifest)
    or manifest.get("schemaVersion") != 2
    or manifest.get("version") != version
    or not isinstance(manifest.get("files"), list)
):
    raise SystemExit("Candidate feature-bundle manifest has an invalid identity")
expected_files = {}
for entry in manifest["files"]:
    relative_path = entry.get("file") if isinstance(entry, dict) else None
    parsed_path = PurePosixPath(relative_path) if isinstance(relative_path, str) else None
    if (
        not isinstance(entry, dict)
        or not isinstance(relative_path, str)
        or parsed_path is None
        or parsed_path.is_absolute()
        or ".." in parsed_path.parts
        or not relative_path.startswith("v3/")
        or relative_path in expected_files
        or not isinstance(entry.get("sha256"), str)
        or len(entry["sha256"]) != 64
        or any(
            character not in "0123456789abcdef"
            for character in entry["sha256"]
        )
        or not isinstance(entry.get("size"), int)
        or entry["size"] <= 0
    ):
        raise SystemExit("Candidate feature-bundle manifest has malformed files")
    expected_files[relative_path] = entry
disk_files = {
    path.relative_to(root).as_posix()
    for path in root.rglob("*")
    if path.is_file() and path != manifest_path
}
if disk_files != set(expected_files):
    raise SystemExit("Candidate feature-bundle manifest closure mismatch")

publish_ref = "refs/snapotter/hf-publish-boundary-tag"
subprocess.run(
    [
        "git", "fetch", "--force", "--no-tags", "origin",
        f"refs/tags/v{version}:{publish_ref}",
    ],
    check=True,
    stdout=subprocess.DEVNULL,
)
published_tag_commit = subprocess.check_output(
    ["git", "rev-parse", f"{publish_ref}^{{commit}}"], text=True
).strip()
checked_out_commit = subprocess.check_output(
    ["git", "rev-parse", "HEAD"], text=True
).strip()
if (
    published_tag_commit != os.environ["RELEASE_COMMIT"]
    or checked_out_commit != os.environ["RELEASE_COMMIT"]
):
    raise SystemExit(
        "Release tag changed before Hugging Face publication"
    )

api = HfApi(token=token)
commit_info = api.upload_folder(
    repo_id=repo_id,
    folder_path=root,
    path_in_repo=f"v{version}",
    commit_message=f"Publish immutable feature bundles v{version}",
    token=token,
    repo_type="model",
    revision="main",
    parent_commit=parent_commit,
)
published_revision = commit_info.oid
if (
    not isinstance(published_revision, str)
    or len(published_revision) != 40
    or any(
        character not in "0123456789abcdef"
        for character in published_revision
    )
):
    raise SystemExit("Hugging Face upload returned an invalid commit")
head_revision = api.repo_info(
    repo_id, repo_type="model", revision="main", token=token
).sha
if head_revision != published_revision:
    raise SystemExit("Hugging Face repository changed during post-upload audit")

remote_prefix = f"v{version}/"
remote_files = {
    path.removeprefix(remote_prefix)
    for path in api.list_repo_files(
        repo_id,
        repo_type="model",
        revision=published_revision,
        token=token,
    )
    if path.startswith(remote_prefix)
}
if remote_files != {"manifest.json", *expected_files}:
    raise SystemExit("Published feature-bundle closure mismatch")
published_manifest = Path(hf_hub_download(
    repo_id,
    f"v{version}/manifest.json",
    repo_type="model",
    revision=published_revision,
    token=token,
))
if published_manifest.read_bytes() != manifest_raw:
    raise SystemExit("Published feature-bundle manifest bytes mismatch")
for relative_path, entry in expected_files.items():
    published_file = Path(hf_hub_download(
        repo_id,
        f"v{version}/{relative_path}",
        repo_type="model",
        revision=published_revision,
        token=token,
    ))
    if (
        published_file.stat().st_size != entry["size"]
        or file_sha256(published_file) != entry["sha256"]
    ):
        raise SystemExit(
            f"Published feature-bundle object mismatch: {relative_path}"
        )
final_revision = api.repo_info(
    repo_id, repo_type="model", revision="main", token=token
).sha
if final_revision != published_revision:
    raise SystemExit("Hugging Face repository changed during post-upload audit")
print(
    f"Published: https://huggingface.co/{repo_id}/tree/{published_revision}/v{version}"
)
PY
