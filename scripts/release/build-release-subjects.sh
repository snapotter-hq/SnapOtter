#!/usr/bin/env bash
# The "Build canonical release-subject manifest" step of the release-subjects job in .github/workflows/release.yml.
# A run step without a shell runs as `bash -e`, so this keeps -e and nothing more.
set -e

[[ "${GITHUB_REPOSITORY}" == "snapotter-hq/SnapOtter" ]] || {
  echo "::error::Release subjects can only be created by the canonical repository"
  exit 1
}
[[ "${RELEASE_COMMIT}" =~ ^[a-f0-9]{40}$ \
  && "${WORKFLOW_TRIGGER_COMMIT}" =~ ^[a-f0-9]{40}$ \
  && "${MANIFEST_DIGEST}" =~ ^sha256:[a-f0-9]{64}$ ]] || {
    echo "::error::Release subject identity is malformed"
    exit 1
  }
release_subjects_name="snapotter-v${VERSION}-release-subjects.json"
echo "release_subjects_name=${release_subjects_name}" >> "$GITHUB_ENV"
# By id, not by tag: /releases/tags/{tag} 404s while the release is a draft.
release_id="$(
  gh release view "v${VERSION}" --repo "${GITHUB_REPOSITORY}" \
    --json databaseId --jq .databaseId
)"
[[ "${release_id}" =~ ^[0-9]+$ ]] || {
  echo "::error::GitHub release did not resolve to one immutable ID"
  exit 1
}
gh api --paginate --slurp \
  "repos/${GITHUB_REPOSITORY}/releases/${release_id}/assets?per_page=100" \
  > /tmp/release-asset-pages.json
RELEASE_ID="${release_id}" python3 <<'PY'
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess

repository = os.environ["GITHUB_REPOSITORY"]
release_id = os.environ["RELEASE_ID"]
release_commit = os.environ["RELEASE_COMMIT"]
release_tag = f"v{os.environ['VERSION']}"
version = os.environ["VERSION"]
workflow_trigger_commit = os.environ["WORKFLOW_TRIGGER_COMMIT"]
manifest_digest = os.environ["MANIFEST_DIGEST"]
release_subjects_name = f"snapotter-v{version}-release-subjects.json"
output = Path("/tmp") / release_subjects_name
published_root = Path("/tmp/published-release-subjects")
prebuilt_root = Path("/tmp/prebuilt-subjects")
published_root.mkdir(mode=0o700, exist_ok=False)

if not re.fullmatch(r"[0-9]+", release_id):
    raise SystemExit("invalid release ID")
pages = json.loads(Path("/tmp/release-asset-pages.json").read_text())
if not isinstance(pages, list) or not all(isinstance(page, list) for page in pages):
    raise SystemExit("GitHub release asset response is not paginated JSON")
assets = [asset for page in pages for asset in page]
if not assets:
    raise SystemExit("GitHub release contains no immutable assets")
names = [asset.get("name") for asset in assets]
if any(not isinstance(name, str) or PurePosixPath(name).name != name for name in names):
    raise SystemExit("GitHub release contains an unsafe asset name")
if len(names) != len(set(names)):
    raise SystemExit("GitHub release contains duplicate asset names")

expected_assets = set()
for arch in ("amd64", "arm64"):
    archive = f"snapotter-v{version}-linux-{arch}.tar.gz"
    expected_assets.update(
        {
            archive,
            f"{archive}.sha256",
            f"snapotter-v{version}-archive-linux-{arch}-sbom.cdx.json",
            f"snapotter-v{version}-archive-linux-{arch}-sbom.spdx.json",
            f"snapotter-v{version}-archive-linux-{arch}-trivy.json",
            f"snapotter-v{version}-linux-{arch}.digest",
            f"snapotter-v{version}-image-linux-{arch}-sbom.cdx.json",
            f"snapotter-v{version}-image-linux-{arch}-sbom.spdx.json",
            f"snapotter-v{version}-image-linux-{arch}-trivy.json",
        }
    )
expected_assets.update({"docker-compose.yml", "docker-compose-gpu.yml"})
missing = sorted(expected_assets - set(names))
if missing:
    raise SystemExit(f"release subject closure is incomplete: {missing}")

subjects = []
existing_manifest = None
for asset in sorted(assets, key=lambda item: item["name"]):
    name = asset["name"]
    asset_id = asset.get("id")
    if not isinstance(asset_id, int) or asset_id <= 0:
        raise SystemExit(f"release asset has an invalid ID: {name}")
    destination = published_root / name
    with destination.open("xb") as handle:
        subprocess.run(
            [
                "gh",
                "api",
                "-H",
                "Accept: application/octet-stream",
                f"repos/{repository}/releases/assets/{asset_id}",
            ],
            check=True,
            stdout=handle,
        )
    if name == release_subjects_name:
        existing_manifest = destination
        continue
    if name.endswith(".tar.gz") or name.endswith(".tar.gz.sha256"):
        candidate = prebuilt_root / name
        if not candidate.is_file() or candidate.read_bytes() != destination.read_bytes():
            raise SystemExit(f"published archive input differs: {name}")
    subjects.append(
        {
            "digest": {"sha256": hashlib.sha256(destination.read_bytes()).hexdigest()},
            "name": f"github-release://{repository}/{release_tag}/{name}",
        }
    )

image_digest = manifest_digest.removeprefix("sha256:")
for image in (
    "docker.io/snapotter/snapotter",
    "ghcr.io/snapotter-hq/snapotter",
):
    subjects.append({"digest": {"sha256": image_digest}, "name": image})
subjects.sort(key=lambda subject: subject["name"])

statement = {
    "_type": "https://snapotter.dev/attestations/release-subjects/v1",
    "releaseCommit": release_commit,
    "releaseTag": release_tag,
    "repository": repository,
    "subjects": subjects,
    "workflowTriggerCommit": workflow_trigger_commit,
}
payload = json.dumps(statement, ensure_ascii=True, separators=(",", ":"), sort_keys=True)
output.write_text(f"{payload}\n", encoding="utf-8")
if existing_manifest is not None and existing_manifest.read_bytes() != output.read_bytes():
    raise SystemExit("Existing release-subject manifest differs")
with Path(os.environ["GITHUB_ENV"]).open("a", encoding="utf-8") as environment:
    environment.write(f"release_subjects_exists={str(existing_manifest is not None).lower()}\n")
PY
