#!/usr/bin/env bash
set -e
mkdir -p /tmp/ocr-index
python3 - <<'PY'
import hashlib
import json
import os
from pathlib import Path

source = Path("/tmp/ocr-artifacts")
attestation_root = Path("/tmp/ocr-attestations")
output = Path("/tmp/ocr-index")
expected_targets = {"linux-amd64-cpu-py312", "linux-arm64-cpu-py311"}
expected_image_platforms = {
    "linux-amd64-cpu-py312": "linux-amd64",
    "linux-arm64-cpu-py311": "linux-arm64",
}
artifacts = []
seen_targets = set()
source_commits = set()

def canonical(value):
    return (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()

def file_sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()

# OCR_MEASURED_ESTIMATE_CONTRACT_BEGIN
MEASURED_ESTIMATE_MINIMUM_TOLERANCE_BYTES = 1024 * 1024

def validate_measured_estimate(target, manifest_target, archive):
    if not isinstance(manifest_target, dict):
        raise SystemExit(f"missing measured-estimate metadata for {target}")
    if manifest_target.get("sizeKind") != "measured-estimate":
        raise SystemExit(f"invalid measured-estimate sizeKind for {target}")
    if not isinstance(archive, dict):
        raise SystemExit(f"missing archive size metadata for {target}")

    size_fields = (
        ("compressed", "compressedSizeEstimate", archive.get("size")),
        ("expanded", "extractedSizeEstimate", archive.get("expandedSize")),
    )
    for label, estimate_field, actual in size_fields:
        estimate = manifest_target.get(estimate_field)
        if type(estimate) is not int or estimate <= 0:
            raise SystemExit(
                f"invalid {label} measured-estimate field for {target}"
            )
        if type(actual) is not int or actual <= 0:
            raise SystemExit(f"invalid actual {label} size for {target}")
        difference = abs(actual - estimate)
        if (
            difference > MEASURED_ESTIMATE_MINIMUM_TOLERANCE_BYTES
            and difference * 100 > estimate
        ):
            raise SystemExit(
                f"OCR {label} size drift exceeds measured-estimate tolerance for "
                f"{target}: estimate={estimate}, actual={actual}, "
                f"difference={difference}, minimumTolerance="
                f"{MEASURED_ESTIMATE_MINIMUM_TOLERANCE_BYTES}, "
                "relativeTolerance=1%"
            )
# OCR_MEASURED_ESTIMATE_CONTRACT_END

# OCR_CANONICAL_NUMBER_CONTRACT_BEGIN
MAX_CANONICAL_INTEGER = 2**53 - 1

# The JS verifier (canonicalRuntimeJson) re-serializes the parsed index
# and can only reproduce integers within +/-(2**53 - 1): JSON.parse turns
# 1.0 into 1 and rounds bigger integers. A float or big integer here would
# sign an index that no install accepts (#1415).
def require_canonical_numbers(value, path="index"):
    if isinstance(value, dict):
        for key, item in value.items():
            require_canonical_numbers(item, f"{path}.{key}")
    elif isinstance(value, (list, tuple)):
        for position, item in enumerate(value):
            require_canonical_numbers(item, f"{path}[{position}]")
    elif isinstance(value, float) or (
        isinstance(value, int)
        and not isinstance(value, bool)
        and abs(value) > MAX_CANONICAL_INTEGER
    ):
        raise SystemExit(
            f"OCR runtime index value {path} must be an integer within "
            f"+/-(2**53 - 1), got {value!r}"
        )
# OCR_CANONICAL_NUMBER_CONTRACT_END

manifest_path = Path("docker/feature-manifest.json")
try:
    manifest = json.loads(manifest_path.read_bytes())
except (OSError, json.JSONDecodeError) as error:
    raise SystemExit(f"invalid checked-out OCR feature manifest: {error}") from error
bundles = manifest.get("bundles") if isinstance(manifest, dict) else None
ocr_manifest = bundles.get("ocr") if isinstance(bundles, dict) else None
manifest_targets = (
    ocr_manifest.get("targets") if isinstance(ocr_manifest, dict) else None
)
if (
    not isinstance(manifest_targets, dict)
    or set(manifest_targets) != expected_targets
):
    raise SystemExit("checked-out OCR measured-estimate target set is invalid")

workflow_commit = os.environ["SNAPOTTER_WORKFLOW_COMMIT"]
if (
    len(workflow_commit) != 40
    or any(character not in "0123456789abcdef" for character in workflow_commit)
):
    raise SystemExit("invalid reusable-workflow provenance")
expected_image_digests = {}
for target, image_platform in expected_image_platforms.items():
    digest_root = Path("/tmp/image-digests") / image_platform
    digest_entries = list(digest_root.iterdir())
    if (
        len(digest_entries) != 1
        or not digest_entries[0].is_file()
        or digest_entries[0].is_symlink()
        or digest_entries[0].stat().st_size != 0
    ):
        raise SystemExit(
            f"expected exactly one release image digest for {image_platform}"
        )
    digest = digest_entries[0].name
    if len(digest) != 64 or any(
        character not in "0123456789abcdef" for character in digest
    ):
        raise SystemExit(f"invalid release image digest for {image_platform}")
    expected_image_digests[target] = f"sha256:{digest}"

for metadata_path in sorted(source.glob("*.artifact.json")):
    if metadata_path.is_symlink() or not metadata_path.is_file():
        raise SystemExit(f"unsafe OCR artifact metadata: {metadata_path.name}")
    raw = metadata_path.read_bytes()
    artifact = json.loads(raw)
    if raw != canonical(artifact):
        raise SystemExit(f"artifact metadata is not canonical: {metadata_path.name}")
    target = artifact.get("target")
    if artifact.get("family") != "ocr" or target not in expected_targets:
        raise SystemExit(f"unexpected OCR artifact identity: {metadata_path.name}")
    if target in seen_targets:
        raise SystemExit(f"duplicate OCR target: {target}")
    seen_targets.add(target)
    if metadata_path.name != f"ocr-{target}.artifact.json":
        raise SystemExit(f"artifact filename does not bind target {target}")
    expected_arch = "amd64" if target == "linux-amd64-cpu-py312" else "arm64"
    if artifact.get("platform") != "linux" or artifact.get("arch") != expected_arch:
        raise SystemExit(f"platform mismatch for {target}")
    if artifact.get("version") != os.environ["VERSION"]:
        raise SystemExit(f"version mismatch for {target}")
    if artifact.get("capabilities", {}).get("providers") != ["CPUExecutionProvider"]:
        raise SystemExit(f"non-portable provider set for {target}")
    if artifact.get("resources", {}).get("minimumMemoryBytes") != 4 * 1024 * 1024 * 1024:
        raise SystemExit(f"invalid memory policy for {target}")
    provenance = artifact.get("provenance")
    if not isinstance(provenance, dict):
        raise SystemExit(f"missing build provenance for {target}")
    source_commit = provenance.get("sourceCommit")
    if (
        not isinstance(source_commit, str)
        or len(source_commit) != 40
        or any(character not in "0123456789abcdef" for character in source_commit)
        or provenance.get("builderId")
        != f"github-actions:.github/workflows/ai-bundles.yml@{workflow_commit}"
        or source_commit != os.environ["SNAPOTTER_RELEASE_COMMIT"]
        or provenance.get("sourceImageDigest") != expected_image_digests[target]
    ):
        raise SystemExit(f"invalid build provenance for {target}")
    source_commits.add(source_commit)
    model_objects = artifact.get("modelObjects")
    models = artifact.get("models")
    if (
        not isinstance(model_objects, list)
        or not isinstance(models, dict)
        or len(model_objects) != len(models)
    ):
        raise SystemExit(f"missing model provenance for {target}")
    if {model.get("id") for model in model_objects if isinstance(model, dict)} != set(models):
        raise SystemExit(f"model provenance IDs do not match the digest map for {target}")
    file_records = {
        record.get("path"): record
        for record in artifact.get("files", [])
        if isinstance(record, dict)
    }
    if len(file_records) != len(artifact.get("files", [])):
        raise SystemExit(f"duplicate or malformed runtime file records for {target}")
    for model in model_objects:
        if not isinstance(model, dict):
            raise SystemExit(f"malformed model provenance for {target}")
        model_id = model.get("id")
        path = model.get("path")
        digest = model.get("sha256")
        file_record = file_records.get(path)
        if (
            not isinstance(model_id, str)
            or models.get(model_id) != digest
            or not isinstance(file_record, dict)
            or file_record.get("sha256") != digest
            or file_record.get("size") != model.get("size")
            or not isinstance(model.get("license"), str)
            or not model["license"]
        ):
            raise SystemExit(f"model provenance does not match runtime bytes for {target}")
        if "url" in model:
            revision = model.get("revision")
            if (
                not isinstance(revision, str)
                or len(revision) != 40
                or f"/resolve/{revision}/" not in str(model.get("url"))
            ):
                raise SystemExit(
                    f"model provenance does not bind its immutable revision for {target}"
                )
        elif not isinstance(model.get("source"), str):
            raise SystemExit(f"local model provenance is missing its source for {target}")
    legal_materials = artifact.get("legalMaterials")
    expected_legal_ids = {
        "snapotter-agpl",
        "apache-2.0",
        "antlr-4.9.3-license",
    }
    if (
        not isinstance(legal_materials, list)
        or len(legal_materials) != len(expected_legal_ids)
        or {
            material.get("id")
            for material in legal_materials
            if isinstance(material, dict)
        }
        != expected_legal_ids
    ):
        raise SystemExit(f"incomplete legal material set for {target}")
    for material in legal_materials:
        if not isinstance(material, dict):
            raise SystemExit(f"malformed legal material for {target}")
        file_record = file_records.get(material.get("path"))
        if (
            not isinstance(file_record, dict)
            or file_record.get("sha256") != material.get("sha256")
            or file_record.get("size") != material.get("size")
        ):
            raise SystemExit(
                f"legal material does not match runtime bytes for {target}"
            )
    notices = file_records.get("THIRD_PARTY_NOTICES.json")
    if (
        not isinstance(notices, dict)
        or not isinstance(notices.get("sha256"), str)
        or len(notices["sha256"]) != 64
        or not isinstance(notices.get("size"), int)
        or notices["size"] <= 0
    ):
        raise SystemExit(f"runtime third-party notices are missing for {target}")
    archive = artifact.get("archive", {})
    archive_name = archive.get("file")
    if archive_name != f"ocr-{target}.tar.gz":
        raise SystemExit(f"unexpected archive name for {target}")
    archive_path = source / archive_name
    if not archive_path.is_file() or archive_path.is_symlink():
        raise SystemExit(f"missing archive for {target}")
    if archive_path.stat().st_size != archive.get("size"):
        raise SystemExit(f"archive size mismatch for {target}")
    digest = file_sha256(archive_path)
    if digest != archive.get("sha256"):
        raise SystemExit(f"archive digest mismatch for {target}")
    checksum_path = source / f"{archive_name}.sha256"
    if (
        not checksum_path.is_file()
        or checksum_path.is_symlink()
        or checksum_path.read_bytes() != f"{digest}\n".encode()
    ):
        raise SystemExit(f"archive checksum sidecar mismatch for {target}")
    validate_measured_estimate(target, manifest_targets[target], archive)
    artifacts.append(artifact)

if seen_targets != expected_targets:
    raise SystemExit(f"expected both OCR targets, found {sorted(seen_targets)}")
if len(source_commits) != 1:
    raise SystemExit(f"OCR targets were built from different commits: {source_commits}")
expected_attestations = {
    *(f"ocr-{target}-sbom.cdx.json" for target in expected_targets),
    *(f"ocr-{target}-sbom.spdx.json" for target in expected_targets),
    *(f"ocr-{target}-trivy.json" for target in expected_targets),
    *(f"ocr-{target}-native-cpu.quality.json" for target in expected_targets),
    "ocr-linux-amd64-cpu-py312-nvidia-exposed-cpu.quality.json",
}
actual_attestations = {
    path.name for path in attestation_root.iterdir() if path.is_file()
}
if actual_attestations != expected_attestations:
    raise SystemExit(
        "OCR attestation set mismatch: "
        f"expected {sorted(expected_attestations)}, got {sorted(actual_attestations)}"
    )
attestations = [
    {
        "file": path.name,
        "sha256": file_sha256(path),
        "size": path.stat().st_size,
    }
    for path in sorted(attestation_root.iterdir())
]
index = {
    "artifacts": sorted(artifacts, key=lambda artifact: artifact["target"]),
    "attestations": attestations,
    "schemaVersion": 1,
    "version": os.environ["VERSION"],
}
require_canonical_numbers(index)
(output / "ocr-runtime-index.unsigned.json").write_bytes(canonical(index))
PY
