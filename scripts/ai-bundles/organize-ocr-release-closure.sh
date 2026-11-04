#!/usr/bin/env bash
set -e
python3 - <<'PY'
import base64
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

root = Path("/tmp/upload") / f"v{os.environ['VERSION']}"
v3 = root / "v3"
source = Path("/tmp/artifacts")
if root.exists():
    shutil.rmtree(root)
v3.mkdir(parents=True)

expected_targets = {"linux-amd64-cpu-py312", "linux-arm64-cpu-py311"}
expected_attestations = {
    *(f"ocr-{target}-sbom.cdx.json" for target in expected_targets),
    *(f"ocr-{target}-sbom.spdx.json" for target in expected_targets),
    *(f"ocr-{target}-trivy.json" for target in expected_targets),
    *(f"ocr-{target}-native-cpu.quality.json" for target in expected_targets),
    "ocr-linux-amd64-cpu-py312-nvidia-exposed-cpu.quality.json",
}
expected_artifact_objects = {
    *(f"ocr-{target}.tar.gz" for target in expected_targets),
    *(f"ocr-{target}.tar.gz.sha256" for target in expected_targets),
    *(f"ocr-{target}.artifact.json" for target in expected_targets),
}
fixed_objects = {"ocr-runtime-index.json", "ocr-runtime-trusted-keys.json"}
expected_sources = expected_artifact_objects | expected_attestations | fixed_objects

source_files = [path for path in source.rglob("*") if path.is_file()]
for name in sorted(expected_sources):
    matches = [path for path in source_files if path.name == name]
    if len(matches) != 1:
        raise SystemExit(
            f"missing or colliding OCR release objects for {name}: {len(matches)}"
        )
    if matches[0].is_symlink():
        raise SystemExit(f"OCR release object is a symlink: {name}")
    shutil.copyfile(matches[0], v3 / name)

unexpected_ocr_sources = {
    path.name for path in source_files
    if path.name.startswith("ocr-") and path.name not in expected_sources
}
if unexpected_ocr_sources:
    raise SystemExit(
        f"unexpected OCR release objects: {sorted(unexpected_ocr_sources)}"
    )

def file_sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()

