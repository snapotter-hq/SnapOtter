#!/usr/bin/env bash
set -euo pipefail

# Build one complete, immutable OCR runtime for the native host. This builder
# deliberately has no cross-build mode: compiled wheels and the Python ABI must
# be exercised on the same architecture that will publish the artifact.

TARGET="${1:?Usage: build-ocr-runtime.sh <target> <outputDir>}"
OUTPUT_DIR="${2:?Usage: build-ocr-runtime.sh <target> <outputDir>}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

if [[ -d "/app/packages/ai/python" ]]; then
  REPO_ROOT="${SNAPOTTER_SOURCE_ROOT:-/app}"
else
  REPO_ROOT="${SNAPOTTER_SOURCE_ROOT:-$(cd -- "${SCRIPT_DIR}/.." && pwd)}"
fi

MODELS_MANIFEST="${OCR_MODELS_MANIFEST:-${SCRIPT_DIR}/ocr-runtime-models.json}"
ADAPTER_SOURCE="${OCR_ADAPTER_SOURCE:-${REPO_ROOT}/packages/ai/python/ocr_runtime.py}"
RUNNER_SOURCE="${OCR_RUNNER_SOURCE:-${REPO_ROOT}/packages/ai/python/ocr_runtime_entrypoint.py}"
SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH:-0}"
SOURCE_IMAGE_DIGEST="${SNAPOTTER_OCR_SOURCE_IMAGE_DIGEST:?Set SNAPOTTER_OCR_SOURCE_IMAGE_DIGEST}"
SOURCE_COMMIT="${SNAPOTTER_OCR_SOURCE_COMMIT:?Set SNAPOTTER_OCR_SOURCE_COMMIT}"
BUILDER_ID="${SNAPOTTER_OCR_BUILDER_ID:?Set SNAPOTTER_OCR_BUILDER_ID}"

if [[ ! "${SOURCE_IMAGE_DIGEST}" =~ ^[a-f0-9]{64}$ ]]; then
  echo "ERROR: OCR source image digest must be 64 lowercase hex characters" >&2
  exit 2
fi
if [[ ! "${SOURCE_COMMIT}" =~ ^[a-f0-9]{40}$ ]]; then
  echo "ERROR: OCR source commit must be a 40-character Git object ID" >&2
  exit 2
fi
if [[ -z "${BUILDER_ID}" || ${#BUILDER_ID} -gt 512 || "${BUILDER_ID}" == *$'\n'* || "${BUILDER_ID}" == *$'\r'* ]]; then
  echo "ERROR: OCR builder identity is missing or unsafe" >&2
  exit 2
fi

case "${TARGET}" in
  linux-amd64-cpu-py312)
    EXPECTED_MACHINE="x86_64"
    PYTHON_MINOR="3.12"
    ARCH="amd64"
    REQUIREMENTS="${SCRIPT_DIR}/ocr-runtime-requirements-amd64.txt"
    ;;
  linux-arm64-cpu-py311)
    EXPECTED_MACHINE="aarch64"
    PYTHON_MINOR="3.11"
    ARCH="arm64"
    REQUIREMENTS="${SCRIPT_DIR}/ocr-runtime-requirements-arm64.txt"
    ;;
  *)
    echo "ERROR: Unsupported OCR runtime target: ${TARGET}" >&2
    exit 2
    ;;
esac

if [[ "$(uname -s)" != "Linux" || "$(uname -m)" != "${EXPECTED_MACHINE}" ]]; then
  echo "ERROR: ${TARGET} must be built natively on Linux/${EXPECTED_MACHINE}" >&2
  exit 2
fi

PYTHON_BIN="${PYTHON_BIN:-$(command -v "python${PYTHON_MINOR}" || true)}"
if [[ -z "${PYTHON_BIN}" || ! -x "${PYTHON_BIN}" ]]; then
  echo "ERROR: python${PYTHON_MINOR} is required for ${TARGET}" >&2
  exit 2
