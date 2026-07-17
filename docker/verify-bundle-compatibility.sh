#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────────────────────────────────────
# verify-bundle-compatibility.sh -- Verify ALL bundles share a consistent
# constrained-package closure when installed together
#
# Usage: verify-bundle-compatibility.sh <arch> <bundlesDir>
#
#   arch       - amd64-gpu or arm64-cpu
#   bundlesDir - directory containing <bundleId>-<arch>.tar.gz for every bundle
#                in feature-manifest.json's "bundles" map
#
# Runs with --entrypoint bash (no entrypoint bootstrap), so uses /opt/venv
# directly, matching build-bundle.sh's own base assumption.
#
# Why this exists: verify-bundle.sh (this directory) verifies each bundle in
# ISOLATION -- a fresh /opt/venv per bundle. That can never catch a conflict
# that only appears when two bundles are installed into the SAME shared venv,
# which is exactly how real users install them (BullMQ /data/ai/venv is one
# shared venv for every installed bundle, not one venv per bundle). That gap is
# exactly how the scipy ABI strand (see docs/QA_REPORT_v2.0.0_release_2026-07-07.md
# BUG-2, and the earlier incident in project memory project_ai_bundle_numpy_abi_strand)
# shipped twice: each bundle passed verify-bundle.sh alone, and the manifest's
# `constraints` pin was correctly applied at each bundle's OWN build time, but
# nothing ever checked that bundles built at DIFFERENT times agree with each
# other once layered into one venv.
#
# This script installs every bundle for the given arch into ONE fresh venv, in
# manifest order, then asserts that every constrained package (per the
# manifest's top-level "constraints" array) has EXACTLY ONE version present,
# and that it matches the constraint exactly. Run this before publishing any
# bundle rebuild, for every arch, on any subset of bundles you touched AND the
# full set (a rebuild of bundle A can still leave bundle B stale).
#
# Exit codes: 0=pass, 1=integrity, 2=constraint violation
# ──────────────────────────────────────────────────────────────────────────────

ARCH="${1:?Usage: verify-bundle-compatibility.sh <arch> <bundlesDir>}"
BUNDLES_DIR="${2:?Usage: verify-bundle-compatibility.sh <arch> <bundlesDir>}"
MANIFEST="/app/docker/feature-manifest.json"

VENV="/opt/venv"
SITE_PACKAGES="${VENV}/lib/python3.11/site-packages"
if [[ ! -d "${SITE_PACKAGES}" ]]; then
  SITE_PACKAGES="${VENV}/lib/python3.12/site-packages"
fi

log() { echo "=== $* ==="; }
pass() { echo -e "\033[32mPASS: $*\033[0m"; }
fail() {
  echo -e "\033[31mFAIL: $1\033[0m" >&2
  exit "${2:-1}"
}

if [[ ! -f "${MANIFEST}" ]]; then
  fail "Manifest not found at ${MANIFEST}"
fi

BUNDLE_IDS="$(python3 -c "
import json
with open('${MANIFEST}') as f:
    m = json.load(f)
print(' '.join(m['bundles'].keys()))
")"

log "Installing every bundle for ${ARCH} into one shared venv: ${BUNDLE_IDS}"

for bundle_id in ${BUNDLE_IDS}; do
  archive="${BUNDLES_DIR}/${bundle_id}-${ARCH}.tar.gz"
  if [[ ! -f "${archive}" ]]; then
    echo "  SKIP ${bundle_id}: no archive at ${archive} (not built for this arch, or intentionally excluded)"
    continue
  fi
  staging="/tmp/compat-staging-${bundle_id}"
  rm -rf "${staging}"
  mkdir -p "${staging}"
  tar -xzf "${archive}" -C "${staging}"
  if [[ -d "${staging}/site-packages" ]]; then
    # Layer through the REAL installer merge (reconcile + move_tree), not a raw
    # cp: install_feature.py reconciles the ONNX Runtime flavor between bundles
    # (#490), and this script must verify the state users actually end up with.
    # INSTALL_FEATURE_PY can point at a repo checkout mounted over an older
    # image (same pattern as the install_runtime.py mounts in ai-bundles.yml).
    "${VENV}/bin/python3" - "${staging}/site-packages" "${SITE_PACKAGES}" <<'PYMERGE'
import importlib.util, os, sys

script = os.environ.get("INSTALL_FEATURE_PY", "/app/packages/ai/python/install_feature.py")
spec = importlib.util.spec_from_file_location("installer_under_verify", script)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
if not hasattr(mod, "reconcile_onnxruntime"):
    print(f"FAIL: {script} has no reconcile_onnxruntime; mount the current "
          "packages/ai/python/install_feature.py into the container "
          "(-v $PWD/packages/ai/python/install_feature.py:/app/packages/ai/python/install_feature.py:ro)",
          file=sys.stderr)
    sys.exit(1)
