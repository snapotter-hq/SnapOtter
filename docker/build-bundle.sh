#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────────────────────────────────────
# build-bundle.sh -- Build a pre-built AI bundle tar.gz inside the Docker image
#
# Usage: build-bundle.sh <bundleId> <arch> <outputDir>
#
#   bundleId  - One of the bundle IDs in feature-manifest.json
#   arch      - Architecture variant: amd64-gpu or arm64-cpu
#   outputDir - Directory for the output .tar.gz and .sha256 files
#
# Runs as root inside the SnapOtter Docker container. The venv at /opt/venv
# must be activated. Produces:
#   <outputDir>/<bundleId>-<arch>.tar.gz
#   <outputDir>/<bundleId>-<arch>.tar.gz.sha256
# ──────────────────────────────────────────────────────────────────────────────

export BUNDLE_ID="${1:?Usage: build-bundle.sh <bundleId> <arch> <outputDir>}"
export ARCH="${2:?Usage: build-bundle.sh <bundleId> <arch> <outputDir>}"
OUTPUT_DIR="${3:?Usage: build-bundle.sh <bundleId> <arch> <outputDir>}"

# OCR uses the v3 complete-runtime format. Keep legacy aliases at this boundary
# until every release caller has moved to explicit capability target names.
if [[ "${BUNDLE_ID}" == "ocr" ]]; then
  case "${ARCH}" in
    amd64-gpu | amd64-cpu | linux-amd64-cpu-py312)
      OCR_TARGET="linux-amd64-cpu-py312"
      ;;
    arm64-cpu | linux-arm64-cpu-py311)
      OCR_TARGET="linux-arm64-cpu-py311"
      ;;
    *)
      echo "ERROR: Unsupported OCR runtime target alias: ${ARCH}" >&2
      exit 2
      ;;
  esac
  SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
  OCR_BUILDER="${OCR_RUNTIME_BUILDER:-${SCRIPT_DIR}/build-ocr-runtime.sh}"
  if [[ ! -x "${OCR_BUILDER}" ]]; then
    echo "ERROR: OCR runtime builder is missing or not executable: ${OCR_BUILDER}" >&2
    exit 2
  fi
  exec "${OCR_BUILDER}" "${OCR_TARGET}" "${OUTPUT_DIR}"
fi

SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH:-0}"
if [[ ! "${SOURCE_DATE_EPOCH}" =~ ^[0-9]+$ ]]; then
  echo "ERROR: SOURCE_DATE_EPOCH must be a non-negative integer" >&2
  exit 2
fi

MANIFEST="/app/docker/feature-manifest.json"
VENV_PATH="${PYTHON_VENV_PATH:-/opt/venv}"
export MODELS_DIR="/tmp/bundle-models"
export BUILD_DIR="/tmp/bundle-build"

# When running with --entrypoint bash (bypassing entrypoint.sh), the venv
# at /data/ai/venv won't exist yet. Use /opt/venv directly -- it's the base
# venv baked into the Docker image, and that's exactly what we want as the
# starting point for building bundle deltas.
if [[ ! -f "${VENV_PATH}/bin/activate" && -f "/opt/venv/bin/activate" ]]; then
  VENV_PATH="/opt/venv"
fi

# Activate the venv so pip/python3 use it (not system Python)
if [[ -f "${VENV_PATH}/bin/activate" ]]; then
  # shellcheck disable=SC1091
  source "${VENV_PATH}/bin/activate"
fi

SITE_PACKAGES="$("${VENV_PATH}/bin/python3" -c 'import site; print(site.getsitepackages()[0])')"

# Parse platform from arch: amd64-gpu -> amd64, arm64-cpu -> arm64
export PLATFORM="${ARCH%%-*}"

echo "=== Building bundle: ${BUNDLE_ID} arch=${ARCH} platform=${PLATFORM} ==="
echo "Venv: ${VENV_PATH}"
echo "Site-packages: ${SITE_PACKAGES}"

# Validate manifest exists
if [[ ! -f "${MANIFEST}" ]]; then
  echo "ERROR: Manifest not found at ${MANIFEST}" >&2
  exit 1
fi

# Validate bundle exists in manifest
python3 -c "
import json, sys
with open('${MANIFEST}') as f:
    m = json.load(f)
if '${BUNDLE_ID}' not in m['bundles']:
    print(f'ERROR: Bundle \"${BUNDLE_ID}\" not found in manifest', file=sys.stderr)
    print(f'Available: {list(m[\"bundles\"].keys())}', file=sys.stderr)
    sys.exit(1)