fi
if [[ "$("${PYTHON_BIN}" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')" != "${PYTHON_MINOR}" ]]; then
  echo "ERROR: ${PYTHON_BIN} does not provide Python ${PYTHON_MINOR}" >&2
  exit 2
fi

for input in \
  "${MODELS_MANIFEST}" \
  "${RUNNER_SOURCE}" \
  "${ADAPTER_SOURCE}" \
  "${REQUIREMENTS}"; do
  if [[ ! -f "${input}" ]]; then
    echo "ERROR: Required OCR runtime build input is missing: ${input}" >&2
    exit 2
  fi
done

VERSION="${SNAPOTTER_VERSION:-$("${PYTHON_BIN}" - "${REPO_ROOT}" <<'PY'
import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
for candidate in (root / "package.json", root / "docker" / "feature-manifest.json"):
    if candidate.is_file():
        value = json.loads(candidate.read_text(encoding="utf-8"))
        version = value.get("version") or value.get("imageVersion")
        if isinstance(version, str) and version:
            print(version)
            raise SystemExit(0)
raise SystemExit("cannot determine SnapOtter version")
PY
)}"
if [[ ! "${VERSION}" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$ ]]; then
  echo "ERROR: Unsafe SnapOtter version: ${VERSION}" >&2
  exit 2
fi

BUILD_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/snapotter-ocr-runtime.XXXXXXXX")"
trap 'rm -rf "${BUILD_ROOT}"' EXIT
RUNTIME_ROOT="${BUILD_ROOT}/runtime"
WHEELHOUSE="${BUILD_ROOT}/wheelhouse"
mkdir -p "${RUNTIME_ROOT}" "${WHEELHOUSE}" "${OUTPUT_DIR}"

echo "=== Building OCR runtime ${TARGET} (${VERSION}) ==="
echo "Downloading the exact hash-locked Python inputs"
"${PYTHON_BIN}" -m pip download \
  --disable-pip-version-check \
  --require-hashes \
  --no-deps \
  --dest "${WHEELHOUSE}" \
  --requirement "${REQUIREMENTS}"

# OmegaConf 2.3.0 requires antlr4-python3-runtime 4.9.x, whose upstream release
# has no wheel. Its exact sdist is already hash-checked above; build it without
# network access or build isolation, then bind the installed files in the final
# per-file artifact manifest.
ANTLR_SDIST="$(find "${WHEELHOUSE}" -maxdepth 1 -type f -name 'antlr4-python3-runtime-4.9.3.tar.gz' -print -quit)"
if [[ -z "${ANTLR_SDIST}" ]]; then
  echo "ERROR: Hash-locked antlr4 source distribution was not downloaded" >&2
  exit 2
fi
mkdir -p "${WHEELHOUSE}/built"
PIP_NO_INDEX=1 "${PYTHON_BIN}" -m pip wheel \
  --disable-pip-version-check \
  --no-build-isolation \
  --no-deps \
  --wheel-dir "${WHEELHOUSE}/built" \
  "${ANTLR_SDIST}"
ANTLR_WHEEL="$(find "${WHEELHOUSE}/built" -maxdepth 1 -type f -name 'antlr4_python3_runtime-4.9.3-*.whl' -print -quit)"
if [[ -z "${ANTLR_WHEEL}" ]]; then
  echo "ERROR: Failed to build the pinned antlr4 runtime wheel" >&2
  exit 2
fi

echo "Creating a complete isolated Python runtime"
"${PYTHON_BIN}" -m venv --copies "${RUNTIME_ROOT}/venv"
grep -v '^antlr4-python3-runtime==' "${REQUIREMENTS}" > "${BUILD_ROOT}/wheel-requirements.txt"
"${RUNTIME_ROOT}/venv/bin/python" -m pip install \
  --disable-pip-version-check \
  --no-index \
  --find-links "${WHEELHOUSE}" \
  --require-hashes \
  --no-deps \
  --requirement "${BUILD_ROOT}/wheel-requirements.txt"