staging_sp, site_packages = sys.argv[1], sys.argv[2]
mod.reconcile_onnxruntime(staging_sp, site_packages)
mod.move_tree(staging_sp, site_packages)
PYMERGE
  fi
  rm -rf "${staging}"
  echo "  Installed ${bundle_id}"
done

pass "All available bundles layered into ${SITE_PACKAGES}"

log "Checking constrained-package version consistency"

"${VENV}/bin/python3" -c "
import json, re, sys
from importlib.metadata import distributions

with open('${MANIFEST}') as f:
    manifest = json.load(f)

constraints = manifest.get('constraints', [])
if not constraints:
    print('No constraints declared in manifest -- nothing to check')
    sys.exit(0)

# Group every installed distribution's dist-info by normalized name (PEP 503:
# runs of -_. collapse to one _, case-insensitive), so 'scikit-image' and the
# dist-info directory name 'scikit_image-0.24.0' resolve to the same key.
def normalize(name):
    return re.sub(r'[-_.]+', '_', name).lower()

by_name = {}
for dist in distributions():
    name = dist.metadata.get('Name') or dist.name
    version = dist.version
    key = normalize(name)
    by_name.setdefault(key, []).append((name, version, str(dist._path)))

violations = []

for spec in constraints:
    m = re.match(r'^([A-Za-z0-9_.-]+)==([A-Za-z0-9_.-]+)\$', spec)
    if not m:
        print(f'  WARNING: could not parse constraint {spec!r}, skipping')
        continue
    pkg_name, expected_version = m.group(1), m.group(2)
    key = normalize(pkg_name)

    found = by_name.get(key, [])
    if not found:
        print(f'  {pkg_name}: not present in any installed bundle (fine if nothing needs it)')
        continue

    versions = sorted({v for _, v, _ in found})
    paths = [p for _, _, p in found]
    print(f'  {pkg_name}: version(s) {versions}  ({len(found)} dist-info entr{\"y\" if len(found)==1 else \"ies\"})')

    if len(versions) > 1:
        violations.append(
            f'{pkg_name}: multiple DIFFERENT versions installed simultaneously '
            f'({versions}) -- bundles built at different times disagree, and Python '
            f'import resolution for this package is now undefined. This is the exact '
            f'failure mode that breaks a merged venv. Paths: {paths}'
        )
    elif len(found) > 1:
        violations.append(
            f'{pkg_name}: {len(found)} duplicate dist-info entries for the same '
            f'version {versions[0]} -- stale metadata left behind by an overlay '
            f'install; harmless today but worth cleaning. Paths: {paths}'
        )
    elif versions[0] != expected_version:
        violations.append(
            f'{pkg_name}: installed version {versions[0]} does not match manifest '
            f'constraint {expected_version} -- this bundle was built before the '
            f'constraint existed or changed, and needs a rebuild.'
        )

if violations:
    print()
    print('CONSTRAINT VIOLATIONS:')
    for v in violations:
        print(f'  - {v}')
    sys.exit(1)

print()
print('All constrained packages present in exactly one, correct version.')
"

if [[ $? -ne 0 ]]; then
  fail "Constrained-package consistency check failed -- see violations above" 2
fi

log "Checking ONNX Runtime flavor consistency"

"${VENV}/bin/python3" - "${SITE_PACKAGES}" <<'PYFLAVOR' || fail "ONNX Runtime flavor check failed" 2
import os, sys

sp = sys.argv[1]
names = os.listdir(sp)
cpu = sorted(n for n in names if n.startswith("onnxruntime-") and n.endswith(".dist-info"))
gpu = sorted(n for n in names if n.startswith("onnxruntime_gpu-") and n.endswith(".dist-info"))

if cpu and gpu:
    print(f"FAIL: both ONNX Runtime flavors present after layering: {cpu + gpu}. "
          "A bundle is shipping the CPU build alongside another bundle's GPU build; "
          "the merged venv's flavor then depends on install order (#490).",
          file=sys.stderr)
    sys.exit(1)

if gpu:
    cuda_lib = os.path.join(sp, "onnxruntime", "capi", "libonnxruntime_providers_cuda.so")
    if not os.path.exists(cuda_lib):
        print("FAIL: onnxruntime_gpu metadata is present but the CUDA provider library "
              "is missing: a CPU build clobbered the GPU build's files (#490).",
              file=sys.stderr)
        sys.exit(1)
    print(f"  ONNX Runtime flavor: GPU ({gpu[-1]}), CUDA provider library present")
elif cpu:
    print(f"  ONNX Runtime flavor: CPU ({cpu[-1]})")
else:
    print("  ONNX Runtime not present in any bundle")
PYFLAVOR

pass "All bundles for ${ARCH} are mutually compatible"
log "Done"
exit 0
