#!/usr/bin/env bash
set -e
/tmp/hf-release-venv/bin/python - <<'PY'
import base64
import hashlib
import json
import os
import subprocess
import tempfile
from pathlib import Path, PurePosixPath
from huggingface_hub import HfApi, hf_hub_download

repo_id = "deepsafe/feature-bundles"
version = os.environ["VERSION"]
remote_path = f"v{version}/manifest.json"
token = os.environ["HF_TOKEN"]
api = HfApi(token=token)
snapshot_revision = api.repo_info(
    repo_id, repo_type="model", revision="main", token=token
).sha
if (
    not isinstance(snapshot_revision, str)
    or len(snapshot_revision) != 40
    or any(character not in "0123456789abcdef" for character in snapshot_revision)
):
    raise SystemExit("Hugging Face repository did not resolve to an immutable revision")
with Path(os.environ["GITHUB_ENV"]).open("a", encoding="utf-8") as handle:
    handle.write(f"HF_PARENT_COMMIT={snapshot_revision}\n")
if not api.file_exists(
    repo_id,
    remote_path,
    repo_type="model",
    revision=snapshot_revision,
    token=token,
):
    existing_version_files = [
        path
        for path in api.list_repo_files(
            repo_id,
            repo_type="model",
            revision=snapshot_revision,
            token=token,
        )
        if path.startswith(f"v{version}/")
    ]
    if existing_version_files:
        raise SystemExit(
            f"Refusing to publish into an existing feature-bundle version without a manifest: {existing_version_files[:5]}"
        )
    raise SystemExit(0)

def canonical(value):
    return (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()

def file_sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()

def manifest_map(manifest):
    if (
        not isinstance(manifest, dict)
        or manifest.get("schemaVersion") != 2
        or manifest.get("version") != version
        or not isinstance(manifest.get("files"), list)
    ):
        raise SystemExit("Existing feature-bundle manifest has an invalid identity")
    mapped = {}
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
            or not isinstance(entry.get("sha256"), str)
            or len(entry["sha256"]) != 64
            or any(
                character not in "0123456789abcdef"
                for character in entry["sha256"]
            )
            or not isinstance(entry.get("size"), int)
            or entry["size"] <= 0
            or relative_path in mapped
        ):
            raise SystemExit("Existing feature-bundle manifest has malformed files")
        mapped[relative_path] = entry
    return mapped

def is_variable_ocr_attestation(path):
    return path == "v3/ocr-runtime-index.json" or (
        path.startswith("v3/ocr-")
        and (
            "-sbom." in path
            or path.endswith("-trivy.json")
            or path.endswith(".quality.json")
        )
    )

existing_path = Path(hf_hub_download(
    repo_id,
    remote_path,
    repo_type="model",
    revision=snapshot_revision,
    token=token,
))
existing_raw = existing_path.read_bytes()
existing_manifest = json.loads(existing_raw)
if existing_raw != canonical(existing_manifest):
    raise SystemExit("Existing feature-bundle manifest is not canonical JSON")
candidate_path = Path("/tmp/upload") / f"v{version}" / "manifest.json"
candidate_raw = candidate_path.read_bytes()
candidate_manifest = json.loads(candidate_raw)
if candidate_raw != canonical(candidate_manifest):
    raise SystemExit("Candidate feature-bundle manifest is not canonical JSON")
existing_files = manifest_map(existing_manifest)
candidate_files = manifest_map(candidate_manifest)
candidate_disk_files = {
    path.relative_to(candidate_path.parent).as_posix()
    for path in candidate_path.parent.rglob("*")
    if path.is_file() and path != candidate_path
}
if candidate_disk_files != set(candidate_files):
    raise SystemExit("Candidate feature-bundle manifest closure mismatch")
remote_prefix_files = {
    path.removeprefix(f"v{version}/")
    for path in api.list_repo_files(
        repo_id,
        repo_type="model",
        revision=snapshot_revision,
        token=token,
    )
    if path.startswith(f"v{version}/")
}
if remote_prefix_files != {"manifest.json", *existing_files}:
    raise SystemExit("Existing feature-bundle version has uncommitted or missing objects")

existing_deterministic = {
    path: entry for path, entry in existing_files.items()
    if not is_variable_ocr_attestation(path)
}
candidate_deterministic = {
    path: entry for path, entry in candidate_files.items()
    if not is_variable_ocr_attestation(path)
}
if existing_deterministic != candidate_deterministic:
    raise SystemExit(
        "Refusing to replace an existing feature-bundle version with different runtime bytes"
    )