"${RUNTIME_ROOT}/venv/bin/python" -m pip install \
  --disable-pip-version-check \
  --no-index \
  --no-deps \
  "${ANTLR_WHEEL}"

# Remove build-root identity from otherwise relocatable venv metadata. The
# interpreter ignores `command`; direct_url only records the temporary wheel
# path. Keeping either would make byte-for-byte rebuilds depend on mktemp.
sed -i '/^command = /d' "${RUNTIME_ROOT}/venv/pyvenv.cfg"
ANTLR_DIST_INFO="$(find "${RUNTIME_ROOT}/venv" -type d -name 'antlr4_python3_runtime-4.9.3.dist-info' -print -quit)"
if [[ -z "${ANTLR_DIST_INFO}" ]]; then
  echo "ERROR: Installed antlr4 runtime metadata is missing" >&2
  exit 2
fi
rm -f "${ANTLR_DIST_INFO}/direct_url.json"
"${RUNTIME_ROOT}/venv/bin/python" - "${ANTLR_DIST_INFO}/RECORD" <<'PY'
import pathlib
import sys

record = pathlib.Path(sys.argv[1])
lines = [line for line in record.read_text(encoding="utf-8").splitlines() if "direct_url.json" not in line]
record.write_text("\n".join(lines) + "\n", encoding="utf-8")
PY

echo "Downloading and verifying official OCR model objects"
"${PYTHON_BIN}" - "${MODELS_MANIFEST}" "${RUNTIME_ROOT}" "${REPO_ROOT}" <<'PY'
import hashlib
import json
import pathlib
import shutil
import sys
import urllib.parse
import urllib.request

manifest_path = pathlib.Path(sys.argv[1])
runtime_root = pathlib.Path(sys.argv[2])
repository_root = pathlib.Path(sys.argv[3]).resolve()
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
if manifest.get("schemaVersion") != 1 or manifest.get("family") != "ocr":
    raise SystemExit("invalid OCR model manifest")


def safe_relative(value, label):
    if not isinstance(value, str) or not value or "\\" in value:
        raise SystemExit(f"invalid {label}")
    path = pathlib.PurePosixPath(value)
    if path.is_absolute() or any(part in ("", ".", "..") for part in path.parts):
        raise SystemExit(f"unsafe {label}: {value!r}")
    return pathlib.Path(*path.parts)


def file_sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def object_size(value, label):
    if type(value) is not int or value <= 0:
        raise SystemExit(f"{label} has an invalid signed size")
    return value


def download_exact(obj, label, allowed_hosts):
    url = obj.get("url", "")
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in allowed_hosts:
        raise SystemExit(f"{label} has an untrusted download URL")
    destination = runtime_root / safe_relative(obj["path"], f"{label} path")
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + ".part")
    expected_size = object_size(obj.get("size"), label)
    request = urllib.request.Request(url, headers={"User-Agent": "SnapOtter-runtime-builder/1"})
    try:
        with urllib.request.urlopen(request, timeout=120) as response, temporary.open("wb") as output:
            # Read at most one byte beyond the signed size. A malicious or
            # misconfigured origin can never consume unbounded runner disk.
            remaining = expected_size + 1
            while remaining:
                chunk = response.read(min(1024 * 1024, remaining))
                if not chunk:
                    break
                output.write(chunk)
                remaining -= len(chunk)
        actual_size = temporary.stat().st_size
        digest = file_sha256(temporary)
        if actual_size != expected_size:
            raise SystemExit(
                f"{label} size mismatch: expected {expected_size}, got {actual_size}"
            )
        if digest != obj.get("sha256"):
            raise SystemExit(
                f"{label} digest mismatch: expected {obj.get('sha256')}, got {digest}"
            )
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)