def canonical(value):
    return (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()

index_path = v3 / "ocr-runtime-index.json"
index_raw = index_path.read_bytes()
signed_index = json.loads(index_raw)
if index_raw != canonical(signed_index):
    raise SystemExit("Candidate OCR runtime index is not canonical JSON")
signature = signed_index.get("signature")
if (
    not isinstance(signature, dict)
    or set(signature) != {"algorithm", "keyId", "value"}
    or signature.get("algorithm") != "ed25519"
    or signature.get("keyId") != os.environ["OCR_RUNTIME_INDEX_KEY_ID"]
):
    raise SystemExit("Candidate OCR runtime index has an untrusted signature identity")
unsigned_index = dict(signed_index)
unsigned_index.pop("signature")
try:
    signature_bytes = base64.b64decode(signature["value"], validate=True)
    public_key_bytes = base64.b64decode(
        os.environ["OCR_RUNTIME_INDEX_PUBLIC_KEY_PEM_B64"], validate=True
    )
except (KeyError, ValueError) as error:
    raise SystemExit("Candidate OCR runtime index signature is invalid") from error
with tempfile.TemporaryDirectory() as temporary:
    temporary_root = Path(temporary)
    payload_path = temporary_root / "index.json"
    signature_path = temporary_root / "index.sig"
    public_key_path = temporary_root / "public.pem"
    payload_path.write_bytes(canonical(unsigned_index))
    signature_path.write_bytes(signature_bytes)
    public_key_path.write_bytes(public_key_bytes)
    try:
        subprocess.run(
            [
                "openssl", "pkeyutl", "-verify", "-rawin", "-pubin",
                "-inkey", str(public_key_path), "-in", str(payload_path),
                "-sigfile", str(signature_path),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except subprocess.CalledProcessError as error:
        raise SystemExit(
            "Candidate OCR runtime index signature is invalid"
        ) from error

if (
    signed_index.get("schemaVersion") != 1
    or signed_index.get("version") != os.environ["VERSION"]
    or not isinstance(signed_index.get("artifacts"), list)
    or not isinstance(signed_index.get("attestations"), list)
):
    raise SystemExit("Candidate OCR runtime index has an invalid identity")

artifact_names = set()
artifact_targets = set()
for artifact in signed_index["artifacts"]:
    if not isinstance(artifact, dict):
        raise SystemExit("Signed OCR artifact record is malformed")
    target = artifact.get("target")
    if artifact.get("family") != "ocr" or target not in expected_targets:
        raise SystemExit("Signed OCR artifact has an unexpected identity")
    if target in artifact_targets:
        raise SystemExit(f"Signed OCR artifact target collides: {target}")
    artifact_targets.add(target)
    metadata_name = f"ocr-{target}.artifact.json"
    metadata_path = v3 / metadata_name
    metadata_raw = metadata_path.read_bytes()
    metadata = json.loads(metadata_raw)
    if metadata_raw != canonical(metadata) or metadata != artifact:
        raise SystemExit(f"Signed OCR artifact metadata mismatch: {target}")
    archive = artifact.get("archive")
    archive_name = f"ocr-{target}.tar.gz"
    if not isinstance(archive, dict) or archive.get("file") != archive_name:
        raise SystemExit(f"Signed OCR archive identity mismatch: {target}")
    digest = archive.get("sha256")
    size = archive.get("size")
    if (
        not isinstance(digest, str)
        or len(digest) != 64
        or any(character not in "0123456789abcdef" for character in digest)
        or not isinstance(size, int)
        or size <= 0
    ):
        raise SystemExit(f"Signed OCR archive record is malformed: {target}")
    archive_path = v3 / archive_name
    if archive_path.stat().st_size != size or file_sha256(archive_path) != digest:
        raise SystemExit(f"Signed OCR archive bytes mismatch: {target}")
    sidecar_name = f"{archive_name}.sha256"
    if (v3 / sidecar_name).read_bytes() != f"{digest}\n".encode():
        raise SystemExit(f"Signed OCR archive sidecar mismatch: {target}")
    artifact_names.update({metadata_name, archive_name, sidecar_name})

if artifact_targets != expected_targets or artifact_names != expected_artifact_objects:
    raise SystemExit("Signed OCR artifact closure mismatch")

attestation_names = set()
for attestation in signed_index["attestations"]:
    if not isinstance(attestation, dict) or set(attestation) != {"file", "sha256", "size"}:
        raise SystemExit("Signed OCR attestation record is malformed")
    name = attestation["file"]
    if not isinstance(name, str) or Path(name).name != name or name in attestation_names:
        raise SystemExit(f"Signed OCR attestation path collides: {name}")
    attestation_names.add(name)
    path = v3 / name
    if not path.is_file() or path.stat().st_size != attestation.get("size"):
        raise SystemExit(f"Signed OCR attestation size mismatch: {name}")
    if file_sha256(path) != attestation.get("sha256"):
        raise SystemExit(f"Signed OCR attestation digest mismatch: {name}")
if attestation_names != expected_attestations:
    raise SystemExit("Signed OCR attestation closure mismatch")

trust_path = v3 / "ocr-runtime-trusted-keys.json"
trust_raw = trust_path.read_bytes()
trust = json.loads(trust_raw)
if trust_raw != canonical(trust) or trust.get("schemaVersion") != 1:
    raise SystemExit("Candidate OCR trust artifact is not canonical")
keys = trust.get("keys")
if not isinstance(keys, list) or len(keys) != 1 or not isinstance(keys[0], dict):
    raise SystemExit("Candidate OCR trust artifact has an invalid key set")
if (
    keys[0].get("algorithm") != "ed25519"
    or keys[0].get("keyId") != os.environ["OCR_RUNTIME_INDEX_KEY_ID"]
    or not isinstance(keys[0].get("publicKey"), str)
):
    raise SystemExit("Candidate OCR trust artifact has an untrusted identity")
with tempfile.TemporaryDirectory() as temporary:
    temporary_root = Path(temporary)
    configured_path = temporary_root / "configured.pem"
    trust_key_path = temporary_root / "trust.pem"
    configured_der = temporary_root / "configured.der"
    trust_der = temporary_root / "trust.der"
    configured_path.write_bytes(public_key_bytes)
    trust_key_path.write_text(keys[0]["publicKey"])
    for source_path, output_path in (
        (configured_path, configured_der),
        (trust_key_path, trust_der),
    ):
        subprocess.run(
            [
                "openssl", "pkey", "-pubin", "-in", str(source_path),
                "-outform", "DER", "-out", str(output_path),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    if configured_der.read_bytes() != trust_der.read_bytes():
        raise SystemExit("Candidate OCR trust artifact contains the wrong public key")

actual_objects = {path.name for path in v3.iterdir() if path.is_file()}
expected_objects = artifact_names | attestation_names | fixed_objects
if actual_objects != expected_objects or any(path.is_dir() for path in v3.iterdir()):
    raise SystemExit("Signed OCR artifact closure mismatch")

files = []
for file in sorted(path for path in root.rglob("*") if path.is_file()):
    if file.name == "manifest.json":
        continue
    files.append({
        "file": file.relative_to(root).as_posix(),
        "sha256": file_sha256(file),
        "size": file.stat().st_size,
    })
manifest = {
    "files": files,
    "schemaVersion": 2,
    "version": os.environ["VERSION"],
}
(root / "manifest.json").write_bytes(canonical(manifest))
PY