"

# ── Step 0: Write pip constraints (numpy-1.x-ABI closure lock) ────────────
# Bundle installs below can otherwise pull the latest transitive scientific
# stack: numpy 2.x plus scipy/scikit-learn/scikit-image/pandas wheels built
# against the numpy 2.x ABI. A legacy bundle's transitive dependency can drag
# numpy 1.26.4 to 2.x plus a newer scipy. The Step 4 re-pin snaps numpy back to
# 1.26.4 but leaves
# those numpy-2.x wheels behind; the Step 6 diff (by dir name, not version)
# then ships them, and once installed they strand on the numpy==1.26.4 base and
# raise "numpy.dtype size changed" on import, crashing the dispatcher for
# EVERY AI tool (e.g. rembg's scipy), not just this bundle. Applying the
# manifest's constraints to every pip install keeps the whole closure on
# numpy-1.x-ABI versions so no bundle can strand a numpy-2.x wheel.
CONSTRAINTS_FILE="/tmp/bundle-constraints.txt"
python3 -c "
import json
with open('${MANIFEST}') as f:
    m = json.load(f)
with open('${CONSTRAINTS_FILE}', 'w') as f:
    f.write('\n'.join(m.get('constraints', [])) + '\n')
"
if [[ -s "${CONSTRAINTS_FILE}" ]] && [[ -n "$(tr -d '[:space:]' < "${CONSTRAINTS_FILE}")" ]]; then
  export PIP_CONSTRAINT="${CONSTRAINTS_FILE}"
  echo "  Build constraints: $(tr '\n' ' ' < "${CONSTRAINTS_FILE}")"
else
  echo "  No build constraints in manifest"
fi

# Clean previous build artifacts
rm -rf "${MODELS_DIR}" "${BUILD_DIR}"
mkdir -p "${MODELS_DIR}" "${BUILD_DIR}/site-packages" "${BUILD_DIR}/models" "${OUTPUT_DIR}"

# ── Step 1: Record base site-packages ────────────────────────────────────
echo "=== Recording base site-packages ==="
find "${SITE_PACKAGES}" -maxdepth 1 -mindepth 1 | sort > /tmp/base-packages.txt
echo "  Base entries: $(wc -l < /tmp/base-packages.txt)"

# ── Step 2: Install packages ─────────────────────────────────────────────
echo "=== Installing packages ==="
python3 << 'PYINSTALL'
import json, shlex, subprocess, sys, os

with open("/app/docker/feature-manifest.json") as f:
    manifest = json.load(f)

bundle_id = os.environ["BUNDLE_ID"]
platform = os.environ["PLATFORM"]
bundle = manifest["bundles"][bundle_id]
pip_flags = bundle.get("pipFlags", {})

# Collect all packages: common + arch-specific
packages = list(bundle["packages"].get("common", []))
packages.extend(bundle["packages"].get(platform, []))

print(f"  Installing {len(packages)} package(s) for {bundle_id} ({platform})")

for pkg_string in packages:
    # Check if any pipFlags key matches the start of this package string
    extra_flags = ""
    for flag_key, flag_val in pip_flags.items():
        if pkg_string.startswith(flag_key):
            extra_flags = flag_val
            break

    # pkg_string may contain embedded flags (e.g. --index-url), so pass as-is
    cmd = f"{sys.executable} -m pip install --no-cache-dir {extra_flags} {pkg_string}".strip()
    print(f"  > {cmd}", flush=True)
    result = subprocess.run(shlex.split(cmd))
    if result.returncode != 0:
        print(f"ERROR: pip install failed for: {pkg_string}", file=sys.stderr)
        sys.exit(1)

print("  Package installation complete")
PYINSTALL

# ── Step 3: Post-install fixups ───────────────────────────────────────────
echo "=== Running post-install fixups ==="
python3 << 'PYPOST'
import json, shlex, subprocess, sys, os

with open("/app/docker/feature-manifest.json") as f:
    manifest = json.load(f)

bundle = manifest["bundles"][os.environ["BUNDLE_ID"]]
post_install = bundle.get("postInstall", [])

if not post_install:
    print("  No post-install fixups")
    sys.exit(0)

for pkg in post_install:
    cmd = f"{sys.executable} -m pip install --no-cache-dir --force-reinstall {pkg}"
    print(f"  > {cmd}", flush=True)
    result = subprocess.run(shlex.split(cmd))
    if result.returncode != 0:
        print(f"ERROR: post-install fixup failed for: {pkg}", file=sys.stderr)
        sys.exit(1)