def copy_exact_local(obj, label):
    source = repository_root / safe_relative(obj["source"], f"{label} source")
    destination = runtime_root / safe_relative(obj["path"], f"{label} path")
    if not source.is_file() or source.is_symlink():
        raise SystemExit(f"{label} is missing or unsafe: {source}")
    if source.stat().st_size != object_size(obj.get("size"), label):
        raise SystemExit(f"{label} size does not match its manifest")
    if file_sha256(source) != obj.get("sha256"):
        raise SystemExit(f"{label} digest does not match its manifest")
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, destination)


for model in manifest.get("models", []):
    revision = model.get("revision", "")
    url = model.get("url", "")
    if not isinstance(revision, str) or len(revision) != 40:
        raise SystemExit(f"model {model.get('id')} has no immutable revision")
    if f"/resolve/{revision}/" not in url:
        raise SystemExit(f"model {model.get('id')} URL does not bind its revision")

    download_exact(
        model,
        f"model {model['id']}",
        {"huggingface.co", "www.modelscope.cn"},
    )

for asset in manifest.get("localAssets", []):
    copy_exact_local(asset, f"local OCR asset {asset['id']}")

for asset in manifest.get("legalAssets", []):
    relative = safe_relative(asset["path"], "legal asset path")
    if relative.parts[0] not in {"LICENSES", "THIRD_PARTY_LICENSES"}:
        raise SystemExit(f"legal asset is outside a license directory: {asset['id']}")
    if asset.get("source"):
        copy_exact_local(asset, f"legal asset {asset['id']}")
    else:
        download_exact(
            asset,
            f"legal asset {asset['id']}",
            {"www.apache.org", "raw.githubusercontent.com"},
        )
PY

install -m 0644 "${RUNNER_SOURCE}" "${RUNTIME_ROOT}/ocr_runner.py"
install -m 0644 "${ADAPTER_SOURCE}" "${RUNTIME_ROOT}/ocr_runtime.py"

# Installed package managers are not part of the application runtime. Remove
# their modules and every generated bytecode file so output paths and timestamps
# from the temporary build root cannot leak into the immutable generation.
SITE_PACKAGES="$("${RUNTIME_ROOT}/venv/bin/python" -c 'import sysconfig; print(sysconfig.get_paths()["purelib"])')"
rm -rf \
  "${SITE_PACKAGES}/pip" \
  "${SITE_PACKAGES}"/pip-*.dist-info \
  "${SITE_PACKAGES}/setuptools" \
  "${SITE_PACKAGES}"/setuptools-*.dist-info \
  "${SITE_PACKAGES}/_distutils_hack" \
  "${SITE_PACKAGES}/distutils-precedence.pth"
# RapidOCR's universal wheel carries convenience defaults. SnapOtter binds every
# model explicitly, so retaining those three duplicate ONNX files only bloats the
# downloadable pack and risks an accidental fallback to the wrong classifier.
find "${SITE_PACKAGES}/rapidocr/models" -type f -name '*.onnx' -delete
find "${RUNTIME_ROOT}" -type d -name __pycache__ -prune -exec rm -rf {} +
find "${RUNTIME_ROOT}" -type f \( -name '*.pyc' -o -name '*.pyo' \) -delete

# Only the interpreter is invoked from venv/bin. Console-script shebangs embed
# the temporary build path, so remove them and retain one relocatable executable.
find "${RUNTIME_ROOT}/venv/bin" -mindepth 1 -maxdepth 1 -type f ! -name python -delete
find "${RUNTIME_ROOT}" -type l -delete
if [[ ! -x "${RUNTIME_ROOT}/venv/bin/python" ]]; then
  echo "ERROR: Complete venv is missing its Python executable" >&2
  exit 2
fi