# Verify every object committed by the remote manifest before treating
# an interrupted/retried publication as a no-op. Raw performance and
# SBOM metadata may differ between valid reruns, so their candidate
# hashes are deliberately not used as the immutable identity.
remote_files = {}
for entry in existing_manifest["files"]:
    remote_file = Path(hf_hub_download(
        repo_id,
        f"v{version}/{entry['file']}",
        repo_type="model",
        revision=snapshot_revision,
        token=token,
    ))
    if remote_file.stat().st_size != entry["size"]:
        raise SystemExit(f"Existing bundle object has wrong size: {entry['file']}")
    if file_sha256(remote_file) != entry["sha256"]:
        raise SystemExit(f"Existing bundle object has wrong digest: {entry['file']}")
    remote_files[entry["file"]] = remote_file

remote_index_path = remote_files.get("v3/ocr-runtime-index.json")
if remote_index_path is None:
    raise SystemExit("Existing release has no signed OCR runtime index")
remote_index_raw = remote_index_path.read_bytes()
remote_index = json.loads(remote_index_raw)
if remote_index_raw != canonical(remote_index):
    raise SystemExit("Existing OCR runtime index is not canonical JSON")
candidate_index_path = (
    Path("/tmp/upload") / f"v{version}" / "v3" / "ocr-runtime-index.json"
)
candidate_index_raw = candidate_index_path.read_bytes()
candidate_index = json.loads(candidate_index_raw)
if candidate_index_raw != canonical(candidate_index):
    raise SystemExit("Candidate OCR runtime index is not canonical JSON")
remote_signature = remote_index.get("signature")
if (
    not isinstance(remote_signature, dict)
    or remote_signature.get("algorithm") != "ed25519"
    or remote_signature.get("keyId") != os.environ["OCR_RUNTIME_INDEX_KEY_ID"]
):
    raise SystemExit("Existing OCR runtime index has an untrusted signature identity")
signed_payload = dict(remote_index)
signed_payload.pop("signature", None)
with tempfile.TemporaryDirectory() as temporary:
    root = Path(temporary)
    payload_path = root / "index.json"
    signature_path = root / "index.sig"
    public_key_path = root / "public.pem"
    payload_path.write_bytes(canonical(signed_payload))
    signature_path.write_bytes(base64.b64decode(remote_signature.get("value", ""), validate=True))
    public_key_path.write_bytes(
        base64.b64decode(os.environ["OCR_RUNTIME_INDEX_PUBLIC_KEY_PEM_B64"], validate=True)
    )
    subprocess.run(
        [
            "openssl", "pkeyutl", "-verify", "-rawin", "-pubin",
            "-inkey", str(public_key_path), "-in", str(payload_path),
            "-sigfile", str(signature_path),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
    )

if remote_index.get("artifacts") != candidate_index.get("artifacts"):
    raise SystemExit("Existing release contains different OCR runtime artifacts")
remote_attestations = remote_index.get("attestations")
candidate_attestations = candidate_index.get("attestations")
if not isinstance(remote_attestations, list) or not isinstance(candidate_attestations, list):
    raise SystemExit("OCR runtime index attestation set is malformed")
if not all(isinstance(entry, dict) for entry in [*remote_attestations, *candidate_attestations]):
    raise SystemExit("OCR runtime index attestation record is malformed")
remote_attestation_names = {entry.get("file") for entry in remote_attestations}
candidate_attestation_names = {entry.get("file") for entry in candidate_attestations}
if (
    len(remote_attestation_names) != len(remote_attestations)
    or len(candidate_attestation_names) != len(candidate_attestations)
    or remote_attestation_names != candidate_attestation_names
):
    raise SystemExit("Existing release has a different OCR attestation set")
for attestation in remote_attestations:
    entry = existing_files.get(f"v3/{attestation.get('file')}")
    if (
        entry is None
        or entry.get("sha256") != attestation.get("sha256")
        or entry.get("size") != attestation.get("size")
    ):
        raise SystemExit(
            f"Existing signed OCR attestation is not bound by the manifest: {attestation.get('file')}"
        )

current_revision = api.repo_info(
    repo_id, repo_type="model", revision="main", token=token
).sha
if current_revision != snapshot_revision:
    raise SystemExit("Hugging Face repository changed during release audit")
with Path(os.environ["GITHUB_ENV"]).open("a", encoding="utf-8") as handle:
    handle.write("BUNDLE_RELEASE_EXISTS=true\n")
PY