print("  Post-install fixups complete")
PYPOST

# ── Step 4: Re-pin base packages ─────────────────────────────────────────
echo "=== Re-pinning base packages ==="
python3 << 'PYREPIN'
import json, shlex, subprocess, sys

with open("/app/docker/feature-manifest.json") as f:
    manifest = json.load(f)

base_packages = manifest.get("basePackages", [])
if not base_packages:
    print("  No base packages to re-pin")
    sys.exit(0)

pkgs = " ".join(base_packages)
cmd = f"{sys.executable} -m pip install --no-cache-dir --force-reinstall {pkgs}"
print(f"  > {cmd}", flush=True)
result = subprocess.run(shlex.split(cmd))
if result.returncode != 0:
    print("ERROR: base package re-pin failed", file=sys.stderr)
    sys.exit(1)

print("  Base packages re-pinned")
PYREPIN

# ── Step 4.5: Apply source patches ───────────────────────────────────────
echo "=== Applying source patches ==="
python3 << 'PYPATCH'
import json, os, site, sys

with open("/app/docker/feature-manifest.json") as f:
    manifest = json.load(f)

bundle = manifest["bundles"][os.environ["BUNDLE_ID"]]
patches = bundle.get("patches", [])

if not patches:
    print("  No patches")
    sys.exit(0)

site_packages = site.getsitepackages()[0]
for patch in patches:
    target = os.path.join(site_packages, patch["file"])
    if not os.path.exists(target):
        print(f"  WARNING: patch target not found: {patch['file']}", file=sys.stderr)
        continue
    with open(target, "r") as fh:
        content = fh.read()
    if patch["search"] not in content:
        print(f"  WARNING: search text not found in {patch['file']} (already patched?)", file=sys.stderr)
        continue
    with open(target, "w") as fh:
        fh.write(content.replace(patch["search"], patch["replace"]))
    print(f"  Patched {patch['file']}")

print("  Source patches applied")
PYPATCH

# ── Step 4.6: ONNX Runtime flavor hygiene ────────────────────────────────
# A pinned onnxruntime-gpu plus a transitive CPU onnxruntime (rembg and
# faster-whisper both depend on plain `onnxruntime`) leaves BOTH dist-infos in
# site-packages, with the package files belonging to whichever installed last.
# Force the GPU build's files back and drop the CPU metadata, so a bundle can
# never ship CPU files under GPU metadata, or two flavors at once (#490).
echo "=== Reconciling ONNX Runtime flavor ==="
python3 << 'PYONNX'
import os, shlex, shutil, site, subprocess, sys

site_packages = site.getsitepackages()[0]
names = os.listdir(site_packages)
cpu = sorted(n for n in names if n.startswith("onnxruntime-") and n.endswith(".dist-info"))
gpu = sorted(n for n in names if n.startswith("onnxruntime_gpu-") and n.endswith(".dist-info"))

if not (cpu and gpu):
    print("  Single ONNX Runtime flavor (or none); nothing to reconcile")
    sys.exit(0)

version = gpu[-1][len("onnxruntime_gpu-"):-len(".dist-info")]
cmd = (f"{sys.executable} -m pip install --no-cache-dir --force-reinstall "
       f"--no-deps onnxruntime-gpu=={version}")
print(f"  > {cmd}", flush=True)
if subprocess.run(shlex.split(cmd)).returncode != 0:
    print("ERROR: onnxruntime-gpu reinstall failed", file=sys.stderr)
    sys.exit(1)

for name in cpu:
    shutil.rmtree(os.path.join(site_packages, name), ignore_errors=True)
print(f"  Kept onnxruntime-gpu=={version}; removed CPU dist-info: {', '.join(cpu)}")
PYONNX

# ── Step 5: Download models ──────────────────────────────────────────────
echo "=== Downloading models ==="
python3 << 'PYMODELS'
import json, os, sys, urllib.request, pathlib

with open("/app/docker/feature-manifest.json") as f:
    manifest = json.load(f)

bundle = manifest["bundles"][os.environ["BUNDLE_ID"]]
models = bundle.get("models", [])
models_dir = os.environ["MODELS_DIR"]

# Point rembg's model home at the staging dir so downloaded ONNX models
# end up inside the tarball (default U2NET_HOME is outside MODELS_DIR).
rembg_home = os.path.join(models_dir, "rembg")
os.makedirs(rembg_home, exist_ok=True)
os.environ["U2NET_HOME"] = rembg_home