# pip records hashes for generated console scripts whose shebang contains the
# random build-root path. Those scripts are intentionally removed above, but
# leaving their stale hashes in *.dist-info/RECORD makes otherwise identical
# runtime archives differ on every build. Rebuild every RECORD from the exact
# retained regular files so metadata is truthful and byte-for-byte reproducible.
"${RUNTIME_ROOT}/venv/bin/python" - "${RUNTIME_ROOT}" "${SITE_PACKAGES}" <<'PY'
import base64
import csv
import hashlib
import pathlib
import stat
import sys

runtime_root = pathlib.Path(sys.argv[1]).resolve()
site_packages = pathlib.Path(sys.argv[2]).resolve()


def contained(path: pathlib.Path) -> pathlib.Path:
    resolved = path.resolve(strict=False)
    try:
        resolved.relative_to(runtime_root)
    except ValueError as error:
        raise SystemExit(f"wheel RECORD path escapes the runtime: {path}") from error
    return resolved


for record_path in sorted(site_packages.glob("*.dist-info/RECORD")):
    rows = list(csv.reader(record_path.read_text(encoding="utf-8").splitlines()))
    retained = []
    seen = set()
    record_relative = record_path.relative_to(site_packages).as_posix()
    for row in rows:
        if len(row) != 3 or not row[0]:
            raise SystemExit(f"malformed wheel RECORD: {record_path}")
        target = contained(site_packages / pathlib.PurePosixPath(row[0]))
        try:
            info = target.lstat()
        except FileNotFoundError:
            # Removed console scripts, bundled convenience models, and
            # direct_url metadata must not survive as stale manifest entries.
            continue
        if row[0] in seen:
            raise SystemExit(f"duplicate retained wheel RECORD path: {record_path}")
        seen.add(row[0])
        if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
            raise SystemExit(f"unsafe retained wheel RECORD target: {target}")
        if row[0] == record_relative:
            retained.append((row[0], "", ""))
            continue
        contents = target.read_bytes()
        digest = base64.urlsafe_b64encode(hashlib.sha256(contents).digest()).rstrip(b"=").decode()
        retained.append((row[0], f"sha256={digest}", str(len(contents))))
    if record_relative not in {row[0] for row in retained}:
        raise SystemExit(f"wheel RECORD does not describe itself: {record_path}")
    with record_path.open("w", encoding="utf-8", newline="") as output:
        writer = csv.writer(output, lineterminator="\n")
        writer.writerows(sorted(retained))
PY

echo "Recording complete license and source attribution material"
"${RUNTIME_ROOT}/venv/bin/python" - \
  "${MODELS_MANIFEST}" \
  "${RUNTIME_ROOT}" \
  "${SITE_PACKAGES}" \
  "${SOURCE_COMMIT}" \
  "${VERSION}" <<'PY'
import json
import pathlib
import sys
from email.parser import BytesParser
from email.policy import default

manifest_path, runtime_root_raw, site_packages_raw, source_commit, version = sys.argv[1:]
runtime_root = pathlib.Path(runtime_root_raw).resolve()
site_packages = pathlib.Path(site_packages_raw).resolve()
manifest = json.loads(pathlib.Path(manifest_path).read_text(encoding="utf-8"))
legal_assets = {asset["id"]: asset for asset in manifest.get("legalAssets", [])}
required_legal_assets = {"snapotter-agpl", "apache-2.0", "antlr-4.9.3-license"}
if set(legal_assets) != required_legal_assets:
    raise SystemExit("OCR legal asset inventory is incomplete")


def relative_regular(path):
    resolved = path.resolve(strict=True)
    try:
        relative = resolved.relative_to(runtime_root)
    except ValueError as error:
        raise SystemExit(f"license path escapes the runtime: {path}") from error
    if path.is_symlink() or not path.is_file():
        raise SystemExit(f"license path is not a regular file: {path}")
    return relative.as_posix()


def license_file_names(root):
    markers = ("license", "licence", "copying", "notice", "copyright", "authors")
    return [
        relative_regular(path)
        for path in sorted(root.rglob("*"))
        if path.is_file() and any(marker in path.name.lower() for marker in markers)
    ]


manual_license_files = {
    "antlr4-python3-runtime": [legal_assets["antlr-4.9.3-license"]["path"]],
    "rapidocr": [legal_assets["apache-2.0"]["path"]],
}
package_license_files = {
    "onnxruntime": [
        relative_regular(site_packages / "onnxruntime" / "LICENSE"),
        relative_regular(site_packages / "onnxruntime" / "ThirdPartyNotices.txt"),
    ],
}
python_packages = []
seen_packages = set()
for dist_info in sorted(site_packages.glob("*.dist-info")):
    metadata_path = dist_info / "METADATA"
    if not metadata_path.is_file() or metadata_path.is_symlink():
        raise SystemExit(f"Python distribution has no safe METADATA: {dist_info.name}")
    metadata = BytesParser(policy=default).parsebytes(metadata_path.read_bytes())
    name = metadata.get("Name")
    package_version = metadata.get("Version")
    if not isinstance(name, str) or not name or not isinstance(package_version, str) or not package_version:
        raise SystemExit(f"Python distribution has an invalid identity: {dist_info.name}")
    normalized_name = name.lower().replace("_", "-")
    if normalized_name in seen_packages:
        raise SystemExit(f"duplicate Python distribution metadata: {name}")
    seen_packages.add(normalized_name)

    license_files = license_file_names(dist_info)
    license_files.extend(manual_license_files.get(normalized_name, []))
    license_files.extend(package_license_files.get(normalized_name, []))
    license_files = sorted(set(license_files))
    for relative in license_files:
        relative_regular(runtime_root / relative)
    if not license_files:
        raise SystemExit(f"package has no included license material: {name}=={package_version}")

    raw_license = metadata.get("License-Expression") or metadata.get("License")
    if not raw_license or "\n" in raw_license or len(raw_license) > 200:
        raw_license = "See included license files"
    project_urls = []
    for value in metadata.get_all("Project-URL", []):
        label, separator, url = value.partition(",")
        if separator and url.strip().startswith("https://"):
            project_urls.append((label.strip().lower(), url.strip()))
    source_url = next(
        (
            url
            for label, url in project_urls
            if label in {"source", "source code", "repository", "code", "homepage"}
        ),
        None,
    )
    homepage = metadata.get("Home-page")
    if source_url is None and isinstance(homepage, str) and homepage.startswith("https://"):
        source_url = homepage
    if source_url is None:
        source_url = f"https://pypi.org/project/{name}/{package_version}/"

    python_packages.append(
        {
            "license": raw_license,
            "licenseFiles": license_files,
            "metadataFile": relative_regular(metadata_path),
            "name": name,
            "sourceUrl": source_url,
            "version": package_version,
        }
    )

license_path_by_id = {
    "AGPL-3.0": legal_assets["snapotter-agpl"]["path"],
    "Apache-2.0": legal_assets["apache-2.0"]["path"],
}
model_objects = [*manifest.get("models", []), *manifest.get("localAssets", [])]
models = []
for model in sorted(model_objects, key=lambda value: value["id"]):
    license_name = model.get("license")
    license_file = license_path_by_id.get(license_name)
    if license_file is None:
        raise SystemExit(f"model has no included license text: {model.get('id')}")
    models.append(
        {
            "file": model.get("file") or model.get("source"),
            "id": model["id"],
            "license": license_name,
            "licenseFile": license_file,
            "path": model["path"],
            "repository": model.get("repository", "snapotter-hq/SnapOtter"),
            "revision": model.get("revision", source_commit),
            "sha256": model["sha256"],
            "sourceUrl": model.get("url")
            or f"https://github.com/snapotter-hq/SnapOtter/tree/{source_commit}",
        }
    )