if not models:
    print("  No models to download")
    sys.exit(0)

print(f"  Downloading {len(models)} model(s)")

for model in models:
    model_id = model["id"]
    download_fn = model.get("downloadFn")
    url = model.get("url")

    if url:
        # Direct URL download via urllib
        dest = os.path.join(models_dir, model["path"])
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        print(f"  [{model_id}] URL -> {model['path']}", flush=True)
        urllib.request.urlretrieve(url, dest)
        size = os.path.getsize(dest)
        min_size = model.get("minSize", 0)
        if min_size and size < min_size:
            print(f"  WARNING: {model_id} is {size:,} bytes, expected >= {min_size:,}", file=sys.stderr)
        print(f"  [{model_id}] Done ({size:,} bytes)")

    elif download_fn == "hf_snapshot":
        from huggingface_hub import snapshot_download
        args = model["args"]
        repo_id = args[0]
        local_dir = os.path.join(models_dir, args[1])

        kwargs = {"repo_id": repo_id, "local_dir": local_dir}

        # Only download specific file if specified
        if "file" in model:
            kwargs["allow_patterns"] = [model["file"]]

        # Handle non-default repo types (e.g. "space")
        if "repoType" in model:
            kwargs["repo_type"] = model["repoType"]

        print(f"  [{model_id}] HF snapshot: {repo_id} -> {args[1]}", flush=True)
        snapshot_download(**kwargs)
        print(f"  [{model_id}] Done")

    elif download_fn == "rembg_session":
        args = model["args"]
        session_name = args[0]
        print(f"  [{model_id}] rembg session: {session_name}", flush=True)

        # birefnet-matting and birefnet-hr-matting are custom sessions
        # registered at runtime in remove_bg.py (not in rembg's built-in
        # session registry). new_session() cannot resolve them, so
        # download their ONNX files directly using the same URLs and
        # filenames the custom session classes use.
        CUSTOM_BIREFNET = {
            "birefnet-matting": "https://github.com/ZhengPeng7/BiRefNet/releases/download/v1/BiRefNet-matting-epoch_100.onnx",
            "birefnet-hr-matting": "https://github.com/ZhengPeng7/BiRefNet/releases/download/v1/BiRefNet_HR-matting-epoch_135.onnx",
        }
        if session_name in CUSTOM_BIREFNET:
            dest = os.path.join(models_dir, "rembg", f"{session_name}.onnx")
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            print(f"  [{model_id}] Custom BiRefNet -> rembg/{session_name}.onnx", flush=True)
            urllib.request.urlretrieve(CUSTOM_BIREFNET[session_name], dest)
            size = os.path.getsize(dest)
            print(f"  [{model_id}] Done ({size:,} bytes)")
        else:
            from rembg import new_session
            # Force CPU-only provider: onnxruntime-gpu segfaults trying to load
            # TensorRT libs that aren't present in build containers (no GPU).
            new_session(session_name, providers=["CPUExecutionProvider"])
            print(f"  [{model_id}] Done")

    else:
        print(f"  WARNING: Unknown download method for {model_id}", file=sys.stderr)

print("  Model downloads complete")
PYMODELS

# ── Step 6: Diff site-packages ────────────────────────────────────────────
echo "=== Diffing site-packages ==="
find "${SITE_PACKAGES}" -maxdepth 1 -mindepth 1 | sort > /tmp/after-packages.txt
DELTA_DIRS="$(comm -13 /tmp/base-packages.txt /tmp/after-packages.txt)"
DELTA_COUNT="$(echo "${DELTA_DIRS}" | grep -c . || true)"
echo "  New top-level dirs: ${DELTA_COUNT}"

if [[ "${DELTA_COUNT}" -eq 0 ]]; then
  echo "WARNING: No new site-packages detected. Bundle may be empty." >&2
fi

# Copy delta dirs to build staging
while IFS= read -r dir; do
  [[ -z "${dir}" ]] && continue
  cp -a "${dir}" "${BUILD_DIR}/site-packages/"
done <<< "${DELTA_DIRS}"