notice = {
    "modelObjects": models,
    "project": {
        "correspondingSource": f"https://github.com/snapotter-hq/SnapOtter/tree/{source_commit}",
        "license": "AGPL-3.0",
        "licenseFile": legal_assets["snapotter-agpl"]["path"],
        "name": "SnapOtter OCR runtime adapter",
        "sourceCommit": source_commit,
        "version": version,
    },
    "pythonPackages": sorted(python_packages, key=lambda value: value["name"].lower()),
    "schemaVersion": 1,
}
(runtime_root / "THIRD_PARTY_NOTICES.json").write_text(
    json.dumps(notice, sort_keys=True, separators=(",", ":")) + "\n",
    encoding="utf-8",
)
PY

echo "Running a network-disabled CPU provider smoke test"
SNAPOTTER_NETWORK_DISABLED=1 \
SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0 \
HF_HUB_OFFLINE=1 \
PIP_NO_INDEX=1 \
PYTHONNOUSERSITE=1 \
PYTHONDONTWRITEBYTECODE=1 \
SNAPOTTER_OCR_ARTIFACT_VERSION="${VERSION}" \
SNAPOTTER_OCR_PROVIDERS_JSON='["CPUExecutionProvider"]' \
SNAPOTTER_OCR_RUNTIME_TARGET="${TARGET}" \
SNAPOTTER_RUNTIME_ROOT="${RUNTIME_ROOT}" \
"${RUNTIME_ROOT}/venv/bin/python" "${RUNTIME_ROOT}/ocr_runner.py" --smoke

# Installer policy accepts regular files only and verifies exact modes. Normalize
# everything before hashing and archiving.
if find "${RUNTIME_ROOT}" ! -type d ! -type f -print -quit | grep -q .; then
  echo "ERROR: OCR runtime contains a non-regular filesystem entry" >&2
  exit 2
fi
find "${RUNTIME_ROOT}" -type d -exec chmod 0755 {} +
find "${RUNTIME_ROOT}" -type f -exec chmod 0644 {} +
chmod 0755 "${RUNTIME_ROOT}/venv/bin/python"
find "${RUNTIME_ROOT}" -exec touch -h -d "@${SOURCE_DATE_EPOCH}" {} +

ARCHIVE_NAME="ocr-${TARGET}.tar.gz"
STAGED_ARCHIVE_PATH="${BUILD_ROOT}/${ARCHIVE_NAME}"
ARCHIVE_PATH="${OUTPUT_DIR}/${ARCHIVE_NAME}"

echo "Creating deterministic archive ${ARCHIVE_NAME}"
find "${RUNTIME_ROOT}" -type f -printf '%P\0' \
  | LC_ALL=C sort -z \
  | tar \
      --create \
      --file=- \
      --directory="${RUNTIME_ROOT}" \
      --sort=name \
      --mtime="@${SOURCE_DATE_EPOCH}" \
      --owner=0 \
      --group=0 \
      --numeric-owner \
      --format=gnu \
      --null \
      --verbatim-files-from \
      --files-from=- \
  | gzip -n > "${STAGED_ARCHIVE_PATH}"
gzip -t "${STAGED_ARCHIVE_PATH}"
tar -tzf "${STAGED_ARCHIVE_PATH}" > /dev/null
install -m 0644 "${STAGED_ARCHIVE_PATH}" "${ARCHIVE_PATH}"
if [[ "$(sha256sum "${STAGED_ARCHIVE_PATH}" | awk '{print $1}')" != "$(sha256sum "${ARCHIVE_PATH}" | awk '{print $1}')" ]]; then
  echo "ERROR: OCR archive changed while copying to the output directory" >&2
  exit 2
fi
ARCHIVE_SHA256="$(sha256sum "${ARCHIVE_PATH}" | awk '{print $1}')"
GENERATION="${VERSION}-${ARCHIVE_SHA256:0:16}"