# Copy models to build staging
if [[ -d "${MODELS_DIR}" ]] && [[ -n "$(ls -A "${MODELS_DIR}" 2>/dev/null)" ]]; then
  cp -a "${MODELS_DIR}"/* "${BUILD_DIR}/models/"
fi

# ── Step 7: Torch NCCL fixup ─────────────────────────────────────────────
echo "=== Checking for torch NCCL fixup ==="
python3 << 'PYNCCL'
import importlib.metadata, subprocess, os, sys

try:
    reqs = importlib.metadata.requires("torch")
except importlib.metadata.PackageNotFoundError:
    print("  torch not installed, skipping NCCL check")
    sys.exit(0)

if reqs is None:
    print("  No torch requirements found")
    sys.exit(0)

nccl_pkgs = [r.split(";")[0].strip() for r in reqs if "nccl" in r.lower()]
if not nccl_pkgs:
    print("  No NCCL requirements found")
    sys.exit(0)

fixups_dir = os.path.join(os.environ["BUILD_DIR"], "fixups")
os.makedirs(fixups_dir, exist_ok=True)

for pkg in nccl_pkgs:
    print(f"  Downloading NCCL wheel: {pkg}", flush=True)
    result = subprocess.run(
        [sys.executable, "-m", "pip", "download", "--no-cache-dir", "-d", fixups_dir, pkg]
    )
    if result.returncode != 0:
        print(f"  WARNING: Failed to download NCCL wheel: {pkg}", file=sys.stderr)

print("  NCCL fixup complete")
PYNCCL

# ── Step 8: Write bundle.json ─────────────────────────────────────────────
echo "=== Writing bundle.json ==="
python3 << 'PYBUNDLE'
import json, os, sys

with open("/app/docker/feature-manifest.json") as f:
    manifest = json.load(f)

bundle_id = os.environ["BUNDLE_ID"]
arch = os.environ["ARCH"]
bundle = manifest["bundles"][bundle_id]
model_ids = [m["id"] for m in bundle.get("models", [])]

py_ver = f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"

# Uncompressed bundle size: BUILD_DIR holds site-packages + models at this point.
# Surfaces the real extractedSize for docker/feature-manifest.json (used by the
# disk-space pre-check in install_feature.py); several manifest entries were 0 before.
extracted_size = sum(
    os.path.getsize(os.path.join(root, name))
    for root, _dirs, files in os.walk(os.environ["BUILD_DIR"])
    for name in files
)

bundle_meta = {
    "bundleId": bundle_id,
    "version": manifest["imageVersion"],
    "arch": arch,
    "imageVersion": manifest["imageVersion"],
    "pythonVersion": py_ver,
    "models": model_ids,
    "extractedSize": extracted_size,
}

out_path = os.path.join(os.environ["BUILD_DIR"], "bundle.json")
with open(out_path, "w") as f:
    json.dump(bundle_meta, f, indent=2)
    f.write("\n")

print(f"  {json.dumps(bundle_meta, indent=2)}")
PYBUNDLE

# ── Step 9: Create archive ────────────────────────────────────────────────
echo "=== Creating archive ==="
ARCHIVE_NAME="${BUNDLE_ID}-${ARCH}.tar.gz"
ARCHIVE_PATH="${OUTPUT_DIR}/${ARCHIVE_NAME}"

find "${BUILD_DIR}" -mindepth 1 -printf '%P\0' \
  | LC_ALL=C sort -z \
  | tar \
      --create \
      --file=- \
      --directory="${BUILD_DIR}" \
      --sort=name \
      --mtime="@${SOURCE_DATE_EPOCH}" \
      --owner=0 \
      --group=0 \
      --numeric-owner \
      --format=gnu \
      --no-recursion \
      --null \
      --verbatim-files-from \
      --files-from=- \
  | gzip -n > "${ARCHIVE_PATH}"

sha256sum "${ARCHIVE_PATH}" | awk '{print $1}' > "${ARCHIVE_PATH}.sha256"

ARCHIVE_SIZE="$(stat -c%s "${ARCHIVE_PATH}" 2>/dev/null || stat -f%z "${ARCHIVE_PATH}")"
SHA256="$(cat "${ARCHIVE_PATH}.sha256")"

echo "  Archive: ${ARCHIVE_PATH}"
echo "  Size:    ${ARCHIVE_SIZE} bytes"
echo "  SHA256:  ${SHA256}"

# ── Cleanup ───────────────────────────────────────────────────────────────
echo "=== Cleaning up ==="
rm -rf "${MODELS_DIR}" "${BUILD_DIR}" /tmp/base-packages.txt /tmp/after-packages.txt

echo "=== Done: ${BUNDLE_ID} ${ARCH} ==="