ARTIFACT_PATH="${OUTPUT_DIR}/ocr-${TARGET}.artifact.json"
INDEX_INPUT_PATH="${OUTPUT_DIR}/ocr-${TARGET}.index-input.json"
"${PYTHON_BIN}" - \
  "${RUNTIME_ROOT}" \
  "${ARCHIVE_PATH}" \
  "${ARCHIVE_NAME}" \
  "${MODELS_MANIFEST}" \
  "${TARGET}" \
  "${ARCH}" \
  "${GENERATION}" \
  "${VERSION}" \
  "${ARTIFACT_PATH}" \
  "${INDEX_INPUT_PATH}" <<'PY'
import hashlib
import json
import os
import pathlib
import stat
import sys

(
    runtime_root_raw,
    archive_path_raw,
    archive_name,
    models_manifest_raw,
    target,
    arch,
    generation,
    version,
    artifact_path_raw,
    index_input_path_raw,
) = sys.argv[1:]
runtime_root = pathlib.Path(runtime_root_raw)
archive_path = pathlib.Path(archive_path_raw)


def sha256(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


files = []
for path in sorted((path for path in runtime_root.rglob("*") if path.is_file())):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
        raise SystemExit(f"unsafe runtime file: {path}")
    files.append(
        {
            "path": path.relative_to(runtime_root).as_posix(),
            "sha256": sha256(path),
            "size": info.st_size,
            "mode": stat.S_IMODE(info.st_mode),
        }
    )

models_manifest = json.loads(pathlib.Path(models_manifest_raw).read_text(encoding="utf-8"))
model_objects = [*models_manifest["models"], *models_manifest.get("localAssets", [])]
models = {model["id"]: model["sha256"] for model in model_objects}
legal_objects = models_manifest.get("legalAssets", [])
artifact = {
    "family": "ocr",
    "target": target,
    "generation": generation,
    "version": version,
    "platform": "linux",
    "arch": arch,
    "archive": {
        "file": archive_name,
        "sha256": sha256(archive_path),
        "size": archive_path.stat().st_size,
        "expandedSize": sum(file["size"] for file in files),
    },
    "files": files,
    "runtime": {
      "pythonPath": "venv/bin/python",
      "entrypoint": "ocr_runner.py",
      "adapterPath": "ocr_runtime.py",
    },
    "models": models,
    # Preserve the full immutable source/license record in the signed index,
    # not only the digest map consumed at runtime.
    "modelObjects": sorted(model_objects, key=lambda model: model["id"]),
    "legalMaterials": sorted(legal_objects, key=lambda material: material["id"]),
    "compatibility": {
        "protocolVersion": 1,
        "snapotterVersion": version,
    },
    "capabilities": {
        "qualities": ["balanced", "best"],
        "providers": ["CPUExecutionProvider"],
    },
    "resources": {"minimumMemoryBytes": 4 * 1024 * 1024 * 1024},
    "provenance": {
        "builderId": os.environ["SNAPOTTER_OCR_BUILDER_ID"],
        "sourceCommit": os.environ["SNAPOTTER_OCR_SOURCE_COMMIT"],
        "sourceImageDigest": f"sha256:{os.environ['SNAPOTTER_OCR_SOURCE_IMAGE_DIGEST']}",
    },
}


def canonical_write(path: pathlib.Path, value: object) -> None:
    path.write_text(
        json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )


canonical_write(pathlib.Path(artifact_path_raw), artifact)
canonical_write(pathlib.Path(index_input_path_raw), {"schemaVersion": 1, "artifacts": [artifact]})
PY

"${PYTHON_BIN}" - "${ARCHIVE_PATH}" <<'PY' > "${ARCHIVE_PATH}.sha256"
import hashlib
import pathlib
import sys

print(hashlib.sha256(pathlib.Path(sys.argv[1]).read_bytes()).hexdigest())
PY

echo "Archive: ${ARCHIVE_PATH}"
echo "Artifact: ${ARTIFACT_PATH}"
echo "Unsigned canonical index input: ${INDEX_INPUT_PATH}"
echo "SHA-256: $(cat "${ARCHIVE_PATH}.sha256")"
