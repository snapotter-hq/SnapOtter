#!/usr/bin/env bash
set -euo pipefail

# Verify an immutable OCR v3 artifact on its native Linux architecture. This
# intentionally exercises the same offline installer transaction and persistent
# runtime protocol used by production; it never merges into /opt/venv.

TARGET="${1:?Usage: verify-ocr-runtime.sh <target> [full|install-smoke|memory-preflight]}"
VERIFY_MODE="${2:-full}"
ARCHIVE="/bundles/ocr-${TARGET}.tar.gz"
ARTIFACT="/bundles/ocr-${TARGET}.artifact.json"
CHECKSUM="${ARCHIVE}.sha256"
INSTALLER="/app/packages/ai/python/install_runtime.py"
DATA_DIR="/tmp/verify-ocr-data"
AI_DATA_DIR="${DATA_DIR}/ai"
INDEX="/tmp/verify-ocr-index.json"
UNSIGNED_INDEX="/tmp/verify-ocr-index.unsigned.json"
INDEX_PUBLIC_KEY_B64_FILE="/tmp/verify-ocr-index-public-key.b64"
INDEX_PRIVATE_KEY_FILE="/tmp/verify-ocr-index-private.pem"
OCR_VERIFY_TIMEOUT_SECONDS="${OCR_VERIFY_TIMEOUT_SECONDS:-1200}"
OCR_VERIFY_REPORT_DIR="${OCR_VERIFY_REPORT_DIR:-/tmp}"
OCR_VERIFY_ENVIRONMENT="${OCR_VERIFY_ENVIRONMENT:-native-cpu}"

if [[ "$(id -u)" -eq 0 ]]; then
  echo "FAIL: OCR verifier must run as an unprivileged user through the image entrypoint" >&2
  exit 2
fi
if [[ ! "${OCR_VERIFY_TIMEOUT_SECONDS}" =~ ^[1-9][0-9]*$ ]]; then
  echo "FAIL: OCR_VERIFY_TIMEOUT_SECONDS must be a positive integer" >&2
  exit 2
fi
case "${VERIFY_MODE}" in
  full | install-smoke | memory-preflight) ;;
  *)
    echo "FAIL: unsupported OCR verification mode: ${VERIFY_MODE}" >&2
    exit 2
    ;;
esac
mkdir -p "${OCR_VERIFY_REPORT_DIR}"

case "${TARGET}" in
  linux-amd64-cpu-py312)
    EXPECTED_MACHINE="x86_64"
    ;;
  linux-arm64-cpu-py311)
    EXPECTED_MACHINE="aarch64"
    ;;
  *)
    echo "FAIL: unsupported OCR runtime target: ${TARGET}" >&2
    exit 2
    ;;
esac

[[ "$(uname -s)" == "Linux" && "$(uname -m)" == "${EXPECTED_MACHINE}" ]] || {
  echo "FAIL: ${TARGET} must be verified natively on Linux/${EXPECTED_MACHINE}" >&2
  exit 2
}
for required in "${ARCHIVE}" "${ARTIFACT}" "${CHECKSUM}" "${INSTALLER}"; do
  [[ -f "${required}" && ! -L "${required}" ]] || {
    echo "FAIL: missing or linked verification input: ${required}" >&2
    exit 1
  }
done

EXPECTED_SHA="$(awk 'NF { print $1; exit }' "${CHECKSUM}")"
ACTUAL_SHA="$(sha256sum "${ARCHIVE}" | awk '{ print $1 }')"
[[ "${EXPECTED_SHA}" == "${ACTUAL_SHA}" ]] || {
  echo "FAIL: archive sidecar checksum mismatch" >&2
  exit 1
}

# Authenticate the exact build output inside the trusted workflow boundary. The
# release job later signs the combined two-target index with the repository key;
# this verifier uses an ephemeral Ed25519 identity so runtime-state exercises
# genuine signature verification without exposing the release private key.
python3 - "${ARTIFACT}" "${ARCHIVE}" "${UNSIGNED_INDEX}" "${TARGET}" <<'PY'
import hashlib
import json
import pathlib
import sys

artifact_path = pathlib.Path(sys.argv[1])
archive_path = pathlib.Path(sys.argv[2])
unsigned_index_path = pathlib.Path(sys.argv[3])
target = sys.argv[4]


def canonical(value):
    return (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()


def file_sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


raw = artifact_path.read_bytes()
artifact = json.loads(raw)
if raw != canonical(artifact):
    raise SystemExit("OCR artifact metadata is not canonical JSON")
expected_arch = "amd64" if target == "linux-amd64-cpu-py312" else "arm64"
if (
    artifact.get("family") != "ocr"
    or artifact.get("target") != target
    or artifact.get("platform") != "linux"
    or artifact.get("arch") != expected_arch
):
    raise SystemExit("OCR artifact identity does not match the native target")
if artifact.get("capabilities", {}).get("providers") != ["CPUExecutionProvider"]:
    raise SystemExit("OCR artifact must declare only CPUExecutionProvider")
resources = artifact.get("resources", {})
if (
    not isinstance(resources, dict)
    or resources.get("minimumMemoryBytes") != 4 * 1024 * 1024 * 1024
):
    raise SystemExit("OCR artifact must require exactly 4 GiB of memory")
archive = artifact.get("archive", {})
if archive.get("file") != archive_path.name:
    raise SystemExit("OCR artifact archive name mismatch")
if archive.get("size") != archive_path.stat().st_size:
    raise SystemExit("OCR artifact archive size mismatch")
if archive.get("sha256") != file_sha256(archive_path):
    raise SystemExit("OCR artifact archive digest mismatch")

unsigned_index = {
    "artifacts": [artifact],
    "schemaVersion": 1,
}
unsigned_index_path.write_bytes(canonical(unsigned_index))
PY

node --input-type=module - \
  "${UNSIGNED_INDEX}" \
  "${INDEX}" \
  "${INDEX_PUBLIC_KEY_B64_FILE}" \
  "${INDEX_PRIVATE_KEY_FILE}" <<'JS'
import { generateKeyPairSync, sign } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const [unsignedPath, indexPath, publicKeyPath, privateKeyPath] = process.argv.slice(2);

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortJson(value[key])]),
  );
}

function canonical(value) {
  return `${JSON.stringify(sortJson(value))}\n`;
}

const unsignedIndex = JSON.parse(readFileSync(unsignedPath, "utf8"));
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const signature = sign(null, Buffer.from(canonical(unsignedIndex)), privateKey).toString("base64");
const index = {
  ...unsignedIndex,
  signature: {
    algorithm: "ed25519",
    keyId: "ci-runtime-verifier",
    value: signature,
  },
};
writeFileSync(indexPath, canonical(index), { encoding: "ascii", mode: 0o600 });
writeFileSync(
  publicKeyPath,
  Buffer.from(publicKey.export({ type: "spki", format: "pem" })).toString("base64"),
  { encoding: "ascii", mode: 0o600 },
);
writeFileSync(privateKeyPath, privateKey.export({ type: "pkcs8", format: "pem" }), {
  mode: 0o600,
});
JS
INDEX_PUBLIC_KEY_PEM_B64="$(cat "${INDEX_PUBLIC_KEY_B64_FILE}")"

SMOKE_COMMAND="$(python3 - "${ARTIFACT}" <<'PY'
import json
from pathlib import Path
import sys

artifact = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
python_path = artifact["runtime"]["pythonPath"]
entrypoint = artifact["runtime"]["entrypoint"]
print(
    json.dumps(
        [f"{{runtime}}/{python_path}", f"{{runtime}}/{entrypoint}", "--smoke"],
        separators=(",", ":"),
    )
)
PY
)"

if [[ "${VERIFY_MODE}" == "memory-preflight" ]]; then
  rm -rf "${AI_DATA_DIR}"
  set +e
  PREFLIGHT_OUTPUT="$(
    SNAPOTTER_NETWORK_DISABLED=1 \
      SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0 \
      HF_HUB_OFFLINE=1 \
      TRANSFORMERS_OFFLINE=1 \
      PIP_NO_INDEX=1 \
      PYTHONNOUSERSITE=1 \
      NO_PROXY='*' \
      no_proxy='*' \
      python3 "${INSTALLER}" install \
      --ai-data-dir "${AI_DATA_DIR}" \
      --index "${INDEX}" \
      --archive "${ARCHIVE}" \
      --family ocr \
      --target "${TARGET}" \
      --expected-index-sha256 "$(sha256sum "${INDEX}" | cut -d' ' -f1)" \
      --smoke-command "${SMOKE_COMMAND}" \
      --preverified-index 2>&1
  )"
  PREFLIGHT_STATUS=$?
  set -e
  if [[ ${PREFLIGHT_STATUS} -eq 0 ]]; then
    echo "FAIL: OCR memory preflight unexpectedly accepted this cgroup" >&2
    exit 1
  fi
  [[ "${PREFLIGHT_OUTPUT}" == *"insufficient memory for accurate OCR runtime"* ]] || {
    echo "FAIL: OCR memory preflight failed for the wrong reason: ${PREFLIGHT_OUTPUT}" >&2
    exit 1
  }
  [[ ! -e "${AI_DATA_DIR}" ]] || {
    echo "FAIL: OCR memory preflight mutated runtime state before extraction" >&2
    exit 1
  }
  rm -f "${INDEX_PRIVATE_KEY_FILE}"
  echo "PASS: sub-4 GiB OCR memory preflight rejected before extraction"
  exit 0
fi

rm -rf "${AI_DATA_DIR}"
run_runtime_transaction() {
  local command_name="$1"
  local index_path="$2"
  local output_path="$3"
  SNAPOTTER_NETWORK_DISABLED=1 \
    SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0 \
    HF_HUB_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1 \
    PIP_NO_INDEX=1 \
    PYTHONNOUSERSITE=1 \
    NO_PROXY='*' \
    no_proxy='*' \
    python3 "${INSTALLER}" "${command_name}" \
    --ai-data-dir "${AI_DATA_DIR}" \
    --index "${index_path}" \
    --archive "${ARCHIVE}" \
    --family ocr \
    --target "${TARGET}" \
    --expected-index-sha256 "$(sha256sum "${index_path}" | cut -d' ' -f1)" \
    --smoke-command "${SMOKE_COMMAND}" \
    --preverified-index > "${output_path}"
}

handoff_and_commit_runtime() {
  local expected_generation="$1"
  timeout --signal=TERM --kill-after=10s "${OCR_VERIFY_TIMEOUT_SECONDS}s" \
    env AI_DATA_DIR="${AI_DATA_DIR}" DATA_DIR="${DATA_DIR}" \
    OCR_EXPECTED_GENERATION="${expected_generation}" \
    OCR_INSTALLER="${INSTALLER}" \
    OCR_RUNTIME_INDEX_KEY_ID="ci-runtime-verifier" \
    OCR_RUNTIME_INDEX_PUBLIC_KEY_PEM_B64="${INDEX_PUBLIC_KEY_PEM_B64}" \
    OCR_VERIFY_TIMEOUT_MS="$((OCR_VERIFY_TIMEOUT_SECONDS * 1000))" \
    SNAPOTTER_OFFICIAL_CONTAINER=1 \
    /app/apps/api/node_modules/.bin/tsx -e '
      import { execFile as execFileCallback } from "node:child_process";
      import { promisify } from "node:util";
      import {
        drainOcrDispatcher,
        handoffOcrDispatcher,
        probeOcrDispatcher,
      } from "/app/packages/ai/src/ocr-runtime-dispatcher.ts";
      const execFile = promisify(execFileCallback);
      const expectedGeneration = process.env.OCR_EXPECTED_GENERATION;
      const installer = process.env.OCR_INSTALLER;
      const aiDataDir = process.env.AI_DATA_DIR;
      if (!expectedGeneration || !installer || !aiDataDir) {
        throw new Error("OCR handoff verification environment is incomplete");
      }
      const runtimeOptions = {
        aiDataDir,
        timeoutMs: Number(process.env.OCR_VERIFY_TIMEOUT_MS),
      };
      void (async () => {
        try {
          const handoff = await handoffOcrDispatcher(runtimeOptions);
          if (handoff.runtime.generation !== expectedGeneration) {
            throw new Error(`Pending OCR handoff used ${handoff.runtime.generation}, expected ${expectedGeneration}`);
          }
          const { stdout } = await execFile("/usr/bin/python3", [
            installer,
            "commit",
            "--ai-data-dir",
            aiDataDir,
            "--family",
            "ocr",
            "--expected-generation",
            expectedGeneration,
          ]);
          const commit = JSON.parse(stdout);
          if (
            commit.committed !== true ||
            commit.family !== "ocr" ||
            commit.generation !== expectedGeneration
          ) {
            throw new Error(`OCR activation commit returned an invalid result: ${stdout}`);
          }
          const probe = await probeOcrDispatcher(runtimeOptions);
          if (probe.runtime.generation !== expectedGeneration) {
            throw new Error(`Committed OCR probe used ${probe.runtime.generation}, expected ${expectedGeneration}`);
          }
          process.stdout.write(`PASS: pending OCR handoff committed ${expectedGeneration}\n`);
        } finally {
          await drainOcrDispatcher();
        }
      })().catch((error) => {
        console.error(error);
        process.exitCode = 1;
      });
    '
}

# A crash after descriptor activation but before dispatcher handoff must be
# reconciled automatically. The retry then follows the real pending handoff ->
# commit -> committed probe sequence used by the API.
run_runtime_transaction install "${INDEX}" /tmp/verify-ocr-pending-crash-result.json
python3 - /tmp/verify-ocr-pending-crash-result.json "${AI_DATA_DIR}" <<'PY'
import json
import pathlib
import sys

result = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
root = pathlib.Path(sys.argv[2]) / "v3"
marker = json.loads((root / "rollback" / "ocr.json").read_text(encoding="utf-8"))
active = json.loads((root / "active" / "ocr.json").read_text(encoding="utf-8"))
if (
    result.get("activated") is not True
    or marker.get("status") != "pending"
    or marker.get("activatedGeneration") != result.get("generation")
    or active.get("generation") != result.get("generation")
):
    raise SystemExit("Installer did not leave a pending first-install activation")
PY
python3 "${INSTALLER}" reconcile --ai-data-dir "${AI_DATA_DIR}" \
  > /tmp/verify-ocr-pending-reconcile-result.json
python3 - \
  /tmp/verify-ocr-pending-crash-result.json \
  /tmp/verify-ocr-pending-reconcile-result.json \
  "${AI_DATA_DIR}" <<'PY'
import json
import pathlib
import sys

install = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
reconciled = json.loads(pathlib.Path(sys.argv[2]).read_text(encoding="utf-8"))
root = pathlib.Path(sys.argv[3]) / "v3"
if reconciled != {"restored": {"ocr": None}}:
    raise SystemExit(f"Pending first-install reconciliation was incomplete: {reconciled!r}")
if (root / "active" / "ocr.json").exists() or (root / "rollback" / "ocr.json").exists():
    raise SystemExit("Pending first-install reconciliation retained activation state")
if pathlib.Path(install["generationRoot"]).exists():
    raise SystemExit("Pending first-install reconciliation retained the rejected generation")
PY

run_runtime_transaction install "${INDEX}" /tmp/verify-ocr-install-result.json
FIRST_GENERATION="$(python3 - /tmp/verify-ocr-install-result.json <<'PY'
import json
import pathlib
import sys

print(json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))["generation"])
PY
)"
handoff_and_commit_runtime "${FIRST_GENERATION}"
python3 - "${AI_DATA_DIR}" "${FIRST_GENERATION}" <<'PY'
import json
import pathlib
import sys

marker = json.loads(
    (pathlib.Path(sys.argv[1]) / "v3" / "rollback" / "ocr.json").read_text(
        encoding="utf-8"
    )
)
if marker.get("status") != "committed" or marker.get("activatedGeneration") != sys.argv[2]:
    raise SystemExit("OCR activation was not committed after its dispatcher handoff")
PY

# A lost commit response followed by rollback must resolve to the exact committed
# generation without reverting it.
python3 "${INSTALLER}" rollback --ai-data-dir "${AI_DATA_DIR}" --family ocr \
  --expected-generation "${FIRST_GENERATION}" \
  > /tmp/verify-ocr-committed-resolution.json
python3 - /tmp/verify-ocr-committed-resolution.json "${FIRST_GENERATION}" <<'PY'
import json
import pathlib
import sys

resolution = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
if resolution != {
    "family": "ocr",
    "failedGeneration": sys.argv[2],
    "committed": True,
    "committedGeneration": sys.argv[2],
    "restoredGeneration": None,
}:
    raise SystemExit(f"Committed rollback resolution was ambiguous: {resolution!r}")
PY

# A second identical install must be a no-op: no descriptor rewrite, duplicate
# generation, cache growth, or misleading activation result.
ACTIVE_BEFORE_SECOND="$(sha256sum "${AI_DATA_DIR}/v3/active/ocr.json" | cut -d' ' -f1)"
BYTES_BEFORE_SECOND="$(du -sb "${AI_DATA_DIR}/v3" | cut -f1)"
run_runtime_transaction install "${INDEX}" /tmp/verify-ocr-second-install-result.json
python3 - /tmp/verify-ocr-second-install-result.json <<'PY'
import json
import pathlib
import sys

result = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
if result.get("activated") is not False:
    raise SystemExit("Second OCR install was not idempotent")
PY
[[ "$(sha256sum "${AI_DATA_DIR}/v3/active/ocr.json" | cut -d' ' -f1)" == "${ACTIVE_BEFORE_SECOND}" ]] || {
  echo "FAIL: second OCR install rewrote the active descriptor" >&2
  exit 1
}
[[ "$(du -sb "${AI_DATA_DIR}/v3" | cut -f1)" == "${BYTES_BEFORE_SECOND}" ]] || {
  echo "FAIL: second OCR install grew the runtime state" >&2
  exit 1
}

if [[ "${VERIFY_MODE}" == "install-smoke" ]]; then
  python3 "${INSTALLER}" reset --ai-data-dir "${AI_DATA_DIR}" \
    > /tmp/verify-ocr-install-smoke-reset-result.json
  python3 - \
    /tmp/verify-ocr-install-smoke-reset-result.json \
    /tmp/verify-ocr-install-result.json \
    "${AI_DATA_DIR}" <<'PY'
import json
import pathlib
import sys

reset = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
install = json.loads(pathlib.Path(sys.argv[2]).read_text(encoding="utf-8"))
root = pathlib.Path(sys.argv[3]) / "v3"
if reset != {"deactivatedFamilies": 1}:
    raise SystemExit(f"OCR install-smoke reset returned an invalid result: {reset!r}")
if (root / "active" / "ocr.json").exists() or (root / "rollback" / "ocr.json").exists():
    raise SystemExit("OCR install-smoke reset retained activation state")
if pathlib.Path(install["generationRoot"]).exists():
    raise SystemExit("OCR install-smoke reset retained the installed generation")
PY
  rm -f "${INDEX_PRIVATE_KEY_FILE}"
  echo "PASS: OCR signed install smoke lifecycle"
  exit 0
fi

# Activate an immutable clone under a distinct generation, then simulate a
# sidecar handoff failure and prove the transaction restores the prior descriptor
# byte-for-byte while collecting only the rejected generation.
UPGRADE_UNSIGNED="/tmp/verify-ocr-upgrade.unsigned.json"
UPGRADE_INDEX="/tmp/verify-ocr-upgrade.json"
UPGRADE_GENERATION_FILE="/tmp/verify-ocr-upgrade-generation"
python3 - "${ARTIFACT}" "${UPGRADE_UNSIGNED}" "${UPGRADE_GENERATION_FILE}" <<'PY'
import json
import pathlib
import sys

artifact = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
artifact["generation"] = f"{artifact['generation']}-handoff-test"
unsigned = {"artifacts": [artifact], "schemaVersion": 1}
canonical = (json.dumps(unsigned, sort_keys=True, separators=(",", ":")) + "\n").encode()
pathlib.Path(sys.argv[2]).write_bytes(canonical)
pathlib.Path(sys.argv[3]).write_text(artifact["generation"], encoding="ascii")
PY
node --input-type=module - \
  "${UPGRADE_UNSIGNED}" "${UPGRADE_INDEX}" "${INDEX_PRIVATE_KEY_FILE}" <<'JS'
import { createPrivateKey, sign } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const [unsignedPath, indexPath, privateKeyPath] = process.argv.slice(2);
const unsignedBytes = readFileSync(unsignedPath);
const unsigned = JSON.parse(unsignedBytes);
const signature = sign(null, unsignedBytes, createPrivateKey(readFileSync(privateKeyPath))).toString(
  "base64",
);
const sealed = {
  ...unsigned,
  signature: { algorithm: "ed25519", keyId: "ci-runtime-verifier", value: signature },
};
const sortJson = (value) =>
  Array.isArray(value)
    ? value.map(sortJson)
    : typeof value === "object" && value !== null
      ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortJson(value[key])]))
      : value;
writeFileSync(indexPath, `${JSON.stringify(sortJson(sealed))}\n`, { encoding: "ascii", mode: 0o600 });
JS
UPGRADE_GENERATION="$(cat "${UPGRADE_GENERATION_FILE}")"
run_runtime_transaction install "${UPGRADE_INDEX}" /tmp/verify-ocr-upgrade-result.json
python3 "${INSTALLER}" rollback --ai-data-dir "${AI_DATA_DIR}" --family ocr \
  --expected-generation "${UPGRADE_GENERATION}" > /tmp/verify-ocr-rollback-result.json
python3 - \
  /tmp/verify-ocr-rollback-result.json \
  "${UPGRADE_GENERATION}" \
  "${FIRST_GENERATION}" <<'PY'
import json
import pathlib
import sys

resolution = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
if resolution != {
    "family": "ocr",
    "failedGeneration": sys.argv[2],
    "committed": False,
    "committedGeneration": None,
    "restoredGeneration": sys.argv[3],
}:
    raise SystemExit(f"Pending upgrade rollback returned an invalid resolution: {resolution!r}")
PY
[[ "$(sha256sum "${AI_DATA_DIR}/v3/active/ocr.json" | cut -d' ' -f1)" == "${ACTIVE_BEFORE_SECOND}" ]] || {
  echo "FAIL: failed OCR handoff did not restore the prior descriptor exactly" >&2
  exit 1
}
if find "${AI_DATA_DIR}/v3/runtimes/ocr/${TARGET}" -mindepth 1 -maxdepth 1 \
  -type d -name "${UPGRADE_GENERATION}" -print -quit | grep -q .; then
  echo "FAIL: rejected OCR handoff generation survived rollback GC" >&2
  exit 1
fi

# Seal a second distinct generation for the live two-runtime rotation exercised
# after the native quality matrix has created its 40 MP in-flight fixture.
ROTATION_UNSIGNED="/tmp/verify-ocr-rotation.unsigned.json"
ROTATION_INDEX="/tmp/verify-ocr-rotation.json"
ROTATION_GENERATION_FILE="/tmp/verify-ocr-rotation-generation"
python3 - "${ARTIFACT}" "${ROTATION_UNSIGNED}" "${ROTATION_GENERATION_FILE}" <<'PY'
import json
import pathlib
import sys

artifact = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
artifact["generation"] = f"{artifact['generation']}-rotation-test"
unsigned = {"artifacts": [artifact], "schemaVersion": 1}
canonical = (json.dumps(unsigned, sort_keys=True, separators=(",", ":")) + "\n").encode()
pathlib.Path(sys.argv[2]).write_bytes(canonical)
pathlib.Path(sys.argv[3]).write_text(artifact["generation"], encoding="ascii")
PY
node --input-type=module - \
  "${ROTATION_UNSIGNED}" "${ROTATION_INDEX}" "${INDEX_PRIVATE_KEY_FILE}" <<'JS'
import { createPrivateKey, sign } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const [unsignedPath, indexPath, privateKeyPath] = process.argv.slice(2);
const unsignedBytes = readFileSync(unsignedPath);
const unsigned = JSON.parse(unsignedBytes);
const signature = sign(null, unsignedBytes, createPrivateKey(readFileSync(privateKeyPath))).toString(
  "base64",
);
const sealed = {
  ...unsigned,
  signature: { algorithm: "ed25519", keyId: "ci-runtime-verifier", value: signature },
};
const sortJson = (value) =>
  Array.isArray(value)
    ? value.map(sortJson)
    : typeof value === "object" && value !== null
      ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortJson(value[key])]))
      : value;
writeFileSync(indexPath, `${JSON.stringify(sortJson(sealed))}\n`, { encoding: "ascii", mode: 0o600 });
JS
ROTATION_GENERATION="$(cat "${ROTATION_GENERATION_FILE}")"
ROTATION_INDEX_SHA="$(sha256sum "${ROTATION_INDEX}" | cut -d' ' -f1)"

readarray -t RUNTIME_PATHS < <(python3 - "${ARTIFACT}" "${AI_DATA_DIR}" <<'PY'
import json
import pathlib
import sys

artifact = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
active = json.loads(
    (pathlib.Path(sys.argv[2]) / "v3" / "active" / "ocr.json").read_text(encoding="utf-8")
)
root = pathlib.Path(sys.argv[2]) / "v3" / "runtimes" / "ocr" / artifact["target"] / active["generation"]
print(root)
print(root / artifact["runtime"]["pythonPath"])
print(root / artifact["runtime"]["entrypoint"])
print(artifact["version"])
print(artifact["archive"]["sha256"])
print(json.dumps(artifact["models"], sort_keys=True, separators=(",", ":")))
PY
)
RUNTIME_ROOT="${RUNTIME_PATHS[0]}"
RUNTIME_PYTHON="${RUNTIME_PATHS[1]}"
RUNTIME_ENTRYPOINT="${RUNTIME_PATHS[2]}"
ARTIFACT_VERSION="${RUNTIME_PATHS[3]}"
ARTIFACT_SHA="${RUNTIME_PATHS[4]}"
MODEL_DIGESTS="${RUNTIME_PATHS[5]}"

# Capture every heldout Fast result through the exact application path before
# the native Python matrix consumes it. This covers Sharp normalization,
# bounded adaptive Tesseract selection, metadata, and scratch cleanup rather
# than substituting a direct tesseract command in the release gate.
FAST_REAL_RESULTS="${OCR_VERIFY_REPORT_DIR}/ocr-${TARGET}-${OCR_VERIFY_ENVIRONMENT}.fast-real.json"
rm -f "${FAST_REAL_RESULTS}"
echo "INFO: Fast real OCR evidence: ${FAST_REAL_RESULTS}"
timeout --signal=TERM --kill-after=10s "${OCR_VERIFY_TIMEOUT_SECONDS}s" \
  env HF_HUB_OFFLINE=1 NO_PROXY='*' SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0 \
  SNAPOTTER_FAST_REAL_RESULTS="${FAST_REAL_RESULTS}" \
  SNAPOTTER_NETWORK_DISABLED=1 TESSERACT_PATH=/usr/bin/tesseract \
  TRANSFORMERS_OFFLINE=1 no_proxy='*' \
  /app/apps/api/node_modules/.bin/tsx -e '
    import { access, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
    import { join, resolve } from "node:path";
    import {
      extractText,
      FAST_KOREAN_UNSUPPORTED_REASON,
    } from "/app/packages/ai/src/ocr.ts";
    const main = async () => {
    const root = "/fixtures/ocr-real";
    const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
    const selectors = { en: "en", id: "auto", ja: "ja", ko: "ko" };
    const expectedFixtureIds = new Set([
      "jawildtext-board-0001",
      "jawildtext-board-0049",
      "jawildtext-board-0127",
      "commons-hagye-station-715",
      "jawildtext-receipt-11120",
      "cord-v2-test-0080",
      "clinocr-poor-t7-s2",
    ]);
    const fixtureIds = (manifest.fixtures ?? []).map((fixture) => fixture?.id);
    if (
      fixtureIds.length !== expectedFixtureIds.size ||
      new Set(fixtureIds).size !== expectedFixtureIds.size ||
      fixtureIds.some((fixtureId) => !expectedFixtureIds.has(fixtureId))
    ) {
      throw new Error("Fast OCR manifest fixture set drifted");
    }
    const resultsPath = process.env.SNAPOTTER_FAST_REAL_RESULTS;
    if (!resultsPath) throw new Error("Fast OCR results path is missing");
    const koreanTesseractSentinelPath = "/tmp/verify-ocr-korean-tesseract-sentinel.sh";
    const koreanTesseractMarkerPath = "/tmp/verify-ocr-korean-tesseract-spawned";
    await rm(koreanTesseractSentinelPath, { force: true });
    await rm(koreanTesseractMarkerPath, { force: true });
    await writeFile(
      koreanTesseractSentinelPath,
      "#!/bin/sh\n: > /tmp/verify-ocr-korean-tesseract-spawned\nexit 97\n",
      { encoding: "utf8", mode: 0o700 },
    );
    const koreanTesseractWasSpawned = async () => {
      try {
        await access(koreanTesseractMarkerPath);
        return true;
      } catch (error) {
        if (error && typeof error === "object" && error.code === "ENOENT") return false;
        throw error;
      }
    };
    const records = {};
    const persistFastRealResults = async () => {
      const temporaryPath = `${resultsPath}.tmp`;
      await writeFile(temporaryPath, `${JSON.stringify(records)}\n`, {
        encoding: "utf8",
        mode: 0o600,
      });
      await rename(temporaryPath, resultsPath);
    };
    for (const fixture of manifest.fixtures ?? []) {
      if (!fixture || typeof fixture !== "object" || !/^[a-z0-9-]+$/.test(fixture.id)) {
        throw new Error("Malformed Fast OCR fixture identity");
      }
      const language = selectors[fixture.language];
      let result;
      let scratch;
      try {
        const imagePath = resolve(root, String(fixture.image?.path ?? ""));
        if (!imagePath.startsWith(`${root}/`)) throw new Error("Unsafe Fast OCR fixture path");
        if (!language) {
          throw new Error(`Unsupported Fast OCR fixture language: ${fixture.language}`);
        }
        scratch = await mkdtemp("/tmp/verify-ocr-fast-real-");
        const image = await readFile(imagePath);
        if (fixture.id === "commons-hagye-station-715") {
          const originalTesseractPath = process.env.TESSERACT_PATH;
          let rejectionMessage;
          try {
            process.env.TESSERACT_PATH = koreanTesseractSentinelPath;
            try {
              await extractText(image, scratch, { quality: "fast", language: "ko" });
            } catch (error) {
              rejectionMessage = error instanceof Error ? error.message : String(error);
            }
          } finally {
            if (originalTesseractPath === undefined) delete process.env.TESSERACT_PATH;
            else process.env.TESSERACT_PATH = originalTesseractPath;
          }
          const tesseractSpawned = await koreanTesseractWasSpawned();
          if (rejectionMessage !== FAST_KOREAN_UNSUPPORTED_REASON || tesseractSpawned) {
            throw new Error(
              `Korean Fast OCR decision was not enforced before Tesseract spawn: ` +
                `${JSON.stringify({ rejectionMessage, tesseractSpawned })}`,
            );
          }
          records[fixture.id] = {
            decisionEnforced: true,
            fixtureId: fixture.id,
            language: "ko",
            releaseGatePassed: null,
            releaseGateStatus: "unsupported-by-design",
            supported: false,
            tesseractSpawned: false,
            unsupportedReason: FAST_KOREAN_UNSUPPORTED_REASON,
          };
          await persistFastRealResults();
          continue;
        }
        result = await extractText(image, scratch, { quality: "fast", language });
        if (
          result.engine !== "tesseract" ||
          result.provider !== "native" ||
          result.device !== "cpu" ||
          result.requestedQuality !== "fast" ||
          result.actualQuality !== "fast" ||
          result.degraded !== false ||
          typeof result.text !== "string" ||
          Buffer.byteLength(result.text, "utf8") > 1_000_000 ||
          !Array.isArray(result.warnings) ||
          !result.warnings.every((warning) => typeof warning === "string")
        ) {
          throw new Error(`Fast OCR application metadata drifted: ${fixture.id}`);
        }
        records[fixture.id] = result;
        await persistFastRealResults();
      } catch (error) {
        records[fixture.id] = {
          ...(result && typeof result === "object" ? result : {}),
          fixtureId: fixture.id,
          language: language ?? String(fixture.language ?? ""),
          verificationError: error instanceof Error ? error.message : String(error),
        };
        await persistFastRealResults();
        throw error;
      } finally {
        if (scratch) await rm(scratch, { force: true, recursive: true });
      }
    }
    await rm(koreanTesseractSentinelPath, { force: true });
    await rm(koreanTesseractMarkerPath, { force: true });
    const recordIds = Object.keys(records);
    if (
      recordIds.length !== expectedFixtureIds.size ||
      recordIds.some((fixtureId) => !expectedFixtureIds.has(fixtureId))
    ) {
      throw new Error("Fast OCR fixture set drifted");
    }
    await persistFastRealResults();
    };
    main().catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
  '
[[ -f "${FAST_REAL_RESULTS}" && ! -L "${FAST_REAL_RESULTS}" ]] || {
  echo "FAIL: exact application Fast OCR report is missing" >&2
  exit 1
}

# Run a deterministic native quality matrix inside the exact installed runtime.
# Reusing one OcrRuntime instance makes the matrix practical on arm64 while still
# loading every small/medium unified/Korean session exercised by production Best.
timeout --signal=TERM --kill-after=10s "${OCR_VERIFY_TIMEOUT_SECONDS}s" env -i \
  CUDA_VISIBLE_DEVICES="${CUDA_VISIBLE_DEVICES:-}" \
  LANG=C.UTF-8 \
  HF_HUB_OFFLINE=1 \
  NVIDIA_VISIBLE_DEVICES="${NVIDIA_VISIBLE_DEVICES:-none}" \
  NO_PROXY='*' \
  PIP_NO_INDEX=1 \
  PYTHONDONTWRITEBYTECODE=1 \
  PYTHONUNBUFFERED=1 \
  PYTHONNOUSERSITE=1 \
  SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0 \
  SNAPOTTER_NETWORK_DISABLED=1 \
  SNAPOTTER_OCR_ARTIFACT_SHA256="${ARTIFACT_SHA}" \
  SNAPOTTER_OCR_ARTIFACT_VERSION="${ARTIFACT_VERSION}" \
  SNAPOTTER_OCR_MODELS_JSON="${MODEL_DIGESTS}" \
  SNAPOTTER_OCR_PROTOCOL_VERSION=1 \
  SNAPOTTER_OCR_PROVIDERS_JSON="[\"CPUExecutionProvider\"]" \
  SNAPOTTER_OCR_RUNTIME_TARGET="${TARGET}" \
  SNAPOTTER_OCR_VERIFY_ENVIRONMENT="${OCR_VERIFY_ENVIRONMENT}" \
  SNAPOTTER_OCR_VERIFY_REPORT="${OCR_VERIFY_REPORT_DIR}/ocr-${TARGET}-${OCR_VERIFY_ENVIRONMENT}.quality.json" \
  SNAPOTTER_FAST_REAL_RESULTS="${FAST_REAL_RESULTS}" \
  SNAPOTTER_RUNTIME_ROOT="${RUNTIME_ROOT}" \
  TRANSFORMERS_OFFLINE=1 \
  no_proxy='*' \
  "${RUNTIME_PYTHON}" - <<'PY'
import atexit
from collections import Counter
import hashlib
import json
import math
import os
import random
import re
import resource
import sys
import time
import unicodedata
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

runtime_root = Path(os.environ["SNAPOTTER_RUNTIME_ROOT"])
sys.path.insert(0, str(runtime_root))
from ocr_runtime import (  # noqa: E402
    DETECTOR_TILE_OVERLAP,
    MAX_DETECTOR_TILE_SIDE,
    OcrRuntime,
)


BEST_REGRESSION_TOLERANCE = 0.02
GRAPHEME_EXTEND = frozenset(("\u200c", "\u200d", "\ufe0e", "\ufe0f"))
MINIMUM_MEMORY_BYTES = 4 * 1024 * 1024 * 1024
WORD_SEGMENTED_LANGUAGES = frozenset(("auto", "de", "en", "es", "fr", "ko"))
REAL_FIXTURE_ROOT = Path("/fixtures/ocr-real")
REAL_FIXTURE_MANIFEST = REAL_FIXTURE_ROOT / "manifest.json"
REAL_FIXTURE_MANIFEST_SHA256 = "979c2ce9fbae524a2627e3b12ba785d5f3c2d73b2c372d486e66f7a1fd248f5f"
REAL_CORPUS_HELD_OUT_POLICY = (
    "These files are regression inputs only and must not be used to tune OCR models "
    "or acceptance thresholds after observing their outputs."
)
REAL_CORPUS_QUALITIES = ("fast", "balanced", "best")
REAL_CORPUS_EXPECTED = {
    "jawildtext-board-0001": ("board-or-sign", "ja", "annotation-token-coverage"),
    "jawildtext-board-0049": ("board-or-sign", "ja", "annotation-token-coverage"),
    "jawildtext-board-0127": ("board-or-sign", "ja", "annotation-token-coverage"),
    "commons-hagye-station-715": (
        "board-or-sign",
        "ko",
        "annotation-token-coverage",
    ),
    "jawildtext-receipt-11120": (
        "mobile-receipt",
        "ja",
        "annotation-token-coverage",
    ),
    "cord-v2-test-0080": ("mobile-receipt", "id", "annotation-token-coverage"),
    "clinocr-poor-t7-s2": ("photographed-form", "en", "page-transcript"),
}
REAL_BOARD_COHORT_EXPECTED = {
    "distinctRowGroups": [0, 1, 3],
    "fixtureIds": [
        "jawildtext-board-0001",
        "jawildtext-board-0049",
        "jawildtext-board-0127",
    ],
    "perImageFastFloor": {
        "minimumTokenF1": 0.32,
        "minimumTokenPrecision": 0.50,
        "minimumTokenRecall": 0.25,
    },
    "selectionRule": (
        "The smallest byte-for-byte source image in each of row groups 0, 1, and 3; "
        "image-only visual/privacy review confirmed distinct conditions and safe public content."
    ),
    "selectionStatus": "FROZEN_BEFORE_ANY_OCR_OUTPUT",
    "stopPolicy": (
        "If any frozen cohort image fails after the general development-corpus fix, "
        "stop rotating fixtures and reconsider the Fast CJK architecture."
    ),
}
REAL_KOREAN_COHORT_EXPECTED = {
    "fastDisposition": {
        "accurateTierResults": {
            "balanced": {
                "releaseGatePassed": True,
                "tokenF1": 0.692308,
                "tokenPrecision": 0.9,
                "tokenRecall": 0.5625,
            },
            "best": {
                "releaseGatePassed": True,
                "tokenF1": 0.692308,
                "tokenPrecision": 0.9,
                "tokenRecall": 0.5625,
            },
        },
        "boundedStrategyAudit": {
            "diagnosticManifestSha256": "8e82e22b5d939ca40e97d8a74e8ce73dda451e99ba8b33a95a94723c4679d1b4",
            "failed": 6,
            "tested": 6,
        },
        "decision": {
            "enforcedBehavior": "reject-before-tesseract-spawn",
            "unsupportedReason": (
                "Fast OCR does not support Korean. Install the Accurate OCR bundle "
                "and choose Balanced or Best."
            ),
        },
        "evidence": {
            "artifactSha256": "42b9609dab9b8680c208d4b20828314ce912f3691bbd12114b31ab31b4cfbd05",
            "fastReportSha256": "0a9743c46e67aad7948d5a5880bfbd5096a4023c6006de5f94668580a2df276a",
            "fastText": "=\n< 하 계\n: Hagye 최\nㅜㅠ 좋\n==",
            "fastTextSha256": "6ddecdd52dd0a66074fb3c1d003a28493975f63421f70600706ccc01b7bb2c73",
            "qualityCheckpointSha256": "41e4c01959602c3c255c09210fd3203ab80eee696bf28578d1137bf07f38bab7",
            "sourceImageId": "sha256:127753b7916aea38eac139a4070af95854ccdc68f93a9c4d59618c7e8c7f4bfa",
            "verifierSha256": "d4f9e3c1572c7eba4f5157c2a70785233ceed0296cb734a50890e940d16dd2cf",
        },
        "fastResult": {
            "releaseGatePassed": False,
            "tokenF1": 0.214286,
            "tokenPrecision": 0.25,
            "tokenRecall": 0.1875,
        },
        "status": "REJECTED_AFTER_FROZEN_GATE",
    },
    "fixtureIds": ["commons-hagye-station-715"],
    "perImageTierFloors": {
        "balanced": {
            "minimumTokenF1": 0.56,
            "minimumTokenPrecision": 0.65,
            "minimumTokenRecall": 0.50,
        },
        "best": {
            "minimumTokenF1": 0.60,
            "minimumTokenPrecision": 0.68,
            "minimumTokenRecall": 0.55,
        },
        "fast": {
            "minimumTokenF1": 0.32,
            "minimumTokenPrecision": 0.50,
            "minimumTokenRecall": 0.25,
        },
    },
    "selectionRule": (
        "On 2026-07-13, enumerate original bitmap files in Wikimedia Commons "
        "Category:Train station signs of Seoul Subway Line 7, sort by byte size "
        "ascending, retain public-domain landscape photographs at least 500×400 "
        "with no people or private data and manually legible Hangul, Latin, and "
        "Arabic digits, then choose the smallest. Hagye01.jpg is the first eligible "
        "file; the smaller public-domain Junggokst01.jpg is only 411×308."
    ),
    "selectionStatus": "FROZEN_BEFORE_ANY_OCR_OUTPUT",
    "stopPolicy": (
        "If the frozen Korean fixture fails, do not swap or edit the fixture, "
        "transcript, or limits; reconsider the Korean Fast model."
    ),
}
REAL_KOREAN_GROUND_TRUTH_EXPECTED = (
    "715\n"
    "중계\n"
    "Junggye\n"
    "中溪\n"
    "하계\n"
    "Hagye\n"
    "下溪\n"
    "공릉\n"
    "Gongneung\n"
    "孔陵"
)
REAL_CORPUS_SELECTORS = {"en": "en", "id": "auto", "ja": "ja", "ko": "ko"}
# A-priori release floors. Polygon datasets lack canonical reading order, so
# they block on multiset token recall/precision/F1. The audited form transcript
# blocks on ordered grapheme CER/WER. Accurate tiers are intentionally stricter
# than Fast; held-out outputs must never redefine these thresholds.
REAL_CORPUS_LIMITS = {
    ("board-or-sign", "ja", "fast"): {
        "minimumTokenRecall": 0.25,
        "minimumTokenPrecision": 0.50,
        "minimumTokenF1": 0.32,
    },
    ("board-or-sign", "ja", "balanced"): {
        "minimumTokenRecall": 0.50,
        "minimumTokenPrecision": 0.65,
        "minimumTokenF1": 0.56,
    },
    ("board-or-sign", "ja", "best"): {
        "minimumTokenRecall": 0.55,
        "minimumTokenPrecision": 0.68,
        "minimumTokenF1": 0.60,
    },
    ("board-or-sign", "ko", "fast"): {
        "minimumTokenRecall": 0.25,
        "minimumTokenPrecision": 0.50,
        "minimumTokenF1": 0.32,
    },
    ("board-or-sign", "ko", "balanced"): {
        "minimumTokenRecall": 0.50,
        "minimumTokenPrecision": 0.65,
        "minimumTokenF1": 0.56,
    },
    ("board-or-sign", "ko", "best"): {
        "minimumTokenRecall": 0.55,
        "minimumTokenPrecision": 0.68,
        "minimumTokenF1": 0.60,
    },
    ("mobile-receipt", "ja", "fast"): {
        "minimumTokenRecall": 0.30,
        "minimumTokenPrecision": 0.55,
        "minimumTokenF1": 0.38,
    },
    ("mobile-receipt", "ja", "balanced"): {
        "minimumTokenRecall": 0.60,
        "minimumTokenPrecision": 0.70,
        "minimumTokenF1": 0.64,
    },
    ("mobile-receipt", "ja", "best"): {
        "minimumTokenRecall": 0.65,
        "minimumTokenPrecision": 0.74,
        "minimumTokenF1": 0.68,
    },
    ("mobile-receipt", "id", "fast"): {
        "minimumTokenRecall": 0.50,
        "minimumTokenPrecision": 0.50,
        "minimumTokenF1": 0.50,
    },
    ("mobile-receipt", "id", "balanced"): {
        "minimumTokenRecall": 0.70,
        "minimumTokenPrecision": 0.65,
        "minimumTokenF1": 0.68,
    },
    ("mobile-receipt", "id", "best"): {
        "minimumTokenRecall": 0.75,
        "minimumTokenPrecision": 0.68,
        "minimumTokenF1": 0.71,
    },
    ("photographed-form", "en", "fast"): {
        "maximumGraphemeCer": 0.50,
        "maximumWordErrorRate": 0.65,
    },
    ("photographed-form", "en", "balanced"): {
        "maximumGraphemeCer": 0.28,
        "maximumWordErrorRate": 0.40,
    },
    ("photographed-form", "en", "best"): {
        "maximumGraphemeCer": 0.24,
        "maximumWordErrorRate": 0.36,
    },
}
quality_report = {
    "schemaVersion": 1,
    "target": os.environ["SNAPOTTER_OCR_RUNTIME_TARGET"],
    "environment": os.environ["SNAPOTTER_OCR_VERIFY_ENVIRONMENT"],
    "provider": "CPUExecutionProvider",
    "minimumMemoryBytes": MINIMUM_MEMORY_BYTES,
    "cases": [],
    "memoryCheckpoints": [],
}


def read_cgroup_peak_bytes():
    for path in (
        Path("/sys/fs/cgroup/memory.peak"),
        Path("/sys/fs/cgroup/memory/memory.max_usage_in_bytes"),
        Path("/sys/fs/cgroup/memory.max_usage_in_bytes"),
    ):
        try:
            value = path.read_text(encoding="ascii").strip()
            if value.isdigit():
                return int(value)
        except OSError:
            pass
    return None


def read_cgroup_current_bytes():
    for path in (
        Path("/sys/fs/cgroup/memory.current"),
        Path("/sys/fs/cgroup/memory/memory.usage_in_bytes"),
        Path("/sys/fs/cgroup/memory.usage_in_bytes"),
    ):
        try:
            value = path.read_text(encoding="ascii").strip()
            if value.isdigit():
                return int(value)
        except OSError:
            pass
    return None


def read_cgroup_limit_bytes():
    for path in (
        Path("/sys/fs/cgroup/memory.max"),
        Path("/sys/fs/cgroup/memory/memory.limit_in_bytes"),
        Path("/sys/fs/cgroup/memory.limit_in_bytes"),
    ):
        try:
            value = path.read_text(encoding="ascii").strip()
            if value.isdigit():
                return int(value)
        except OSError:
            pass
    return None


def record_memory_checkpoint(label):
    quality_report["memoryCheckpoints"].append(
        {
            "label": label,
            "processMaxRssKiB": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
            "cgroupCurrentBytes": read_cgroup_current_bytes(),
        }
    )


def write_quality_report():
    quality_report["catastrophicFailureCount"] = sum(
        bool(case.get("catastrophicFailure")) for case in quality_report["cases"]
    )
    quality_report["insertionCount"] = sum(
        int(case.get("insertionCount", 0)) for case in quality_report["cases"]
    )
    quality_report["hallucinatedInsertionCount"] = sum(
        int(case.get("insertionCount", 0))
        for case in quality_report["cases"]
        if case.get("expectedGraphemes") == 0
    )
    quality_report["processMaxRssKiB"] = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    quality_report["cgroupMemoryPeakBytes"] = read_cgroup_peak_bytes()
    quality_report["cgroupMemoryLimitBytes"] = read_cgroup_limit_bytes()
    destination = Path(os.environ["SNAPOTTER_OCR_VERIFY_REPORT"])
    destination.write_text(
        json.dumps(quality_report, sort_keys=True, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )


atexit.register(write_quality_report)
FIXTURE_CASES = (
    (
        "clean-auto",
        Path("/fixtures/image/valid/ocr-clean.png"),
        "The quick brown fox 12345",
        "auto",
        0.12,
    ),
    (
        "chat",
        Path("/fixtures/image/valid/ocr-chat.jpeg"),
        (
            "Chat Hi there! How are you? I am doing great, thanks! "
            "How can I help you today? I need to convert some files. "
            "Can SnapOtter do that? Of course! SnapOtter supports over 150 conversion tools."
        ),
        "en",
        0.35,
    ),
    (
        "japanese",
        Path("/fixtures/image/valid/ocr-japanese.png"),
        (
            "日本語の表記においては，漢字や仮名だけでなく，ローマ字やアラビア数字，"
            "さらに句読点や括弧類などの記述記号を用いる。これらを組み合わせて表す"
            "日本語の文書では，表記上における種々の問題がある。"
        ),
        "ja",
        0.30,
    ),
)


def normalized_text(value):
    normalized = unicodedata.normalize("NFKC", str(value)).casefold()
    return "".join(character for character in normalized if character.isalnum())


def raw_text(value):
    normalized = unicodedata.normalize("NFKC", str(value)).casefold()
    return " ".join(normalized.split())


def split_grapheme_clusters(text):
    """Split normalized text into extended-enough graphemes without a new dependency."""
    clusters = []
    regional_run = 0
    for character in text:
        codepoint = ord(character)
        combining = bool(unicodedata.combining(character)) or unicodedata.category(character) in (
            "Mc",
            "Me",
        )
        variation_or_joiner = character in GRAPHEME_EXTEND
        emoji_modifier = 0x1F3FB <= codepoint <= 0x1F3FF
        regional_indicator = 0x1F1E6 <= codepoint <= 0x1F1FF
        follows_joiner = bool(clusters and clusters[-1].endswith("\u200d"))
        joins_regional_pair = regional_indicator and regional_run % 2 == 1
        if clusters and (combining or variation_or_joiner or emoji_modifier or follows_joiner or joins_regional_pair):
            clusters[-1] += character
        else:
            clusters.append(character)
        regional_run = regional_run + 1 if regional_indicator else 0
    return tuple(clusters)


def grapheme_clusters(value):
    return split_grapheme_clusters(unicodedata.normalize("NFC", raw_text(value)))


def word_tokens(value):
    return tuple(token for token in re.split(r"\s+", raw_text(value)) if token)


def edit_counts(actual, expected):
    """Return Levenshtein counts in expected-to-actual direction."""
    actual = tuple(actual)
    expected = tuple(expected)
    previous = [(column, column, 0, 0) for column in range(len(actual) + 1)]
    for expected_index, expected_item in enumerate(expected, start=1):
        current = [(expected_index, 0, expected_index, 0)]
        for actual_index, actual_item in enumerate(actual, start=1):
            if expected_item == actual_item:
                diagonal = previous[actual_index - 1]
            else:
                distance, insertions, deletions, substitutions = previous[actual_index - 1]
                diagonal = (distance + 1, insertions, deletions, substitutions + 1)
            distance, insertions, deletions, substitutions = current[-1]
            insertion = (distance + 1, insertions + 1, deletions, substitutions)
            distance, insertions, deletions, substitutions = previous[actual_index]
            deletion = (distance + 1, insertions, deletions + 1, substitutions)
            current.append(min((diagonal, insertion, deletion), key=lambda item: item))
        previous = current
    distance, insertions, deletions, substitutions = previous[-1]
    return {
        "distance": distance,
        "insertions": insertions,
        "deletions": deletions,
        "substitutions": substitutions,
    }


def text_quality_metrics(actual, expected, language):
    actual_graphemes = grapheme_clusters(actual)
    expected_graphemes = grapheme_clusters(expected)
    grapheme_counts = edit_counts(actual_graphemes, expected_graphemes)
    grapheme_cer = grapheme_counts["distance"] / max(len(expected_graphemes), 1)
    if language in WORD_SEGMENTED_LANGUAGES:
        actual_words = word_tokens(actual)
        expected_words = word_tokens(expected)
        word_counts = edit_counts(actual_words, expected_words)
        word_error_rate = word_counts["distance"] / max(len(expected_words), 1)
    else:
        word_error_rate = None
    catastrophic = bool(expected_graphemes) and (
        not actual_graphemes or grapheme_cer >= 0.75
    )
    return {
        "graphemeCer": grapheme_cer,
        "wordErrorRate": word_error_rate,
        "insertionCount": grapheme_counts["insertions"],
        "deletionCount": grapheme_counts["deletions"],
        "substitutionCount": grapheme_counts["substitutions"],
        "expectedGraphemes": len(expected_graphemes),
        "actualGraphemes": len(actual_graphemes),
        "catastrophicFailure": catastrophic,
    }


def file_sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verified_real_fixture_path(record, label):
    if not isinstance(record, dict):
        raise SystemExit(f"Real OCR {label} metadata is malformed")
    relative = record.get("path")
    expected_bytes = record.get("bytes")
    expected_sha256 = record.get("sha256")
    if (
        not isinstance(relative, str)
        or not relative
        or Path(relative).is_absolute()
        or "\\" in relative
        or any(component in ("", ".", "..") for component in relative.split("/"))
        or type(expected_bytes) is not int
        or expected_bytes <= 0
        or not isinstance(expected_sha256, str)
        or re.fullmatch(r"[a-f0-9]{64}", expected_sha256) is None
    ):
        raise SystemExit(f"Real OCR {label} tracked-file metadata is unsafe")
    root = REAL_FIXTURE_ROOT.resolve(strict=True)
    candidate = REAL_FIXTURE_ROOT / relative
    cursor = REAL_FIXTURE_ROOT
    for component in relative.split("/"):
        cursor = cursor / component
        if cursor.is_symlink():
            raise SystemExit(f"Real OCR {label} path contains a symlink: {relative}")
    resolved = candidate.resolve(strict=True)
    if not resolved.is_relative_to(root) or not resolved.is_file():
        raise SystemExit(f"Real OCR {label} escaped its fixture root: {relative}")
    if resolved.stat().st_size != expected_bytes or file_sha256(resolved) != expected_sha256:
        raise SystemExit(f"Real OCR {label} digest/size mismatch: {relative}")
    return resolved


def load_real_corpus():
    if (
        not REAL_FIXTURE_MANIFEST.is_file()
        or REAL_FIXTURE_MANIFEST.is_symlink()
        or REAL_FIXTURE_MANIFEST.stat().st_size > 1024 * 1024
    ):
        raise SystemExit("Missing or unsafe committed real OCR fixture manifest")
    if file_sha256(REAL_FIXTURE_MANIFEST) != REAL_FIXTURE_MANIFEST_SHA256:
        raise SystemExit("Committed real OCR fixture manifest digest drifted")
    try:
        manifest = json.loads(REAL_FIXTURE_MANIFEST.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise SystemExit(f"Unable to load committed real OCR fixture manifest: {error}") from error
    fixtures = manifest.get("fixtures") if isinstance(manifest, dict) else None
    if (
        not isinstance(manifest, dict)
        or manifest.get("schemaVersion") != 1
        or manifest.get("heldOutPolicy") != REAL_CORPUS_HELD_OUT_POLICY
        or manifest.get("boardCohort") != REAL_BOARD_COHORT_EXPECTED
        or manifest.get("koreanCohort") != REAL_KOREAN_COHORT_EXPECTED
        or not isinstance(fixtures, list)
    ):
        raise SystemExit("Real OCR fixture manifest schema is unsupported")
    if len(fixtures) != len(REAL_CORPUS_EXPECTED):
        raise SystemExit("Real OCR fixture manifest has the wrong fixture count")

    loaded = []
    observed = set()
    required_normalization = {
        "case": "casefold",
        "punctuation": "preserve",
        "unicode": "NFC",
        "whitespace": "collapse-runs-and-trim",
    }
    for fixture in fixtures:
        if not isinstance(fixture, dict):
            raise SystemExit("Real OCR fixture entry is malformed")
        fixture_id = fixture.get("id")
        expected_identity = REAL_CORPUS_EXPECTED.get(fixture_id)
        evaluation = fixture.get("evaluation")
        ground_truth_metadata = fixture.get("groundTruth")
        provenance = fixture.get("provenance")
        has_source_shard = isinstance(provenance, dict) and "sourceShard" in provenance
        has_source_file = isinstance(provenance, dict) and "sourceFile" in provenance
        source_shard = provenance.get("sourceShard") if isinstance(provenance, dict) else None
        source_file = provenance.get("sourceFile") if isinstance(provenance, dict) else None
        if (
            expected_identity is None
            or fixture_id in observed
            or not isinstance(fixture.get("image"), dict)
            or not isinstance(evaluation, dict)
            or not isinstance(ground_truth_metadata, dict)
            or not isinstance(provenance, dict)
            or not isinstance(provenance.get("dataset"), str)
            or not provenance["dataset"]
            or not isinstance(provenance.get("upstreamId"), str)
            or not provenance["upstreamId"]
            or not isinstance(provenance.get("repositoryRevision"), str)
            or not isinstance(provenance.get("sourceRecordUrl"), str)
            or not provenance["sourceRecordUrl"].startswith("https://")
            or provenance["repositoryRevision"] not in provenance["sourceRecordUrl"]
            or not isinstance(provenance.get("sourceDatasetUrl"), str)
            or not provenance["sourceDatasetUrl"].startswith("https://")
            or has_source_shard == has_source_file
            or (
                fixture.get("category"),
                fixture.get("language"),
                evaluation.get("mode"),
            )
            != expected_identity
            or ground_truth_metadata.get("comparisonNormalization")
            != required_normalization
            or not isinstance(evaluation.get("ignoredTokens"), list)
            or not all(
                isinstance(token, str) and token
                for token in evaluation["ignoredTokens"]
            )
        ):
            raise SystemExit(f"Real OCR fixture identity/evaluation drifted: {fixture_id!r}")
        if has_source_shard:
            if (
                re.fullmatch(r"[a-f0-9]{40}", provenance["repositoryRevision"])
                is None
                or provenance.get("split") not in ("train", "validation", "test")
                or provenance["repositoryRevision"] not in provenance["sourceDatasetUrl"]
                or not isinstance(source_shard, dict)
                or not isinstance(source_shard.get("path"), str)
                or not source_shard["path"].endswith(".parquet")
                or type(source_shard.get("bytes")) is not int
                or source_shard["bytes"] <= 0
                or not isinstance(source_shard.get("sha256"), str)
                or re.fullmatch(r"[a-f0-9]{64}", source_shard["sha256"]) is None
                or type(source_shard.get("globalRowIndex")) is not int
                or source_shard["globalRowIndex"] < 0
                or type(source_shard.get("rowGroup")) is not int
                or source_shard["rowGroup"] < 0
                or type(source_shard.get("rowIndex")) is not int
                or source_shard["rowIndex"] < 0
            ):
                raise SystemExit(
                    f"Real OCR dataset-shard provenance drifted: {fixture_id!r}"
                )
        else:
            expected_source_file = {
                "bytes": 44677,
                "fileTimestamp": "2009-08-18T13:00:50Z",
                "pageId": 7592246,
                "sha1": "fd1f0cc88f931af22576c7404270837916c60d8d",
                "sha256": (
                    "a9ae819505be17d87393695bdadd1aaff"
                    "47b0a8b81faec98b38408397942b3dc"
                ),
                "sourceUrl": (
                    "https://upload.wikimedia.org/wikipedia/commons/c/cb/Hagye01.jpg"
                ),
            }
            if (
                fixture_id != "commons-hagye-station-715"
                or provenance["dataset"] != "Wikimedia Commons"
                or provenance["upstreamId"] != "7592246"
                or provenance["repositoryRevision"] != "1234274506"
                or provenance["sourceRecordUrl"]
                != (
                    "https://commons.wikimedia.org/w/index.php?"
                    "title=File:Hagye01.jpg&oldid=1234274506"
                )
                or provenance["sourceDatasetUrl"]
                != (
                    "https://commons.wikimedia.org/wiki/"
                    "Category:Train_station_signs_of_Seoul_Subway_Line_7"
                )
                or "split" in provenance
                or source_file != expected_source_file
                or provenance.get("pixelLicense") != "LicenseRef-Public-Domain"
                or provenance.get("annotationLicense") != "LicenseRef-Public-Domain"
                or provenance.get("licenseEvidenceUrls")
                != [
                    (
                        "https://commons.wikimedia.org/w/index.php?"
                        "title=File:Hagye01.jpg&oldid=1234274506"
                    ),
                    (
                        "https://commons.wikimedia.org/w/index.php?"
                        "title=Template:PD-user-en&oldid=358311026"
                    ),
                ]
                or fixture.get("image", {}).get("bytes") != source_file["bytes"]
                or fixture.get("image", {}).get("sha256") != source_file["sha256"]
                or fixture.get("image", {}).get("sourceSha256") != source_file["sha256"]
            ):
                raise SystemExit(
                    f"Real OCR original-file provenance drifted: {fixture_id!r}"
                )
        observed.add(fixture_id)
        image_path = verified_real_fixture_path(fixture.get("image"), f"{fixture_id} image")
        annotation_path = verified_real_fixture_path(
            fixture.get("annotation"),
            f"{fixture_id} annotation",
        )
        ground_truth_path = verified_real_fixture_path(
            ground_truth_metadata,
            f"{fixture_id} ground truth",
        )
        image_metadata = fixture["image"]
        with Image.open(image_path) as image:
            if image.size != (image_metadata.get("width"), image_metadata.get("height")):
                raise SystemExit(f"Real OCR fixture dimensions drifted: {fixture_id}")
            image.verify()
        ground_truth = ground_truth_path.read_text(encoding="utf-8")
        if not ground_truth.endswith("\n"):
            raise SystemExit(f"Real OCR ground truth lacks its canonical newline: {fixture_id}")
        if (
            fixture_id == "commons-hagye-station-715"
            and ground_truth[:-1] != REAL_KOREAN_GROUND_TRUTH_EXPECTED
        ):
            raise SystemExit("Frozen Korean OCR ground truth drifted")
        try:
            annotation_raw = annotation_path.read_text(encoding="utf-8")
            annotation = json.loads(annotation_raw)
        except (OSError, UnicodeError, json.JSONDecodeError) as error:
            raise SystemExit(f"Real OCR annotation is invalid: {fixture_id}: {error}") from error
        canonical_annotation = (
            json.dumps(annotation, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
        )
        expected_source = (
            {
                "dataset": provenance["dataset"],
                "globalRowIndex": source_shard["globalRowIndex"],
                "repositoryRevision": provenance["repositoryRevision"],
                "rowGroup": source_shard["rowGroup"],
                "rowIndex": source_shard["rowIndex"],
                "split": provenance["split"],
                "upstreamId": provenance["upstreamId"],
            }
            if has_source_shard
            else {
                "dataset": provenance["dataset"],
                "fileTimestamp": source_file["fileTimestamp"],
                "pageId": source_file["pageId"],
                "repositoryRevision": provenance["repositoryRevision"],
                "sha1": source_file["sha1"],
                "sha256": source_file["sha256"],
                "sourceUrl": source_file["sourceUrl"],
                "upstreamId": provenance["upstreamId"],
            }
        )
        if (
            not isinstance(annotation, dict)
            or annotation_raw != canonical_annotation
            or annotation.get("exactGroundTruth") != ground_truth[:-1]
            or annotation.get("source") != expected_source
        ):
            raise SystemExit(
                f"Real OCR annotation/ground-truth provenance drifted: {fixture_id}"
            )
        loaded.append(
            {
                "id": fixture_id,
                "category": fixture["category"],
                "sourceLanguage": fixture["language"],
                "evaluationMode": evaluation["mode"],
                "ignoredTokens": tuple(evaluation["ignoredTokens"]),
                "imagePath": image_path,
                "groundTruth": ground_truth[:-1],
                "dataset": provenance["dataset"],
                "upstreamId": provenance["upstreamId"],
                "repositoryRevision": provenance["repositoryRevision"],
            }
        )
    if observed != set(REAL_CORPUS_EXPECTED):
        raise SystemExit("Real OCR fixture manifest omitted a required fixture")
    if not Path("/usr/bin/tesseract").is_file():
        raise SystemExit("Official image is missing native Fast OCR")
    return manifest, tuple(loaded)


def normalize_real_text(value):
    return " ".join(unicodedata.normalize("NFC", str(value)).casefold().split())


def real_page_metrics(actual, expected):
    actual_text = normalize_real_text(actual)
    expected_text = normalize_real_text(expected)
    actual_graphemes = split_grapheme_clusters(actual_text)
    expected_graphemes = split_grapheme_clusters(expected_text)
    grapheme_counts = edit_counts(actual_graphemes, expected_graphemes)
    actual_words = tuple(actual_text.split())
    expected_words = tuple(expected_text.split())
    word_counts = edit_counts(actual_words, expected_words)
    return {
        "graphemeCer": grapheme_counts["distance"] / max(len(expected_graphemes), 1),
        "wordErrorRate": word_counts["distance"] / max(len(expected_words), 1),
        "insertionCount": grapheme_counts["insertions"],
        "deletionCount": grapheme_counts["deletions"],
        "substitutionCount": grapheme_counts["substitutions"],
        "expectedGraphemes": len(expected_graphemes),
        "actualGraphemes": len(actual_graphemes),
    }


def is_cjk_grapheme(grapheme):
    return any(
        0x1100 <= ord(character) <= 0x11FF
        or 0x3040 <= ord(character) <= 0x30FF
        or 0x3130 <= ord(character) <= 0x318F
        or 0x3400 <= ord(character) <= 0x4DBF
        or 0x4E00 <= ord(character) <= 0x9FFF
        or 0xA960 <= ord(character) <= 0xA97F
        or 0xAC00 <= ord(character) <= 0xD7AF
        or 0xD7B0 <= ord(character) <= 0xD7FF
        or 0xF900 <= ord(character) <= 0xFAFF
        or 0xFFA0 <= ord(character) <= 0xFFDC
        for character in grapheme
    )


def real_token_multiset(value, ignored_tokens=()):
    text = str(value)
    for ignored in ignored_tokens:
        text = text.replace(ignored, " ")
    normalized = normalize_real_text(text)
    tokens = []
    run = []

    def flush_run():
        if run:
            tokens.append("".join(run))
            run.clear()

    for grapheme in split_grapheme_clusters(normalized):
        if grapheme.isspace():
            flush_run()
        elif is_cjk_grapheme(grapheme):
            flush_run()
            tokens.append(grapheme)
        elif unicodedata.category(grapheme[0])[0] in ("L", "N"):
            run.append(grapheme)
        else:
            flush_run()
            tokens.append(grapheme)
    flush_run()
    return Counter(tokens)


def real_token_metrics(actual, expected, ignored_tokens):
    actual_tokens = real_token_multiset(actual)
    expected_tokens = real_token_multiset(expected, ignored_tokens)
    matched = sum((actual_tokens & expected_tokens).values())
    actual_count = sum(actual_tokens.values())
    expected_count = sum(expected_tokens.values())
    if expected_count == 0:
        raise SystemExit("Real OCR token fixture normalized to no expected tokens")
    recall = matched / expected_count
    precision = matched / max(actual_count, 1)
    f1 = 0.0 if recall + precision == 0 else 2 * recall * precision / (recall + precision)
    return {
        "tokenRecall": recall,
        "tokenPrecision": precision,
        "tokenF1": f1,
        "matchedTokenCount": matched,
        "expectedTokenCount": expected_count,
        "actualTokenCount": actual_count,
        "hallucinatedTokenCount": max(actual_count - matched, 0),
    }


fast_real_results_path = Path(os.environ["SNAPOTTER_FAST_REAL_RESULTS"])
if (
    not fast_real_results_path.is_file()
    or fast_real_results_path.is_symlink()
    or fast_real_results_path.stat().st_size > 8 * 1024 * 1024
):
    raise SystemExit("Exact application Fast OCR report is missing or oversized")
try:
    FAST_REAL_RESULTS = json.loads(fast_real_results_path.read_text(encoding="utf-8"))
except (OSError, UnicodeError, json.JSONDecodeError) as error:
    raise SystemExit(f"Exact application Fast OCR report is malformed: {error}") from error
if not isinstance(FAST_REAL_RESULTS, dict) or set(FAST_REAL_RESULTS) != set(REAL_CORPUS_EXPECTED):
    raise SystemExit("Exact application Fast OCR report fixture identities drifted")


def run_fast_real_ocr(fixture_id):
    result = FAST_REAL_RESULTS.get(fixture_id)
    if not isinstance(result, dict):
        raise SystemExit(f"Fast real-corpus OCR omitted {fixture_id}")
    if fixture_id == "commons-hagye-station-715":
        expected = {
            "decisionEnforced": True,
            "fixtureId": fixture_id,
            "language": "ko",
            "releaseGatePassed": None,
            "releaseGateStatus": "unsupported-by-design",
            "supported": False,
            "tesseractSpawned": False,
            "unsupportedReason": (
                "Fast OCR does not support Korean. Install the Accurate OCR bundle "
                "and choose Balanced or Best."
            ),
        }
        if result != expected:
            raise SystemExit("Korean Fast OCR decision evidence drifted")
        return result
    expected = {
        "engine": "tesseract",
        "provider": "native",
        "device": "cpu",
        "requestedQuality": "fast",
        "actualQuality": "fast",
        "degraded": False,
    }
    if any(result.get(field) != value for field, value in expected.items()):
        raise SystemExit(f"Fast real-corpus application metadata drifted: {fixture_id}")
    text = result.get("text")
    warnings = result.get("warnings")
    if (
        not isinstance(text, str)
        or len(text.encode("utf-8")) > 1_000_000
        or not isinstance(warnings, list)
        or any(not isinstance(warning, str) for warning in warnings)
    ):
        raise SystemExit(f"Fast real-corpus application output is malformed: {fixture_id}")
    return result


def edit_error(left, right):
    if not left or not right:
        return 0.0 if left == right else 1.0
    if len(left) > len(right):
        left, right = right, left
    previous = list(range(len(left) + 1))
    for row, right_character in enumerate(right, start=1):
        current = [row]
        for column, left_character in enumerate(left, start=1):
            current.append(
                min(
                    current[-1] + 1,
                    previous[column] + 1,
                    previous[column - 1] + (left_character != right_character),
                )
            )
        previous = current
    return previous[-1] / max(len(left), len(right))


def normalized_edit_error(actual, expected):
    return edit_error(normalized_text(actual), normalized_text(expected))


def raw_edit_error(actual, expected):
    return edit_error(raw_text(actual), raw_text(expected))


def minimum_polygon_coverage(candidate, expected_boxes):
    if not expected_boxes:
        return None
    predicted = np.zeros((candidate.height, candidate.width), dtype=np.uint8)
    for line in candidate.lines:
        polygon = np.asarray(line.polygon, dtype=np.float32)
        polygon[:, 0] = np.clip(polygon[:, 0], 0, candidate.width - 1)
        polygon[:, 1] = np.clip(polygon[:, 1], 0, candidate.height - 1)
        cv2.fillPoly(predicted, [np.rint(polygon).astype(np.int32)], 1)
    coverages = []
    for left, top, right, bottom in expected_boxes:
        left = max(0, min(candidate.width - 1, math.floor(left)))
        top = max(0, min(candidate.height - 1, math.floor(top)))
        right = max(left + 1, min(candidate.width, math.ceil(right)))
        bottom = max(top + 1, min(candidate.height, math.ceil(bottom)))
        expected_area = max((right - left) * (bottom - top), 1)
        coverages.append(float(predicted[top:bottom, left:right].sum()) / expected_area)
    return min(coverages)


def assert_runtime_result(label, result, quality):
    if result.get("success") is not True:
        raise SystemExit(f"{label}: OCR did not report success")
    expected = {
        "actualQuality": quality,
        "requestedQuality": quality,
        "engine": "rapidocr-onnx",
        "provider": "CPUExecutionProvider",
        "device": "cpu",
        "degraded": False,
    }
    for field, value in expected.items():
        if result.get(field) != value:
            raise SystemExit(
                f"{label}: expected {field}={value!r}, received {result.get(field)!r}"
            )
    if quality == "best" and not str(result.get("modelVersion", "")).startswith(
        "PP-OCRv6-best-v1-"
    ):
        raise SystemExit(
            f"{label}: Best did not report calibrated selector provenance: "
            f"{result.get('modelVersion')!r}"
        )


def real_corpus_limit(category, source_language, quality, evaluation_mode):
    limit = REAL_CORPUS_LIMITS.get((category, source_language, quality))
    if limit is None:
        raise SystemExit(
            "Real OCR release threshold is missing for "
            f"{category}/{source_language}/{quality}"
        )
    expected_keys = (
        {"minimumTokenRecall", "minimumTokenPrecision", "minimumTokenF1"}
        if evaluation_mode == "annotation-token-coverage"
        else {"maximumGraphemeCer", "maximumWordErrorRate"}
    )
    if (
        not isinstance(limit, dict)
        or set(limit) != expected_keys
        or not all(
            isinstance(value, (int, float))
            and not isinstance(value, bool)
            and 0 <= value <= 1
            for value in limit.values()
        )
    ):
        raise SystemExit(
            "Real OCR release threshold is malformed for "
            f"{category}/{source_language}/{quality}"
        )
    if (
        (category, source_language) == ("board-or-sign", "ko")
        and limit != REAL_KOREAN_COHORT_EXPECTED["perImageTierFloors"][quality]
    ):
        raise SystemExit(f"Frozen Korean OCR release threshold drifted for {quality}")
    return limit


def real_corpus_limit_failures(evaluation_mode, record, limit):
    if evaluation_mode == "annotation-token-coverage":
        failures = [
            f"recall {record['tokenRecall']:.3f} < {limit['minimumTokenRecall']:.3f}"
            if record["tokenRecall"] < limit["minimumTokenRecall"]
            else None,
            f"precision {record['tokenPrecision']:.3f} < {limit['minimumTokenPrecision']:.3f}"
            if record["tokenPrecision"] < limit["minimumTokenPrecision"]
            else None,
            f"F1 {record['tokenF1']:.3f} < {limit['minimumTokenF1']:.3f}"
            if record["tokenF1"] < limit["minimumTokenF1"]
            else None,
        ]
    else:
        failures = [
            f"grapheme CER {record['graphemeCer']:.3f} > {limit['maximumGraphemeCer']:.3f}"
            if record["graphemeCer"] > limit["maximumGraphemeCer"]
            else None,
            f"WER {record['wordErrorRate']:.3f} > {limit['maximumWordErrorRate']:.3f}"
            if record["wordErrorRate"] > limit["maximumWordErrorRate"]
            else None,
        ]
    return [failure for failure in failures if failure is not None]


def evaluate_real_corpus(runtime, manifest, fixtures):
    records_by_fixture = {}
    release_failures = []
    for fixture in fixtures:
        fixture_records = {}
        fixture_id = fixture["id"]
        category = fixture["category"]
        source_language = fixture["sourceLanguage"]
        evaluation_mode = fixture["evaluationMode"]
        selector = REAL_CORPUS_SELECTORS[source_language]
        for quality in REAL_CORPUS_QUALITIES:
            label = f"real-{fixture_id}-{quality}"
            attempt = {
                "fixtureId": fixture_id,
                "language": selector,
                "manifestSha256": REAL_FIXTURE_MANIFEST_SHA256,
                "quality": quality,
                "sourceLanguage": source_language,
                "status": "started",
            }
            quality_report["realCorpusAttempt"] = attempt
            write_quality_report()
            started = time.perf_counter()
            try:
                if quality == "fast":
                    result = run_fast_real_ocr(fixture_id)
                else:
                    result = runtime.recognize_image(
                        fixture["imagePath"],
                        {
                            "enhance": quality == "best",
                            "language": selector,
                            "quality": quality,
                        },
                    )
                    assert_runtime_result(label, result, quality)
            except BaseException as error:
                attempt["status"] = "failed"
                attempt["errorType"] = type(error).__name__
                attempt["error"] = str(error)[:2000]
                write_quality_report()
                raise
            latency_ms = (time.perf_counter() - started) * 1000
            if quality == "fast" and source_language == "ko":
                limit = real_corpus_limit(
                    category,
                    source_language,
                    quality,
                    evaluation_mode,
                )
                record = {
                    "label": label,
                    "category": f"real-{category}",
                    "fixtureId": fixture_id,
                    "dataset": fixture["dataset"],
                    "upstreamId": fixture["upstreamId"],
                    "repositoryRevision": fixture["repositoryRevision"],
                    "sourceLanguage": source_language,
                    "language": selector,
                    "quality": quality,
                    "enhance": False,
                    "evaluationMode": evaluation_mode,
                    "engine": None,
                    "provider": None,
                    "device": None,
                    "actualQuality": None,
                    "recognizedTextSha256": None,
                    "recognizedCharacters": 0,
                    "alnumCer": None,
                    "rawCer": None,
                    "graphemeCer": None,
                    "wordErrorRate": None,
                    "diagnosticWordErrorRate": None,
                    "insertionCount": 0,
                    "deletionCount": 0,
                    "substitutionCount": 0,
                    "catastrophicFailure": False,
                    "polygonCoverage": None,
                    "latencyMs": round(latency_ms, 3),
                    "characters": len(fixture["groundTruth"]),
                    "thresholds": limit,
                    "supported": False,
                    "decisionEnforced": True,
                    "tesseractSpawned": False,
                    "unsupportedReason": result["unsupportedReason"],
                    "releaseGatePassed": None,
                    "releaseGateStatus": "unsupported-by-design",
                    "releaseGateFailures": [],
                }
                quality_report["cases"].append(record)
                fixture_records[quality] = record
                attempt["status"] = "completed"
                attempt["decisionEnforced"] = True
                attempt["releaseGatePassed"] = None
                attempt["releaseGateStatus"] = "unsupported-by-design"
                write_quality_report()
                print(
                    f"PASS: {label} unsupported-by-design decision enforced before "
                    f"Tesseract spawn latency={latency_ms:.0f}ms"
                )
                continue
            actual_text = str(result.get("text", ""))
            catastrophic_failure = not normalize_real_text(actual_text)
            page_metrics = real_page_metrics(actual_text, fixture["groundTruth"])
            token_metrics = (
                real_token_metrics(
                    actual_text,
                    fixture["groundTruth"],
                    fixture["ignoredTokens"],
                )
                if evaluation_mode == "annotation-token-coverage"
                else None
            )
            limit = real_corpus_limit(category, source_language, quality, evaluation_mode)
            record = {
                "label": label,
                "category": f"real-{category}",
                "fixtureId": fixture_id,
                "dataset": fixture["dataset"],
                "upstreamId": fixture["upstreamId"],
                "repositoryRevision": fixture["repositoryRevision"],
                "sourceLanguage": source_language,
                "language": selector,
                "quality": quality,
                "enhance": quality == "best",
                "evaluationMode": evaluation_mode,
                "engine": result.get("engine"),
                "provider": result.get("provider"),
                "device": result.get("device"),
                "actualQuality": result.get("actualQuality"),
                "recognizedTextSha256": hashlib.sha256(
                    actual_text.encode("utf-8")
                ).hexdigest(),
                "recognizedCharacters": len(actual_text),
                "alnumCer": round(
                    normalized_edit_error(actual_text, fixture["groundTruth"]),
                    6,
                ),
                "rawCer": round(raw_edit_error(actual_text, fixture["groundTruth"]), 6),
                "graphemeCer": round(page_metrics["graphemeCer"], 6),
                "wordErrorRate": (
                    round(page_metrics["wordErrorRate"], 6)
                    if evaluation_mode == "page-transcript"
                    else None
                ),
                "diagnosticWordErrorRate": round(page_metrics["wordErrorRate"], 6),
                "insertionCount": page_metrics["insertionCount"],
                "deletionCount": page_metrics["deletionCount"],
                "substitutionCount": page_metrics["substitutionCount"],
                "expectedGraphemes": page_metrics["expectedGraphemes"],
                "actualGraphemes": page_metrics["actualGraphemes"],
                "catastrophicFailure": catastrophic_failure,
                "polygonCoverage": None,
                "latencyMs": round(latency_ms, 3),
                "characters": len(fixture["groundTruth"]),
                "thresholds": limit,
            }
            if token_metrics is not None:
                record.update(
                    {
                        key: round(value, 6) if isinstance(value, float) else value
                        for key, value in token_metrics.items()
                    }
                )
            if quality == "fast":
                if (
                    result["engine"] != "tesseract"
                    or result["provider"] != "native"
                    or result["device"] != "cpu"
                    or result["actualQuality"] != "fast"
                ):
                    raise SystemExit(f"{label}: Fast OCR metadata drifted")
            case_failures = (
                ["real OCR returned no text"] if catastrophic_failure else []
            ) + real_corpus_limit_failures(evaluation_mode, record, limit)
            record["releaseGatePassed"] = not case_failures
            record["releaseGateFailures"] = case_failures
            release_failures.extend(
                f"{label}: {failure}" for failure in case_failures
            )
            quality_report["cases"].append(record)
            fixture_records[quality] = record
            attempt["status"] = "completed"
            attempt["releaseGatePassed"] = not case_failures
            attempt["recognizedTextSha256"] = record["recognizedTextSha256"]
            write_quality_report()
            status = "PASS" if not case_failures else "FAIL"
            if evaluation_mode == "annotation-token-coverage":
                print(
                    f"{status}: {label} token recall={record['tokenRecall']:.3f} "
                    f"precision={record['tokenPrecision']:.3f} F1={record['tokenF1']:.3f} "
                    f"latency={latency_ms:.0f}ms"
                )
            else:
                print(
                    f"{status}: {label} grapheme={record['graphemeCer']:.3f} "
                    f"WER={record['wordErrorRate']:.3f} latency={latency_ms:.0f}ms"
                )
        balanced = fixture_records["balanced"]
        best = fixture_records["best"]
        if evaluation_mode == "annotation-token-coverage":
            if best["tokenF1"] + BEST_REGRESSION_TOLERANCE < balanced["tokenF1"]:
                release_failures.append(
                    f"{fixture_id}: Best token F1 {best['tokenF1']:.3f} regressed beyond "
                    f"Balanced {balanced['tokenF1']:.3f} - {BEST_REGRESSION_TOLERANCE:.3f}"
                )
        elif (
            best["graphemeCer"] > balanced["graphemeCer"] + BEST_REGRESSION_TOLERANCE
            or best["wordErrorRate"]
            > balanced["wordErrorRate"] + BEST_REGRESSION_TOLERANCE
        ):
            release_failures.append(
                f"{fixture_id}: Best page-transcript quality regressed beyond Balanced"
            )
        records_by_fixture[fixture_id] = fixture_records

    quality_report["realCorpus"] = {
        "manifest": REAL_FIXTURE_MANIFEST.as_posix(),
        "manifestSha256": REAL_FIXTURE_MANIFEST_SHA256,
        "manifestSchemaVersion": manifest["schemaVersion"],
        "heldOutPolicy": manifest["heldOutPolicy"],
        "boardCohort": manifest["boardCohort"],
        "koreanCohort": manifest["koreanCohort"],
        "fixtureCount": len(fixtures),
        "caseCount": len(fixtures) * len(REAL_CORPUS_QUALITIES),
        "qualities": list(REAL_CORPUS_QUALITIES),
        "fixtures": [
            {
                "id": fixture["id"],
                "category": fixture["category"],
                "sourceLanguage": fixture["sourceLanguage"],
                "evaluationMode": fixture["evaluationMode"],
                "dataset": fixture["dataset"],
                "upstreamId": fixture["upstreamId"],
                "repositoryRevision": fixture["repositoryRevision"],
            }
            for fixture in fixtures
        ],
        "bestRegressionTolerance": BEST_REGRESSION_TOLERANCE,
        "releaseGatePassed": not release_failures,
        "releaseGateFailures": release_failures,
    }
    if release_failures:
        raise SystemExit(
            "real OCR release gate failed across held-out cases:\n- "
            + "\n- ".join(release_failures)
        )
    return records_by_fixture


def recognize(
    runtime,
    label,
    image_path,
    expected,
    *,
    quality,
    language,
    maximum_error,
    category="legacy",
    enhance=False,
    expected_boxes=(),
    maximum_grapheme_cer=None,
    raw_maximum_error=None,
    maximum_word_error=None,
    minimum_polygon_coverage_required=None,
):
    started = time.perf_counter()
    result = runtime.recognize_image(
        image_path,
        {"enhance": enhance, "language": language, "quality": quality},
    )
    latency_ms = (time.perf_counter() - started) * 1000
    assert_runtime_result(label, result, quality)
    error = normalized_edit_error(result.get("text", ""), expected)
    raw_error = raw_edit_error(result.get("text", ""), expected)
    metrics = text_quality_metrics(result.get("text", ""), expected, language)
    raw_limit = max(maximum_error + 0.15, 0.20) if raw_maximum_error is None else raw_maximum_error
    grapheme_limit = (
        max(maximum_error + 0.10, 0.20)
        if maximum_grapheme_cer is None
        else maximum_grapheme_cer
    )
    word_limit = (
        max(grapheme_limit + 0.15, 0.35)
        if maximum_word_error is None
        else maximum_word_error
    )
    if error > maximum_error:
        raise SystemExit(
            f"{label}: normalized edit error {error:.3f} exceeded {maximum_error:.3f}; "
            f"text={str(result.get('text', ''))[:240]!r}"
        )
    if raw_error > raw_limit:
        raise SystemExit(
            f"{label}: raw edit error {raw_error:.3f} exceeded {raw_limit:.3f}; "
            f"text={str(result.get('text', ''))[:240]!r}"
        )
    if metrics["graphemeCer"] > grapheme_limit:
        raise SystemExit(
            f"{label}: grapheme CER {metrics['graphemeCer']:.3f} exceeded "
            f"{grapheme_limit:.3f}; text={str(result.get('text', ''))[:240]!r}"
        )
    if metrics["catastrophicFailure"]:
        raise SystemExit(f"{label}: OCR suffered a catastrophic empty/high-error result")
    if metrics["wordErrorRate"] is not None and metrics["wordErrorRate"] > word_limit:
        raise SystemExit(
            f"{label}: word error rate {metrics['wordErrorRate']:.3f} exceeded "
            f"{word_limit:.3f}; text={str(result.get('text', ''))[:240]!r}"
        )
    polygon_coverage = None
    if expected_boxes:
        tier = "small" if quality == "balanced" else "medium"
        candidate = runtime._run_tier(image_path, tier, language)
        polygon_coverage = minimum_polygon_coverage(candidate, expected_boxes)
        if (
            minimum_polygon_coverage_required is not None
            and polygon_coverage < minimum_polygon_coverage_required
        ):
            raise SystemExit(
                f"{label}: polygon coverage {polygon_coverage:.3f} fell below "
                f"{minimum_polygon_coverage_required:.3f}"
            )
    record = {
        "label": label,
        "category": category,
        "language": language,
        "quality": quality,
        "enhance": enhance,
        "alnumCer": round(error, 6),
        "rawCer": round(raw_error, 6),
        "graphemeCer": round(metrics["graphemeCer"], 6),
        "wordErrorRate": (
            None
            if metrics["wordErrorRate"] is None
            else round(metrics["wordErrorRate"], 6)
        ),
        "insertionCount": metrics["insertionCount"],
        "deletionCount": metrics["deletionCount"],
        "substitutionCount": metrics["substitutionCount"],
        "expectedGraphemes": metrics["expectedGraphemes"],
        "actualGraphemes": metrics["actualGraphemes"],
        "catastrophicFailure": metrics["catastrophicFailure"],
        "polygonCoverage": (
            None if polygon_coverage is None else round(polygon_coverage, 6)
        ),
        "latencyMs": round(latency_ms, 3),
        "characters": len(str(expected)),
    }
    quality_report["cases"].append(
        record
    )
    print(
        f"PASS: {label} alnum={error:.3f} grapheme={metrics['graphemeCer']:.3f} "
        f"raw={raw_error:.3f} "
        f"latency={latency_ms:.0f}ms text={str(result.get('text', ''))[:100]!r}"
    )
    return error, raw_error, result, record


for _label, fixture, _expected, _language, _maximum_error in FIXTURE_CASES:
    if not fixture.is_file():
        raise SystemExit(f"Missing OCR quality fixture: {fixture}")
real_fixture_manifest, real_corpus_fixtures = load_real_corpus()

generated_rotation = Path("/tmp/verify-ocr-rotated.png")
generated_rotation_90 = Path("/tmp/verify-ocr-rotated-90.png")
generated_rotation_270 = Path("/tmp/verify-ocr-rotated-270.png")
generated_skew = Path("/tmp/verify-ocr-skewed.png")
generated_korean = Path("/tmp/verify-ocr-korean.png")
generated_mixed = Path("/tmp/verify-ocr-mixed-script.png")
generated_blank = Path("/tmp/verify-ocr-blank.png")
generated_german = Path("/tmp/verify-ocr-german.png")
generated_french = Path("/tmp/verify-ocr-french.png")
generated_spanish = Path("/tmp/verify-ocr-spanish.png")
generated_chinese = Path("/tmp/verify-ocr-chinese.png")
generated_noisy = Path("/tmp/verify-ocr-noisy.png")
generated_boundary = Path("/tmp/verify-ocr-boundary.png")
generated_boundary_rotated = Path("/tmp/verify-ocr-boundary-rotated.png")
with Image.open(FIXTURE_CASES[0][1]) as clean_image:
    clean_rgb = clean_image.convert("RGB")
    clean_rgb.transpose(Image.Transpose.ROTATE_180).save(generated_rotation)
    clean_rgb.transpose(Image.Transpose.ROTATE_90).save(generated_rotation_90)
    clean_rgb.transpose(Image.Transpose.ROTATE_270).save(generated_rotation_270)
    clean_rgb.rotate(3.0, expand=True, fillcolor="white").save(generated_skew)

korean_text = "안녕하세요 스냅오터 OCR 505"
script_font_candidates = (
    Path("/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"),
    Path("/usr/share/fonts/opentype/unifont/unifont.otf"),
    Path("/usr/share/fonts/opentype/unifont/unifont_jp.otf"),
)
script_font_path = next((path for path in script_font_candidates if path.is_file()), None)
latin_font_path = Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
if script_font_path is None or not latin_font_path.is_file():
    raise SystemExit("Official image is missing deterministic OCR verification fonts")
korean_image = Image.new("RGB", (1200, 260), "white")
korean_draw = ImageDraw.Draw(korean_image)
korean_font = ImageFont.truetype(str(script_font_path), 72)
korean_draw.text((40, 70), korean_text, fill="black", font=korean_font)
korean_image.save(generated_korean)
mixed_text = "SnapOtter OCR 505 한글 테스트 ㅎㅏㄴㄱㅡㄹ"
mixed_image = Image.new("RGB", (1800, 280), "white")
mixed_draw = ImageDraw.Draw(mixed_image)
mixed_draw.text((40, 75), mixed_text, fill="black", font=korean_font)
mixed_image.save(generated_mixed)
Image.new("RGB", (800, 240), "white").save(generated_blank)


def render_text_fixture(path, text, font_path, *, font_size=68, width=1600):
    image = Image.new("RGB", (width, 240), "white")
    draw = ImageDraw.Draw(image)
    font = ImageFont.truetype(str(font_path), font_size)
    draw.text((40, 70), text, fill="black", font=font)
    image.save(path)


language_cases = (
    ("german", generated_german, "Falsches Üben quält größere Zwerge 505", "de", latin_font_path),
    ("french", generated_french, "Élève français, déjà prêt pour OCR 505", "fr", latin_font_path),
    ("spanish", generated_spanish, "El murciélago comió kiwi y piña 505", "es", latin_font_path),
    ("chinese", generated_chinese, "本地文字识别测试 505", "zh", script_font_path),
)
for _label, path, text, _language, font_path in language_cases:
    render_text_fixture(path, text, font_path)


LANGUAGE_QUALITY_CASES = (
    ("auto", "SnapOtter local OCR test 505", latin_font_path),
    ("de", "Grüße, größer und süß 505", latin_font_path),
    ("en", "SnapOtter local OCR test 505", latin_font_path),
    ("es", "El pingüino pidió piña 505", latin_font_path),
    ("fr", "Élève français déjà prêt 505", latin_font_path),
    ("ja", "日本語文字認識テスト505", script_font_path),
    ("ko", "한글 문자 인식 테스트 505", script_font_path),
    ("zh", "本地 OCR 测试 505", script_font_path),
)
REQUIRED_LANGUAGE_COHORTS = (
    "clean",
    "ui",
    "scene",
    "degradation",
    "rotation-90",
    "rotation-180",
    "rotation-270",
    "small-angle",
)
COHORT_LIMITS = {
    "clean": (0.20, 0.35),
    "ui": (0.25, 0.45),
    "scene": (0.35, 0.55),
    "degradation": (0.40, 0.60),
    "rotation-90": (0.35, 0.55),
    "rotation-180": (0.35, 0.55),
    "rotation-270": (0.35, 0.55),
    "small-angle": (0.30, 0.50),
}


def fitted_font(font_path, text, maximum_width, starting_size=64):
    probe = Image.new("RGB", (8, 8), "white")
    draw = ImageDraw.Draw(probe)
    for size in range(starting_size, 31, -2):
        font = ImageFont.truetype(str(font_path), size)
        if draw.textbbox((0, 0), text, font=font)[2] <= maximum_width:
            return font
    raise SystemExit(f"Unable to fit deterministic OCR fixture text: {text!r}")


def text_box(draw, position, text, font):
    left, top, right, bottom = draw.textbbox(position, text, font=font)
    return (left - 3, top - 3, right + 3, bottom + 3)


def render_language_cohorts(root, language, text, font_path):
    root.mkdir(parents=True, exist_ok=True)
    font = fitted_font(font_path, text, 1080)
    cases = {}

    clean = Image.new("RGB", (1200, 220), "white")
    clean_draw = ImageDraw.Draw(clean)
    clean_position = (60, 70)
    clean_draw.text(clean_position, text, fill="black", font=font)
    clean_box = text_box(clean_draw, clean_position, text, font)
    clean_mask = Image.new("L", clean.size, 0)
    ImageDraw.Draw(clean_mask).rectangle(clean_box, fill=255)
    clean_path = root / f"{language}-clean.png"
    clean.save(clean_path)
    cases["clean"] = (clean_path, (clean_box,))

    ui = Image.new("RGB", (1200, 260), (238, 242, 247))
    ui_draw = ImageDraw.Draw(ui)
    ui_draw.rounded_rectangle((24, 24, 1176, 236), radius=24, fill="white", outline=(190, 201, 216), width=3)
    ui_draw.rounded_rectangle((52, 54, 1148, 206), radius=16, fill=(232, 240, 255))
    ui_position = (78, 88)
    ui_draw.text(ui_position, text, fill=(17, 35, 64), font=font)
    ui_box = text_box(ui_draw, ui_position, text, font)
    ui_path = root / f"{language}-ui.png"
    ui.save(ui_path)
    cases["ui"] = (ui_path, (ui_box,))

    scene = Image.new("RGB", (1200, 300), (111, 151, 172))
    scene_draw = ImageDraw.Draw(scene)
    for offset in range(0, 1200, 80):
        shade = 126 + (offset // 80) % 3 * 7
        scene_draw.rectangle((offset, 0, offset + 79, 299), fill=(shade, shade + 28, shade + 40))
    scene_draw.polygon(((54, 58), (1140, 35), (1165, 245), (74, 270)), fill=(25, 55, 78))
    scene_position = (82, 110)
    scene_draw.text(scene_position, text, fill=(250, 244, 194), font=font, stroke_width=1)
    scene_box = text_box(scene_draw, scene_position, text, font)
    scene_path = root / f"{language}-scene.png"
    scene.save(scene_path)
    cases["scene"] = (scene_path, (scene_box,))

    degraded = Image.new("RGB", (1200, 220), (218, 218, 218))
    degraded_draw = ImageDraw.Draw(degraded)
    degraded_position = (60, 70)
    degraded_draw.text(degraded_position, text, fill=(76, 76, 76), font=font)
    degraded_box = text_box(degraded_draw, degraded_position, text, font)
    degraded_array = np.asarray(degraded, dtype=np.int16)
    degradation_noise = np.random.default_rng(505).integers(
        -5, 6, size=degraded_array.shape, dtype=np.int16
    )
    degraded = Image.fromarray(
        np.clip(degraded_array + degradation_noise, 0, 255).astype(np.uint8), "RGB"
    ).filter(ImageFilter.GaussianBlur(radius=0.45))
    degraded_path = root / f"{language}-degradation.jpg"
    degraded.save(degraded_path, format="JPEG", quality=62, optimize=False, progressive=False)
    cases["degradation"] = (degraded_path, (degraded_box,))

    cases["rotation-90"] = (
        root / f"{language}-rotation-90.png",
        (clean_mask.transpose(Image.Transpose.ROTATE_90).getbbox(),),
    )
    clean.transpose(Image.Transpose.ROTATE_90).save(cases["rotation-90"][0])
    cases["rotation-180"] = (
        root / f"{language}-rotation-180.png",
        (clean_mask.transpose(Image.Transpose.ROTATE_180).getbbox(),),
    )
    clean.transpose(Image.Transpose.ROTATE_180).save(cases["rotation-180"][0])
    cases["rotation-270"] = (
        root / f"{language}-rotation-270.png",
        (clean_mask.transpose(Image.Transpose.ROTATE_270).getbbox(),),
    )
    clean.transpose(Image.Transpose.ROTATE_270).save(cases["rotation-270"][0])
    cases["small-angle"] = (
        root / f"{language}-small-angle.png",
        (clean_mask.rotate(3.0, expand=True, fillcolor=0).getbbox(),),
    )
    clean.rotate(3.0, expand=True, fillcolor="white").save(cases["small-angle"][0])
    return cases


language_cohort_cases = {}
cohort_root = Path("/tmp/verify-ocr-language-cohorts")
for cohort_language, cohort_text, cohort_font_path in LANGUAGE_QUALITY_CASES:
    language_cohort_cases[cohort_language] = (
        cohort_text,
        render_language_cohorts(
            cohort_root,
            cohort_language,
            cohort_text,
            cohort_font_path,
        ),
    )

noisy_text = "Noisy invoice total 505"
noisy_image = Image.new("RGB", (1400, 260), (218, 218, 218))
noisy_draw = ImageDraw.Draw(noisy_image)
noise = random.Random(505)
for _ in range(8_000):
    x = noise.randrange(noisy_image.width)
    y = noise.randrange(noisy_image.height)
    shade = noise.randrange(180, 236)
    noisy_draw.point((x, y), fill=(shade, shade, shade))
noisy_draw.text(
    (40, 75),
    noisy_text,
    fill=(75, 75, 75),
    font=ImageFont.truetype(str(latin_font_path), 72),
)
noisy_image.save(generated_noisy)

generated_noise_only = Path("/tmp/verify-ocr-noise-only.png")
noise_only = np.random.default_rng(505).normal(246, 1.8, size=(240, 800, 3))
Image.fromarray(np.clip(noise_only, 0, 255).astype(np.uint8), "RGB").save(
    generated_noise_only
)

pdf_page_paths = []
pdf_page_images = []
for page_number, page_text in (
    (1, "PAGE ONE ALPHA 505"),
    (2, "PAGE TWO OMIT 505"),
    (3, "PAGE THREE OMEGA 505"),
):
    page_image = Image.new("RGB", (1200, 1600), "white")
    page_draw = ImageDraw.Draw(page_image)
    page_font = ImageFont.truetype(str(latin_font_path), 84)
    page_draw.text((90, 180), page_text, fill="black", font=page_font)
    page_path = Path(f"/tmp/verify-ocr-pdf-page-{page_number}.png")
    page_image.save(page_path)
    pdf_page_paths.append(page_path)
    pdf_page_images.append(page_image)
generated_multipage_pdf = Path("/tmp/verify-ocr-multipage.pdf")
pdf_page_images[0].save(
    generated_multipage_pdf,
    format="PDF",
    save_all=True,
    append_images=pdf_page_images[1:],
    resolution=150.0,
)
for page_image in pdf_page_images:
    page_image.close()

# A word box crossing the active tile stride proves that large inputs remain
# memory-bounded and that overlap merging returns the line exactly once.
boundary_text = "BOUNDARY OCR 505"
boundary_image = np.full((5000, 8000, 3), 255, dtype=np.uint8)
boundary_stride = MAX_DETECTOR_TILE_SIDE - DETECTOR_TILE_OVERLAP
cv2.putText(
    boundary_image,
    boundary_text,
    (2 * boundary_stride - 80, 2200),
    cv2.FONT_HERSHEY_SIMPLEX,
    2.0,
    (0, 0, 0),
    5,
    cv2.LINE_AA,
)
if not cv2.imwrite(str(generated_boundary), boundary_image):
    raise SystemExit("Unable to write the large OCR boundary fixture")
boundary_rotated = cv2.rotate(boundary_image, cv2.ROTATE_180)
if not cv2.imwrite(str(generated_boundary_rotated), boundary_rotated):
    raise SystemExit("Unable to write the rotated 40 MP OCR boundary fixture")
del boundary_rotated
del boundary_image
record_memory_checkpoint("fixtures-generated")

def compare_qualities(
    label,
    fixture,
    expected,
    language,
    maximum_error,
    *,
    category="legacy",
    expected_boxes=(),
    maximum_grapheme_cer=None,
    maximum_word_error=None,
    minimum_polygon_coverage_required=None,
    raw_maximum_error=None,
):
    balanced_error, balanced_raw_error, balanced_result, balanced_metrics = recognize(
        runtime,
        f"{label}-balanced",
        fixture,
        expected,
        quality="balanced",
        language=language,
        maximum_error=maximum_error,
        category=category,
        expected_boxes=expected_boxes,
        maximum_grapheme_cer=maximum_grapheme_cer,
        maximum_word_error=maximum_word_error,
        minimum_polygon_coverage_required=minimum_polygon_coverage_required,
        raw_maximum_error=raw_maximum_error,
    )
    best_error, best_raw_error, best_result, best_metrics = recognize(
        runtime,
        f"{label}-best",
        fixture,
        expected,
        quality="best",
        language=language,
        maximum_error=maximum_error,
        category=category,
        expected_boxes=expected_boxes,
        maximum_grapheme_cer=maximum_grapheme_cer,
        maximum_word_error=maximum_word_error,
        minimum_polygon_coverage_required=minimum_polygon_coverage_required,
        raw_maximum_error=raw_maximum_error,
    )
    if best_error > balanced_error + BEST_REGRESSION_TOLERANCE:
        raise SystemExit(
            f"{label}: Best error {best_error:.3f} regressed beyond Balanced "
            f"{balanced_error:.3f} + {BEST_REGRESSION_TOLERANCE:.3f}"
        )
    if best_raw_error > balanced_raw_error + BEST_REGRESSION_TOLERANCE:
        raise SystemExit(
            f"{label}: Best raw error {best_raw_error:.3f} regressed beyond Balanced "
            f"{balanced_raw_error:.3f} + {BEST_REGRESSION_TOLERANCE:.3f}"
        )
    if (
        best_metrics["graphemeCer"]
        > balanced_metrics["graphemeCer"] + BEST_REGRESSION_TOLERANCE
    ):
        raise SystemExit(
            f"{label}: Best grapheme CER {best_metrics['graphemeCer']:.3f} regressed "
            f"beyond Balanced {balanced_metrics['graphemeCer']:.3f} + "
            f"{BEST_REGRESSION_TOLERANCE:.3f}"
        )
    if (
        best_metrics["wordErrorRate"] is not None
        and balanced_metrics["wordErrorRate"] is not None
        and best_metrics["wordErrorRate"]
        > balanced_metrics["wordErrorRate"] + BEST_REGRESSION_TOLERANCE
    ):
        raise SystemExit(
            f"{label}: Best WER {best_metrics['wordErrorRate']:.3f} regressed beyond "
            f"Balanced {balanced_metrics['wordErrorRate']:.3f} + "
            f"{BEST_REGRESSION_TOLERANCE:.3f}"
        )
    if language == "auto":
        for result in (balanced_result, best_result):
            if "korean-PP-OCRv5" not in str(result.get("modelVersion", "")):
                raise SystemExit("language=auto did not load and report the Korean recognizer")
    if category in ("clean", "ui"):
        for quality, result in (("balanced", balanced_result), ("best", best_result)):
            if not normalized_text(result.get("text", "")):
                raise SystemExit(f"{label}: {quality} returned an empty {category} result")
    return balanced_result, best_result


def contains_hangul(value):
    return any(
        "\u1100" <= character <= "\u11ff"
        or "\u3130" <= character <= "\u318f"
        or "\uac00" <= character <= "\ud7af"
        for character in str(value)
    )


def runtime_tree_snapshot():
    return tuple(
        (path.relative_to(runtime_root).as_posix(), path.stat().st_size, path.stat().st_mtime_ns)
        for path in sorted(runtime_root.rglob("*"))
        if path.is_file()
    )


runtime = OcrRuntime(root=runtime_root)
for label, fixture, expected, language, maximum_error in FIXTURE_CASES:
    balanced_result, best_result = compare_qualities(
        label, fixture, expected, language, maximum_error
    )
    if label == "clean-auto":
        for result in (balanced_result, best_result):
            if contains_hangul(result.get("text", "")):
                raise SystemExit(
                    f"English auto-language fixture hallucinated Hangul: {result.get('text')!r}"
                )

evaluate_real_corpus(runtime, real_fixture_manifest, real_corpus_fixtures)

for label, path in (
    ("rotated-90-best", generated_rotation_90),
    ("rotated-180-best", generated_rotation),
    ("rotated-270-best", generated_rotation_270),
    ("skewed-best", generated_skew),
):
    recognize(
        runtime,
        label,
        path,
        FIXTURE_CASES[0][2],
        quality="best",
        language="en",
        maximum_error=0.20,
    )
compare_qualities("korean", generated_korean, korean_text, "ko", 0.30)
compare_qualities("mixed-script", generated_mixed, mixed_text, "auto", 0.40)
for label, path, expected, language, _font_path in language_cases:
    compare_qualities(label, path, expected, language, 0.35)

for cohort_language, (cohort_text, cohorts) in language_cohort_cases.items():
    for cohort_category in REQUIRED_LANGUAGE_COHORTS:
        cohort_path, cohort_boxes = cohorts[cohort_category]
        maximum_grapheme_cer, maximum_word_error = COHORT_LIMITS[cohort_category]
        compare_qualities(
            f"language-{cohort_language}-{cohort_category}",
            cohort_path,
            cohort_text,
            cohort_language,
            maximum_grapheme_cer,
            category=cohort_category,
            expected_boxes=cohort_boxes,
            maximum_grapheme_cer=maximum_grapheme_cer,
            maximum_word_error=maximum_word_error,
            minimum_polygon_coverage_required=0.30,
            raw_maximum_error=min(maximum_grapheme_cer + 0.15, 0.65),
        )
record_memory_checkpoint("language-cohorts-complete")

boundary_balanced_error, boundary_balanced_raw, boundary_balanced_result, _ = recognize(
    runtime,
    "large-boundary-balanced",
    generated_boundary,
    boundary_text,
    quality="balanced",
    language="en",
    maximum_error=0.05,
)
boundary_best_error, boundary_best_raw, boundary_best_result, _ = recognize(
    runtime,
    "large-boundary-rotated-enhanced-auto-best",
    generated_boundary_rotated,
    boundary_text,
    quality="best",
    language="auto",
    maximum_error=0.05,
    enhance=True,
)
if boundary_best_error > boundary_balanced_error + BEST_REGRESSION_TOLERANCE:
    raise SystemExit("40 MP rotated/enhanced Best regressed beyond Balanced")
if boundary_best_raw > boundary_balanced_raw + BEST_REGRESSION_TOLERANCE:
    raise SystemExit("40 MP rotated/enhanced Best raw text regressed beyond Balanced")
for quality, boundary_result in (
    ("balanced", boundary_balanced_result),
    ("best", boundary_best_result),
):
    if normalized_text(boundary_result.get("text", "")) != normalized_text(boundary_text):
        raise SystemExit(
            f"large-boundary-{quality}: tiled OCR duplicated or fragmented the boundary line: "
            f"{boundary_result.get('text')!r}"
        )
record_memory_checkpoint("40mp-boundary-complete")
recognize(
    runtime,
    "clean-enhanced-best",
    FIXTURE_CASES[0][1],
    FIXTURE_CASES[0][2],
    quality="best",
    language="auto",
    maximum_error=0.12,
    enhance=True,
)
recognize(
    runtime,
    "noisy-enhanced-best",
    generated_noisy,
    noisy_text,
    quality="best",
    language="en",
    maximum_error=0.25,
    enhance=True,
)
for label, category, path, quality, enhance in (
    ("blank-balanced", "blank", generated_blank, "balanced", False),
    ("blank-best", "blank", generated_blank, "best", False),
    ("blank-enhanced-best", "blank", generated_blank, "best", True),
    ("noise-balanced", "noise", generated_noise_only, "balanced", False),
    ("noise-best", "noise", generated_noise_only, "best", False),
):
    started = time.perf_counter()
    negative_result = runtime.recognize_image(
        path,
        {"enhance": enhance, "language": "auto", "quality": quality},
    )
    assert_runtime_result(label, negative_result, quality)
    negative_metrics = text_quality_metrics(negative_result.get("text", ""), "", "auto")
    if negative_metrics["actualGraphemes"] or negative_metrics["insertionCount"]:
        failure = (
            "Blank OCR hallucinated text"
            if category == "blank"
            else "Noise OCR hallucinated text"
        )
        raise SystemExit(
            f"{failure}: {negative_result.get('text')!r}"
        )
    quality_report["cases"].append(
        {
            "label": label,
            "category": category,
            "language": "auto",
            "quality": quality,
            "enhance": enhance,
            "alnumCer": 0.0,
            "rawCer": 0.0,
            "graphemeCer": 0.0,
            "wordErrorRate": 0.0,
            "insertionCount": negative_metrics["insertionCount"],
            "deletionCount": negative_metrics["deletionCount"],
            "substitutionCount": negative_metrics["substitutionCount"],
            "expectedGraphemes": 0,
            "actualGraphemes": negative_metrics["actualGraphemes"],
            "catastrophicFailure": False,
            "polygonCoverage": None,
            "latencyMs": round((time.perf_counter() - started) * 1000, 3),
            "characters": 0,
        }
    )
    print(f"PASS: {label} returned no text")

# Exercise the runtime's multi-page aggregation with deliberately unsorted
# selected page inputs. Page two must be absent and selected pages must be
# recalled exactly once in ascending document order.
pdf_started = time.perf_counter()
pdf_result = runtime.recognize_pages(
    ((3, pdf_page_paths[2]), (1, pdf_page_paths[0])),
    {"enhance": True, "language": "en", "quality": "best"},
)
assert_runtime_result("multipage-pdf-best", pdf_result, "best")
pdf_text = str(pdf_result.get("text", ""))
page_one_header = "--- Page 1 ---"
page_two_header = "--- Page 2 ---"
page_three_header = "--- Page 3 ---"
page_one_position = pdf_text.find(page_one_header)
page_three_position = pdf_text.find(page_three_header)
exact_page_recall = (
    pdf_result.get("pages") == 2
    and pdf_text.count(page_one_header) == 1
    and pdf_text.count(page_three_header) == 1
    and page_two_header not in pdf_text
    and normalized_text("PAGE ONE ALPHA 505") in normalized_text(pdf_text)
    and normalized_text("PAGE THREE OMEGA 505") in normalized_text(pdf_text)
    and normalized_text("PAGE TWO OMIT 505") not in normalized_text(pdf_text)
)
page_order_correct = 0 <= page_one_position < page_three_position
if not exact_page_recall or not page_order_correct:
    raise SystemExit(f"Multi-page PDF recall/order gate failed: {pdf_text[:500]!r}")
quality_report["pdf"] = {
    "fixture": generated_multipage_pdf.name,
    "requestedPages": [3, 1],
    "returnedPages": pdf_result["pages"],
    "recalledPages": [1, 3],
    "exactPageRecall": exact_page_recall,
    "pageOrderCorrect": page_order_correct,
    "latencyMs": round((time.perf_counter() - pdf_started) * 1000, 3),
}
print("PASS: multi-page PDF selected-page recall and order")

# A warmed runtime must not write caches or mutate immutable runtime files on
# repeated identical inference.
before_repeat = runtime_tree_snapshot()
for repeat in (1, 2):
    recognize(
        runtime,
        f"repeat-clean-best-{repeat}",
        FIXTURE_CASES[0][1],
        FIXTURE_CASES[0][2],
        quality="best",
        language="auto",
        maximum_error=0.12,
    )
after_repeat = runtime_tree_snapshot()
if after_repeat != before_repeat:
    raise SystemExit("Repeated OCR inference mutated the immutable runtime tree")
quality_report["runtimeFileCount"] = len(after_repeat)
quality_report["runtimeBytes"] = sum(record[1] for record in after_repeat)
record_memory_checkpoint("quality-complete")
PY

# Prove every advertised Fast language through the same extractText path used
# by image jobs. The generated fixtures above are deterministic and remain
# separate from the frozen real-corpus release gate.
OCR_QUALITY_REPORT="${OCR_VERIFY_REPORT_DIR}/ocr-${TARGET}-${OCR_VERIFY_ENVIRONMENT}.quality.json"
timeout --signal=TERM --kill-after=10s "${OCR_VERIFY_TIMEOUT_SECONDS}s" \
  env HF_HUB_OFFLINE=1 NO_PROXY='*' OCR_QUALITY_REPORT="${OCR_QUALITY_REPORT}" \
  SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0 SNAPOTTER_NETWORK_DISABLED=1 \
  TESSERACT_PATH=/usr/bin/tesseract TRANSFORMERS_OFFLINE=1 no_proxy='*' \
  /app/apps/api/node_modules/.bin/tsx -e '
    import { createHash } from "node:crypto";
    import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
    import { extractText } from "/app/packages/ai/src/ocr.ts";
    const main = async () => {
    const cases = [
      ["fast-auto-clean", "/fixtures/image/valid/ocr-clean.png", "The quick brown fox 12345", "auto", 0.15],
      ["fast-de-clean", "/tmp/verify-ocr-german.png", "Falsches Üben quält größere Zwerge 505", "de", 0.20],
      ["fast-en-clean", "/fixtures/image/valid/ocr-clean.png", "The quick brown fox 12345", "en", 0.15],
      ["fast-es-clean", "/tmp/verify-ocr-spanish.png", "El murciélago comió kiwi y piña 505", "es", 0.20],
      ["fast-fr-clean", "/tmp/verify-ocr-french.png", "Élève français, déjà prêt pour OCR 505", "fr", 0.20],
      ["fast-ja-clean", "/fixtures/image/valid/ocr-japanese.png", "日本語の表記においては，漢字や仮名だけでなく，ローマ字やアラビア数字，さらに句読点や括弧類などの記述記号を用いる。これらを組み合わせて表す日本語の文書では，表記上における種々の問題がある。", "ja", 0.40],
      ["fast-zh-clean", "/tmp/verify-ocr-chinese.png", "本地文字识别测试 505", "zh", 0.25],
    ];
    const normalize = (value) =>
      Array.from(value.normalize("NFKC").toLocaleLowerCase())
        .filter((character) => /[\p{L}\p{N}]/u.test(character));
    const editDistance = (actual, expected) => {
      let previous = Array.from({ length: actual.length + 1 }, (_, index) => index);
      for (let row = 1; row <= expected.length; row += 1) {
        const current = [row];
        for (let column = 1; column <= actual.length; column += 1) {
          current.push(
            Math.min(
              current[column - 1] + 1,
              previous[column] + 1,
              previous[column - 1] + (actual[column - 1] === expected[row - 1] ? 0 : 1),
            ),
          );
        }
        previous = current;
      }
      return previous[actual.length];
    };
    const reportPath = process.env.OCR_QUALITY_REPORT;
    const report = JSON.parse(await readFile(reportPath, "utf8"));
    const records = [];
    const persistFastLanguageReport = async (failureMessage) => {
      report.fastLanguageCohorts = {
        caseCount: records.length,
        expectedCaseCount: cases.length,
        languages: Array.from(new Set(records.map((record) => record.language))).sort(),
        releaseGatePassed:
          records.length === cases.length &&
          failureMessage === undefined &&
          records.every((record) => record.passed === true),
        releaseGateFailures: failureMessage === undefined ? [] : [failureMessage],
        cases: records,
      };
      const temporaryPath = `${reportPath}.fast-language.tmp`;
      await writeFile(temporaryPath, `${JSON.stringify(report)}\n`, {
        encoding: "utf8",
        mode: 0o600,
      });
      await rename(temporaryPath, reportPath);
    };
    for (const [id, imagePath, expected, language, maximumAlnumCer] of cases) {
      const scratch = await mkdtemp("/tmp/verify-ocr-fast-language-");
      const expectedNormalized = normalize(expected);
      let record;
      try {
        const image = await readFile(imagePath);
        const result = await extractText(image, scratch, { quality: "fast", language });
        const actualNormalized = normalize(result.text);
        const alnumCer =
          editDistance(actualNormalized, expectedNormalized) / Math.max(expectedNormalized.length, 1);
        const failures = [];
        if (result.engine !== "tesseract") failures.push(`engine=${result.engine}`);
        if (result.provider !== "native") failures.push(`provider=${result.provider}`);
        if (result.device !== "cpu") failures.push(`device=${result.device}`);
        if (result.requestedQuality !== "fast") {
          failures.push(`requestedQuality=${result.requestedQuality}`);
        }
        if (result.actualQuality !== "fast") {
          failures.push(`actualQuality=${result.actualQuality}`);
        }
        if (result.degraded !== false) failures.push(`degraded=${result.degraded}`);
        if (!Array.isArray(result.warnings)) failures.push("warnings is not an array");
        if (alnumCer > maximumAlnumCer) {
          failures.push(`CER ${alnumCer.toFixed(6)} > ${maximumAlnumCer.toFixed(6)}`);
        }
        const failureMessage =
          failures.length === 0
            ? undefined
            : `Fast OCR language gate failed: ${id} CER=${alnumCer.toFixed(6)} expectedNormalized=${JSON.stringify(expectedNormalized.join(""))} actualNormalized=${JSON.stringify(actualNormalized.join(""))}: ${failures.join(", ")}`;
        record = {
          id,
          language,
          alnumCer,
          maximumAlnumCer,
          expectedNormalized: expectedNormalized.join(""),
          actualNormalized: actualNormalized.join(""),
          engine: result.engine,
          provider: result.provider,
          device: result.device,
          actualQuality: result.actualQuality,
          passed: failureMessage === undefined,
          recognizedTextSha256: createHash("sha256").update(result.text).digest("hex"),
          warnings: result.warnings,
        };
        records.push(record);
        await persistFastLanguageReport(failureMessage);
        if (failureMessage) throw new Error(failureMessage);
      } catch (error) {
        if (record === undefined) {
          const failureMessage =
            `Fast OCR language gate failed before recognition completed: ${id} ` +
            `expectedNormalized=${JSON.stringify(expectedNormalized.join(""))} ` +
            `actualNormalized="": ${error instanceof Error ? error.message : String(error)}`;
          record = {
            id,
            language,
            maximumAlnumCer,
            expectedNormalized: expectedNormalized.join(""),
            actualNormalized: "",
            passed: false,
            error: error instanceof Error ? error.message : String(error),
          };
          records.push(record);
          await persistFastLanguageReport(failureMessage);
        }
        throw error;
      } finally {
        await rm(scratch, { force: true, recursive: true });
      }
    }
    };
    main().catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
  '

python3 - "${OCR_VERIFY_REPORT_DIR}/ocr-${TARGET}-${OCR_VERIFY_ENVIRONMENT}.quality.json" <<'PY'
import json
import pathlib
import sys

report = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
if report.get("provider") != "CPUExecutionProvider" or not report.get("cases"):
    raise SystemExit("OCR quality report is incomplete")
if report.get("minimumMemoryBytes") != 4 * 1024 * 1024 * 1024:
    raise SystemExit("OCR quality report has the wrong signed memory policy")
required_fast_languages = {"auto", "de", "en", "es", "fr", "ja", "zh"}
required_languages = required_fast_languages | {"ko"}
required_fast_language_case_ids = {
    "fast-auto-clean",
    "fast-de-clean",
    "fast-en-clean",
    "fast-es-clean",
    "fast-fr-clean",
    "fast-ja-clean",
    "fast-zh-clean",
}
fast_language_cohorts = report.get("fastLanguageCohorts")
if (
    not isinstance(fast_language_cohorts, dict)
    or fast_language_cohorts.get("caseCount") != len(required_fast_language_case_ids)
    or fast_language_cohorts.get("expectedCaseCount") != len(required_fast_language_case_ids)
    or fast_language_cohorts.get("languages") != sorted(required_fast_languages)
    or fast_language_cohorts.get("releaseGatePassed") is not True
    or fast_language_cohorts.get("releaseGateFailures") != []
    or not isinstance(fast_language_cohorts.get("cases"), list)
    or len(fast_language_cohorts["cases"]) != len(required_fast_language_case_ids)
):
    raise SystemExit("OCR quality report omitted the exact Fast language gate")
if {case.get("id") for case in fast_language_cohorts["cases"] if isinstance(case, dict)} != required_fast_language_case_ids:
    raise SystemExit("OCR quality report omitted or duplicated an exact Fast language case")
for case in fast_language_cohorts["cases"]:
    if (
        not isinstance(case, dict)
        or case.get("language") not in required_fast_languages
        or case.get("engine") != "tesseract"
        or case.get("provider") != "native"
        or case.get("device") != "cpu"
        or case.get("actualQuality") != "fast"
        or case.get("passed") is not True
        or not isinstance(case.get("alnumCer"), (int, float))
        or not isinstance(case.get("maximumAlnumCer"), (int, float))
        or case["alnumCer"] > case["maximumAlnumCer"]
        or not isinstance(case.get("expectedNormalized"), str)
        or not isinstance(case.get("actualNormalized"), str)
        or not isinstance(case.get("recognizedTextSha256"), str)
        or len(case["recognizedTextSha256"]) != 64
        or not isinstance(case.get("warnings"), list)
    ):
        raise SystemExit(f"Exact Fast language case is malformed or failed: {case!r}")
required_language_cohorts = {
    "clean",
    "ui",
    "scene",
    "degradation",
    "rotation-90",
    "rotation-180",
    "rotation-270",
    "small-angle",
}
observed = {
    (case.get("language"), case.get("quality"))
    for case in report["cases"]
}
for language in required_languages:
    for quality in ("balanced", "best"):
        if (language, quality) not in observed:
            raise SystemExit(f"OCR quality report omitted {language}/{quality}")
cohort_observed = {
    (case.get("language"), case.get("category"), case.get("quality"))
    for case in report["cases"]
}
for language in required_languages:
    for category in required_language_cohorts:
        for quality in ("balanced", "best"):
            if (language, category, quality) not in cohort_observed:
                raise SystemExit(
                    f"OCR quality report omitted {language}/{category}/{quality}"
                )
if not any(case.get("label") == "large-boundary-rotated-enhanced-auto-best" for case in report["cases"]):
    raise SystemExit("OCR quality report omitted the rotated 40 MP Best gate")


def is_unsupported_korean_fast_case(case):
    return (
        case.get("fixtureId") == "commons-hagye-station-715"
        and case.get("quality") == "fast"
        and case.get("releaseGatePassed") is None
        and case.get("releaseGateStatus") == "unsupported-by-design"
        and case.get("supported") is False
        and case.get("decisionEnforced") is True
    )


if not all(
    is_unsupported_korean_fast_case(case)
    or (
        isinstance(case.get("alnumCer"), (int, float))
        and isinstance(case.get("rawCer"), (int, float))
        and isinstance(case.get("graphemeCer"), (int, float))
        and (
            case.get("wordErrorRate") is None
            or isinstance(case.get("wordErrorRate"), (int, float))
        )
        and isinstance(case.get("insertionCount"), int)
        and isinstance(case.get("deletionCount"), int)
        and isinstance(case.get("substitutionCount"), int)
        and isinstance(case.get("catastrophicFailure"), bool)
        and isinstance(case.get("latencyMs"), (int, float))
        and case["latencyMs"] >= 0
    )
    for case in report["cases"]
):
    raise SystemExit("OCR quality report has malformed metrics")
if report.get("catastrophicFailureCount") != 0:
    raise SystemExit("OCR quality report contains a catastrophic failure")
if report.get("hallucinatedInsertionCount") != 0:
    raise SystemExit("Blank/noise OCR quality gates hallucinated inserted graphemes")
if report.get("insertionCount") != sum(case["insertionCount"] for case in report["cases"]):
    raise SystemExit("OCR quality report insertion aggregate is inconsistent")
for case in report["cases"]:
    if case.get("category") not in required_language_cohorts:
        continue
    if case["language"] in {"zh", "ja"}:
        if case.get("wordErrorRate") is not None:
            raise SystemExit(f"Unsegmented {case['language']} cohort reported inappropriate WER")
    elif not isinstance(case.get("wordErrorRate"), (int, float)):
        raise SystemExit(f"Segmented {case['language']} cohort omitted WER")
    coverage = case.get("polygonCoverage")
    if not isinstance(coverage, (int, float)) or coverage < 0.30:
        raise SystemExit(
            f"OCR cohort has insufficient polygon coverage: {case.get('label')}"
        )

expected_real_fixtures = {
    "jawildtext-board-0001": (
        "board-or-sign",
        "ja",
        "ja",
        "annotation-token-coverage",
    ),
    "jawildtext-board-0049": (
        "board-or-sign",
        "ja",
        "ja",
        "annotation-token-coverage",
    ),
    "jawildtext-board-0127": (
        "board-or-sign",
        "ja",
        "ja",
        "annotation-token-coverage",
    ),
    "commons-hagye-station-715": (
        "board-or-sign",
        "ko",
        "ko",
        "annotation-token-coverage",
    ),
    "jawildtext-receipt-11120": (
        "mobile-receipt",
        "ja",
        "ja",
        "annotation-token-coverage",
    ),
    "cord-v2-test-0080": (
        "mobile-receipt",
        "id",
        "auto",
        "annotation-token-coverage",
    ),
    "clinocr-poor-t7-s2": (
        "photographed-form",
        "en",
        "en",
        "page-transcript",
    ),
}
expected_board_cohort = {
    "distinctRowGroups": [0, 1, 3],
    "fixtureIds": [
        "jawildtext-board-0001",
        "jawildtext-board-0049",
        "jawildtext-board-0127",
    ],
    "perImageFastFloor": {
        "minimumTokenF1": 0.32,
        "minimumTokenPrecision": 0.50,
        "minimumTokenRecall": 0.25,
    },
    "selectionRule": (
        "The smallest byte-for-byte source image in each of row groups 0, 1, and 3; "
        "image-only visual/privacy review confirmed distinct conditions and safe public content."
    ),
    "selectionStatus": "FROZEN_BEFORE_ANY_OCR_OUTPUT",
    "stopPolicy": (
        "If any frozen cohort image fails after the general development-corpus fix, "
        "stop rotating fixtures and reconsider the Fast CJK architecture."
    ),
}
expected_korean_cohort = {
    "fastDisposition": {
        "accurateTierResults": {
            "balanced": {
                "releaseGatePassed": True,
                "tokenF1": 0.692308,
                "tokenPrecision": 0.9,
                "tokenRecall": 0.5625,
            },
            "best": {
                "releaseGatePassed": True,
                "tokenF1": 0.692308,
                "tokenPrecision": 0.9,
                "tokenRecall": 0.5625,
            },
        },
        "boundedStrategyAudit": {
            "diagnosticManifestSha256": "8e82e22b5d939ca40e97d8a74e8ce73dda451e99ba8b33a95a94723c4679d1b4",
            "failed": 6,
            "tested": 6,
        },
        "decision": {
            "enforcedBehavior": "reject-before-tesseract-spawn",
            "unsupportedReason": (
                "Fast OCR does not support Korean. Install the Accurate OCR bundle "
                "and choose Balanced or Best."
            ),
        },
        "evidence": {
            "artifactSha256": "42b9609dab9b8680c208d4b20828314ce912f3691bbd12114b31ab31b4cfbd05",
            "fastReportSha256": "0a9743c46e67aad7948d5a5880bfbd5096a4023c6006de5f94668580a2df276a",
            "fastText": "=\n< 하 계\n: Hagye 최\nㅜㅠ 좋\n==",
            "fastTextSha256": "6ddecdd52dd0a66074fb3c1d003a28493975f63421f70600706ccc01b7bb2c73",
            "qualityCheckpointSha256": "41e4c01959602c3c255c09210fd3203ab80eee696bf28578d1137bf07f38bab7",
            "sourceImageId": "sha256:127753b7916aea38eac139a4070af95854ccdc68f93a9c4d59618c7e8c7f4bfa",
            "verifierSha256": "d4f9e3c1572c7eba4f5157c2a70785233ceed0296cb734a50890e940d16dd2cf",
        },
        "fastResult": {
            "releaseGatePassed": False,
            "tokenF1": 0.214286,
            "tokenPrecision": 0.25,
            "tokenRecall": 0.1875,
        },
        "status": "REJECTED_AFTER_FROZEN_GATE",
    },
    "fixtureIds": ["commons-hagye-station-715"],
    "perImageTierFloors": {
        "balanced": {
            "minimumTokenF1": 0.56,
            "minimumTokenPrecision": 0.65,
            "minimumTokenRecall": 0.50,
        },
        "best": {
            "minimumTokenF1": 0.60,
            "minimumTokenPrecision": 0.68,
            "minimumTokenRecall": 0.55,
        },
        "fast": {
            "minimumTokenF1": 0.32,
            "minimumTokenPrecision": 0.50,
            "minimumTokenRecall": 0.25,
        },
    },
    "selectionRule": (
        "On 2026-07-13, enumerate original bitmap files in Wikimedia Commons "
        "Category:Train station signs of Seoul Subway Line 7, sort by byte size "
        "ascending, retain public-domain landscape photographs at least 500×400 "
        "with no people or private data and manually legible Hangul, Latin, and "
        "Arabic digits, then choose the smallest. Hagye01.jpg is the first eligible "
        "file; the smaller public-domain Junggokst01.jpg is only 411×308."
    ),
    "selectionStatus": "FROZEN_BEFORE_ANY_OCR_OUTPUT",
    "stopPolicy": (
        "If the frozen Korean fixture fails, do not swap or edit the fixture, "
        "transcript, or limits; reconsider the Korean Fast model."
    ),
}
real_corpus = report.get("realCorpus")
held_out_policy = (
    "These files are regression inputs only and must not be used to tune OCR models "
    "or acceptance thresholds after observing their outputs."
)
if (
    not isinstance(real_corpus, dict)
    or real_corpus.get("manifest") != "/fixtures/ocr-real/manifest.json"
    or real_corpus.get("manifestSha256")
    != "979c2ce9fbae524a2627e3b12ba785d5f3c2d73b2c372d486e66f7a1fd248f5f"
    or real_corpus.get("manifestSchemaVersion") != 1
    or real_corpus.get("heldOutPolicy") != held_out_policy
    or real_corpus.get("boardCohort") != expected_board_cohort
    or real_corpus.get("koreanCohort") != expected_korean_cohort
    or real_corpus.get("fixtureCount") != len(expected_real_fixtures)
    or real_corpus.get("caseCount") != len(expected_real_fixtures) * 3
    or real_corpus.get("qualities") != ["fast", "balanced", "best"]
    or real_corpus.get("releaseGatePassed") is not True
    or real_corpus.get("releaseGateFailures") != []
    or "calibration" in real_corpus
    or not isinstance(real_corpus.get("fixtures"), list)
):
    raise SystemExit(f"OCR real-corpus summary is incomplete: {real_corpus!r}")
summary_identities = {
    (
        fixture.get("id"),
        fixture.get("category"),
        fixture.get("sourceLanguage"),
        fixture.get("evaluationMode"),
    )
    for fixture in real_corpus["fixtures"]
    if isinstance(fixture, dict)
}
expected_summary_identities = {
    (fixture_id, category, source_language, evaluation_mode)
    for fixture_id, (
        category,
        source_language,
        _selector,
        evaluation_mode,
    ) in expected_real_fixtures.items()
}
if summary_identities != expected_summary_identities:
    raise SystemExit("OCR real-corpus summary fixture identities drifted")

real_cases = [case for case in report["cases"] if case.get("fixtureId")]
real_case_map = {
    (case.get("fixtureId"), case.get("quality")): case for case in real_cases
}
expected_real_cases = {
    (fixture_id, quality)
    for fixture_id in expected_real_fixtures
    for quality in ("fast", "balanced", "best")
}
if len(real_cases) != len(expected_real_cases) or set(real_case_map) != expected_real_cases:
    raise SystemExit("OCR quality report omitted a required real fixture/tier")
for (fixture_id, quality), case in real_case_map.items():
    category, source_language, selector, evaluation_mode = expected_real_fixtures[fixture_id]
    repository_revision = case.get("repositoryRevision")
    repository_revision_valid = (
        repository_revision == "1234274506"
        if fixture_id == "commons-hagye-station-715"
        else isinstance(repository_revision, str)
        and len(repository_revision) == 40
        and all(character in "0123456789abcdef" for character in repository_revision)
    )
    if fixture_id == "commons-hagye-station-715" and quality == "fast":
        if (
            case.get("category") != f"real-{category}"
            or case.get("sourceLanguage") != source_language
            or case.get("language") != selector
            or case.get("evaluationMode") != evaluation_mode
            or case.get("enhance") is not False
            or case.get("actualQuality") is not None
            or case.get("engine") is not None
            or case.get("provider") is not None
            or case.get("device") is not None
            or case.get("thresholds")
            != expected_korean_cohort["perImageTierFloors"][quality]
            or not isinstance(case.get("upstreamId"), str)
            or not case["upstreamId"]
            or not repository_revision_valid
            or case.get("recognizedTextSha256") is not None
            or case.get("recognizedCharacters") != 0
            or case.get("catastrophicFailure") is not False
            or case.get("releaseGatePassed") is not None
            or case.get("releaseGateStatus") != "unsupported-by-design"
            or case.get("releaseGateFailures") != []
            or case.get("supported") is not False
            or case.get("decisionEnforced") is not True
            or case.get("tesseractSpawned") is not False
            or case.get("unsupportedReason")
            != (
                "Fast OCR does not support Korean. Install the Accurate OCR bundle "
                "and choose Balanced or Best."
            )
            or any(
                case.get(metric) is not None
                for metric in (
                    "alnumCer",
                    "rawCer",
                    "graphemeCer",
                    "wordErrorRate",
                    "diagnosticWordErrorRate",
                    "tokenRecall",
                    "tokenPrecision",
                    "tokenF1",
                    "matchedTokenCount",
                    "expectedTokenCount",
                    "actualTokenCount",
                    "hallucinatedTokenCount",
                )
            )
            or any(
                case.get(metric) != 0
                for metric in ("insertionCount", "deletionCount", "substitutionCount")
            )
            or not isinstance(case.get("latencyMs"), (int, float))
            or case["latencyMs"] < 0
        ):
            raise SystemExit("Korean Fast unsupported decision record drifted")
        continue
    if (
        case.get("category") != f"real-{category}"
        or case.get("sourceLanguage") != source_language
        or case.get("language") != selector
        or case.get("evaluationMode") != evaluation_mode
        or case.get("actualQuality") != quality
        or not isinstance(case.get("thresholds"), dict)
        or not isinstance(case.get("upstreamId"), str)
        or not case["upstreamId"]
        or not repository_revision_valid
        or not isinstance(case.get("recognizedTextSha256"), str)
        or len(case["recognizedTextSha256"]) != 64
        or not isinstance(case.get("recognizedCharacters"), int)
        or case["recognizedCharacters"] <= 0
        or case.get("catastrophicFailure") is not False
        or case.get("releaseGatePassed") is not True
        or case.get("releaseGateFailures") != []
    ):
        raise SystemExit(f"OCR real-corpus case identity drifted: {fixture_id}/{quality}")
    if quality == "fast":
        if (
            case.get("engine") != "tesseract"
            or case.get("provider") != "native"
            or case.get("device") != "cpu"
        ):
            raise SystemExit(f"OCR real-corpus Fast metadata drifted: {fixture_id}")
    elif (
        case.get("engine") != "rapidocr-onnx"
        or case.get("provider") != "CPUExecutionProvider"
        or case.get("device") != "cpu"
    ):
        raise SystemExit(f"OCR real-corpus accurate metadata drifted: {fixture_id}/{quality}")
    thresholds = case["thresholds"]
    if evaluation_mode == "annotation-token-coverage":
        if (
            set(thresholds)
            != {"minimumTokenRecall", "minimumTokenPrecision", "minimumTokenF1"}
            or (
                fixture_id == "commons-hagye-station-715"
                and thresholds != expected_korean_cohort["perImageTierFloors"][quality]
            )
            or not all(
                isinstance(case.get(metric), (int, float))
                for metric in ("tokenRecall", "tokenPrecision", "tokenF1")
            )
            or case.get("wordErrorRate") is not None
            or case["tokenRecall"] < thresholds["minimumTokenRecall"]
            or case["tokenPrecision"] < thresholds["minimumTokenPrecision"]
            or case["tokenF1"] < thresholds["minimumTokenF1"]
            or not isinstance(case.get("matchedTokenCount"), int)
            or not isinstance(case.get("expectedTokenCount"), int)
            or not isinstance(case.get("actualTokenCount"), int)
            or not isinstance(case.get("hallucinatedTokenCount"), int)
        ):
            raise SystemExit(
                f"OCR real token gate is incomplete or failed: {fixture_id}/{quality}"
            )
    elif (
        set(thresholds) != {"maximumGraphemeCer", "maximumWordErrorRate"}
        or not isinstance(case.get("wordErrorRate"), (int, float))
        or case["graphemeCer"] > thresholds["maximumGraphemeCer"]
        or case["wordErrorRate"] > thresholds["maximumWordErrorRate"]
    ):
        raise SystemExit(
            f"OCR real page-transcript gate is incomplete or failed: {fixture_id}/{quality}"
        )

for fixture_id, (_category, _language, _selector, evaluation_mode) in expected_real_fixtures.items():
    fast = real_case_map[(fixture_id, "fast")]
    balanced = real_case_map[(fixture_id, "balanced")]
    best = real_case_map[(fixture_id, "best")]
    if evaluation_mode == "annotation-token-coverage":
        for threshold in ("minimumTokenRecall", "minimumTokenPrecision", "minimumTokenF1"):
            if not (
                fast["thresholds"][threshold]
                < balanced["thresholds"][threshold]
                <= best["thresholds"][threshold]
            ):
                raise SystemExit(f"Accurate real token floor is not stricter: {fixture_id}")
        if best["tokenF1"] + 0.02 < balanced["tokenF1"]:
            raise SystemExit(f"Best real token F1 regressed beyond Balanced: {fixture_id}")
    else:
        for threshold in ("maximumGraphemeCer", "maximumWordErrorRate"):
            if not (
                fast["thresholds"][threshold]
                > balanced["thresholds"][threshold]
                >= best["thresholds"][threshold]
            ):
                raise SystemExit(f"Accurate real page ceiling is not stricter: {fixture_id}")
        if (
            best["graphemeCer"] > balanced["graphemeCer"] + 0.02
            or best["wordErrorRate"] > balanced["wordErrorRate"] + 0.02
        ):
            raise SystemExit(f"Best real page quality regressed beyond Balanced: {fixture_id}")

pdf = report.get("pdf")
if (
    not isinstance(pdf, dict)
    or pdf.get("requestedPages") != [3, 1]
    or pdf.get("returnedPages") != 2
    or pdf.get("recalledPages") != [1, 3]
    or pdf.get("exactPageRecall") is not True
    or pdf.get("pageOrderCorrect") is not True
):
    raise SystemExit("OCR quality report omitted exact multi-page PDF recall/order metrics")
memory_checkpoints = report.get("memoryCheckpoints")
expected_checkpoint_labels = [
    "fixtures-generated",
    "language-cohorts-complete",
    "40mp-boundary-complete",
    "quality-complete",
]
if (
    not isinstance(memory_checkpoints, list)
    or [checkpoint.get("label") for checkpoint in memory_checkpoints]
    != expected_checkpoint_labels
    or not all(
        isinstance(checkpoint.get("processMaxRssKiB"), int)
        and checkpoint["processMaxRssKiB"] >= 0
        and isinstance(checkpoint.get("cgroupCurrentBytes"), int)
        and checkpoint["cgroupCurrentBytes"] >= 0
        for checkpoint in memory_checkpoints
        if isinstance(checkpoint, dict)
    )
    or not all(isinstance(checkpoint, dict) for checkpoint in memory_checkpoints)
):
    raise SystemExit("OCR quality report omitted deterministic memory checkpoints")
peak = report.get("cgroupMemoryPeakBytes")
limit = report.get("cgroupMemoryLimitBytes")
if not isinstance(limit, int) or limit < 4 * 1024 * 1024 * 1024:
    raise SystemExit(f"OCR verification did not run with supported memory: {limit!r}")
if not isinstance(peak, int) or peak > 4 * 1024 * 1024 * 1024:
    raise SystemExit(f"OCR verification exceeded its 4 GiB cgroup budget: {peak!r}")
PY

# Exercise the application-owned descriptor validation, integrity hashing,
# generation lease, isolated child environment, and response protocol too. The
# native quality matrix above localizes model failures; this second pass proves
# the exact Node path used by image/PDF jobs can consume the activated runtime.
timeout --signal=TERM --kill-after=10s "${OCR_VERIFY_TIMEOUT_SECONDS}s" \
  env AI_DATA_DIR="${AI_DATA_DIR}" DATA_DIR="${DATA_DIR}" \
  OCR_RUNTIME_INDEX_KEY_ID="ci-runtime-verifier" \
  OCR_RUNTIME_INDEX_PUBLIC_KEY_PEM_B64="${INDEX_PUBLIC_KEY_PEM_B64}" \
  SNAPOTTER_OFFICIAL_CONTAINER=1 \
  OCR_ARCHIVE="${ARCHIVE}" \
  OCR_INSTALLER="${INSTALLER}" \
  OCR_LARGE_IMAGE="/tmp/verify-ocr-boundary.png" \
  OCR_LARGE_ROTATED_IMAGE="/tmp/verify-ocr-boundary-rotated.png" \
  OCR_MULTI_PAGE_PDF="/tmp/verify-ocr-multipage.pdf" \
  OCR_ROTATION_GENERATION="${ROTATION_GENERATION}" \
  OCR_ROTATION_INDEX="${ROTATION_INDEX}" \
  OCR_ROTATION_INDEX_SHA256="${ROTATION_INDEX_SHA}" \
  OCR_ROTATION_REPORT="/tmp/verify-ocr-rotation-report.json" \
  OCR_RUNTIME_ROOT="${RUNTIME_ROOT}" \
  OCR_SMOKE_COMMAND="${SMOKE_COMMAND}" \
  OCR_TARGET="${TARGET}" \
  OCR_VERIFY_TIMEOUT_MS="$((OCR_VERIFY_TIMEOUT_SECONDS * 1000))" \
  OCR_SMOKE_IMAGE="/fixtures/image/valid/ocr-clean.png" \
  OCR_SMOKE_PDF="/fixtures/document/valid/ocr-scanned.pdf" \
  /app/apps/api/node_modules/.bin/tsx -e '
    import { execFile as execFileCallback } from "node:child_process";
    import { access, copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
    import { join } from "node:path";
    import { promisify } from "node:util";
    import { extractPdfText, extractText } from "/app/packages/ai/src/ocr.ts";
    import {
      drainOcrDispatcher,
      handoffOcrDispatcher,
      probeOcrDispatcher,
      runOcrRuntime,
    } from "/app/packages/ai/src/ocr-runtime-dispatcher.ts";
    import { getOcrRuntimeCapability } from "/app/packages/ai/src/runtime-state.ts";
    const execFile = promisify(execFileCallback);
    const generationExclusiveLockAvailable = async (path) => {
      try {
        await execFile(
          "/usr/bin/python3",
          [
            "-c",
            `import fcntl, os, sys
descriptor = os.open(sys.argv[1], os.O_RDWR | os.O_CLOEXEC | os.O_NOFOLLOW)
try:
    try:
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        raise SystemExit(73)
finally:
    os.close(descriptor)`,
            path,
          ],
          { timeout: 5_000 },
        );
        return true;
      } catch (error) {
        if (error && typeof error === "object" && error.code === 73) return false;
        throw error;
      }
    };
    const requestTimeoutMs = Number(process.env.OCR_VERIFY_TIMEOUT_MS);
    const requiredEnv = (name) => {
      const value = process.env[name];
      if (!value) throw new Error(`Missing OCR verifier environment variable: ${name}`);
      return value;
    };
    const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
    const readCgroupCurrentBytes = async () => {
      for (const path of [
        "/sys/fs/cgroup/memory.current",
        "/sys/fs/cgroup/memory/memory.usage_in_bytes",
        "/sys/fs/cgroup/memory.usage_in_bytes",
      ]) {
        try {
          const value = (await readFile(path, "ascii")).trim();
          if (/^[0-9]+$/.test(value)) return Number(value);
        } catch {}
      }
      throw new Error("Unable to read OCR rotation cgroup memory.current");
    };
    const runtimePids = async (runtimeRoot) => {
      const normalizedRoot = runtimeRoot.endsWith("/") ? runtimeRoot.slice(0, -1) : runtimeRoot;
      const pids = [];
      for (const entry of await readdir("/proc", { withFileTypes: true })) {
        if (!entry.isDirectory() || !/^[0-9]+$/.test(entry.name)) continue;
        try {
          const command = await readFile(`/proc/${entry.name}/cmdline`, "utf8");
          const arguments_ = command.split("\0").filter(Boolean);
          if (
            arguments_.some(
              (argument) =>
                argument === normalizedRoot || argument.startsWith(`${normalizedRoot}/`),
            )
          ) {
            pids.push(Number(entry.name));
          }
        } catch {}
      }
      return pids.sort((left, right) => left - right);
    };
    void (async () => {
      try {
        const capability = getOcrRuntimeCapability({ aiDataDir: process.env.AI_DATA_DIR });
        if (!capability.available) {
          throw new Error(
            `Installed OCR runtime was not discoverable: ${capability.status}: ${capability.reason}`,
          );
        }

      const fastScratch = "/tmp/verify-fast-image-ocr";
      await mkdir(fastScratch, { recursive: true });
      const fast = await extractText(
        await readFile(process.env.OCR_SMOKE_IMAGE),
        fastScratch,
        { enhance: true, language: "en", quality: "fast" },
      );
      if (
        !fast.text.toLowerCase().includes("quick brown fox") ||
        fast.engine !== "tesseract" ||
        fast.provider !== "native" ||
        fast.device !== "cpu" ||
        fast.actualQuality !== "fast"
      ) {
        throw new Error(`Node Fast OCR lifecycle smoke failed: ${JSON.stringify(fast)}`);
      }
      process.stdout.write("PASS: application Fast OCR lifecycle\n");

      const pdfPath = "/tmp/verify-ocr-scanned.pdf";
      await copyFile(process.env.OCR_SMOKE_PDF, pdfPath);
      const fastPdf = await extractPdfText(
        pdfPath,
        { enhance: true, language: "en", pages: "1", quality: "fast" },
      );
      if (
        fastPdf.pages !== 1 ||
        !fastPdf.text.toLowerCase().includes("brain") ||
        fastPdf.engine !== "tesseract" ||
        fastPdf.provider !== "native" ||
        fastPdf.device !== "cpu" ||
        fastPdf.actualQuality !== "fast"
      ) {
        throw new Error(`Node Fast PDF OCR lifecycle smoke failed: ${JSON.stringify(fastPdf)}`);
      }
      process.stdout.write("PASS: application Fast PDF OCR lifecycle\n");

      const response = await runOcrRuntime(
        "ocr",
        [
          process.env.OCR_SMOKE_IMAGE,
          JSON.stringify({ enhance: true, language: "auto", quality: "best" }),
        ],
        { aiDataDir: process.env.AI_DATA_DIR, timeoutMs: requestTimeoutMs },
      );
      const result = response.result;
      if (
        typeof result !== "object" ||
        result === null ||
        result.success !== true ||
        !String(result.text ?? "").toLowerCase().includes("quick brown fox") ||
        result.provider !== "CPUExecutionProvider" ||
        result.device !== "cpu" ||
        result.actualQuality !== "best" ||
        !String(result.modelVersion ?? "").startsWith("PP-OCRv6-best-v1-") ||
        !String(result.modelVersion ?? "").includes("korean-PP-OCRv5")
      ) {
        throw new Error(`Node OCR lifecycle smoke failed: ${JSON.stringify(result)}`);
      }
      process.stdout.write("PASS: application OCR runtime lifecycle\n");

      const pdf = await extractPdfText(
        pdfPath,
        { enhance: true, language: "en", pages: "1", quality: "best" },
      );
      if (
        pdf.pages !== 1 ||
        !String(pdf.text ?? "").toLowerCase().includes("brain") ||
        pdf.provider !== "CPUExecutionProvider" ||
        pdf.device !== "cpu" ||
        pdf.actualQuality !== "best" ||
        !String(pdf.modelVersion ?? "").startsWith("PP-OCRv6-best-v1-")
      ) {
        throw new Error(`Node PDF OCR lifecycle smoke failed: ${JSON.stringify(pdf)}`);
      }
        process.stdout.write("PASS: application PDF OCR raster/runtime lifecycle\n");

        const selectedPdf = await extractPdfText(
          process.env.OCR_MULTI_PAGE_PDF,
          { enhance: true, language: "en", pages: "3,1", quality: "best" },
        );
        const selectedText = String(selectedPdf.text ?? "");
        const normalizeOcrText = (value) =>
          String(value).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
        const pageOnePosition = selectedText.indexOf("--- Page 1 ---");
        const pageThreePosition = selectedText.indexOf("--- Page 3 ---");
        if (
          selectedPdf.pages !== 2 ||
          pageOnePosition < 0 ||
          pageThreePosition <= pageOnePosition ||
          selectedText.includes("--- Page 2 ---") ||
          !normalizeOcrText(selectedText).includes(normalizeOcrText("PAGE ONE ALPHA 505")) ||
          !normalizeOcrText(selectedText).includes(normalizeOcrText("PAGE THREE OMEGA 505")) ||
          normalizeOcrText(selectedText).includes(normalizeOcrText("PAGE TWO OMIT 505"))
        ) {
          throw new Error(
            `Node multi-page PDF selection/recall/order failed: ${JSON.stringify(selectedPdf)}`,
          );
        }
        process.stdout.write("PASS: application multi-page PDF selection/recall/order\n");

        // Keep a real 40 MP Best request on the old child while the installer
        // extracts, smokes, hands off, and commits a distinct signed generation.
        // The 4 GiB policy must cover both model-heavy children during this
        // graceful rotation, not only one isolated quality process.
        const oldGeneration = response.runtime.generation;
        const oldRuntimeRoot = requiredEnv("OCR_RUNTIME_ROOT");
        const oldChildPids = await runtimePids(oldRuntimeRoot);
        if (oldChildPids.length !== 1) {
          throw new Error(`Expected one old OCR child before rotation: ${oldChildPids}`);
        }
        const rotationCgroupBaselineBytes = await readCgroupCurrentBytes();
        let rotationCgroupPeakBytes = rotationCgroupBaselineBytes;
        let rotationMemoryReadError = null;
        const memorySampler = setInterval(() => {
          void readCgroupCurrentBytes().then((value) => {
            rotationCgroupPeakBytes = Math.max(rotationCgroupPeakBytes, value);
          }).catch((error) => {
            rotationMemoryReadError = error;
          });
        }, 25);
        memorySampler.unref();
        const leasedRequest = runOcrRuntime(
          "ocr",
          [
            requiredEnv("OCR_LARGE_ROTATED_IMAGE"),
            JSON.stringify({ enhance: true, language: "auto", quality: "best" }),
          ],
          { aiDataDir: process.env.AI_DATA_DIR, timeoutMs: requestTimeoutMs },
        );
        const leaseDirectory = join(
          process.env.AI_DATA_DIR,
          "v3",
          "leases",
          "ocr",
          oldGeneration,
        );
        let observedLease = false;
        for (let attempt = 0; attempt < 100; attempt += 1) {
          try {
            observedLease = (await readdir(leaseDirectory)).some((name) => name.endsWith(".json"));
          } catch {}
          if (observedLease) break;
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        if (!observedLease) throw new Error("Application OCR request never acquired a lease");
        const oldGenerationLockPath = join(
          requiredEnv("AI_DATA_DIR"),
          "v3",
          "locks",
          "generations",
          "ocr",
          `${oldGeneration}.lock`,
        );
        await access(oldGenerationLockPath);
        const oldGenerationLockHeldDuringRequest =
          !(await generationExclusiveLockAvailable(oldGenerationLockPath));
        if (!oldGenerationLockHeldDuringRequest) {
          throw new Error("Active OCR request did not hold its shared generation kernel lock");
        }
        const installer = requiredEnv("OCR_INSTALLER");
        const { stdout: installStdout } = await execFile("/usr/bin/python3", [
          installer,
          "install",
          "--ai-data-dir",
          requiredEnv("AI_DATA_DIR"),
          "--index",
          requiredEnv("OCR_ROTATION_INDEX"),
          "--archive",
          requiredEnv("OCR_ARCHIVE"),
          "--family",
          "ocr",
          "--target",
          requiredEnv("OCR_TARGET"),
          "--expected-index-sha256",
          requiredEnv("OCR_ROTATION_INDEX_SHA256"),
          "--smoke-command",
          requiredEnv("OCR_SMOKE_COMMAND"),
          "--preverified-index",
        ], {
          env: {
            ...process.env,
            HF_HUB_OFFLINE: "1",
            NO_PROXY: "*",
            PIP_NO_INDEX: "1",
            PYTHONNOUSERSITE: "1",
            SNAPOTTER_ALLOW_MODEL_DOWNLOAD: "0",
            SNAPOTTER_NETWORK_DISABLED: "1",
            TRANSFORMERS_OFFLINE: "1",
            no_proxy: "*",
          },
        });
        const installResult = JSON.parse(installStdout);
        const rotationGeneration = requiredEnv("OCR_ROTATION_GENERATION");
        if (
          installResult.activated !== true ||
          installResult.generation !== rotationGeneration ||
          typeof installResult.generationRoot !== "string"
        ) {
          throw new Error(`Live OCR rotation install returned an invalid result: ${installStdout}`);
        }
        const handoff = await handoffOcrDispatcher({
          aiDataDir: process.env.AI_DATA_DIR,
          timeoutMs: requestTimeoutMs,
        });
        if (handoff.runtime.generation !== rotationGeneration) {
          throw new Error(`Live OCR handoff used the wrong generation: ${handoff.runtime.generation}`);
        }
        const oldLeaseStillActive = (await readdir(leaseDirectory)).some((name) =>
          name.endsWith(".json"),
        );
        if (!oldLeaseStillActive) {
          throw new Error("Old OCR request completed before the two-runtime handoff was proven");
        }
        const oldChildAliveDuringHandoff = (await runtimePids(oldRuntimeRoot)).some((pid) =>
          oldChildPids.includes(pid),
        );
        if (!oldChildAliveDuringHandoff) {
          throw new Error("Old OCR child exited before the new generation was published");
        }
        const { stdout: commitStdout } = await execFile("/usr/bin/python3", [
          installer,
          "commit",
          "--ai-data-dir",
          requiredEnv("AI_DATA_DIR"),
          "--family",
          "ocr",
          "--expected-generation",
          rotationGeneration,
        ]);
        const commitResult = JSON.parse(commitStdout);
        if (
          commitResult.committed !== true ||
          commitResult.family !== "ocr" ||
          commitResult.generation !== rotationGeneration
        ) {
          throw new Error(`Live OCR rotation commit returned an invalid result: ${commitStdout}`);
        }
        const probe = await probeOcrDispatcher({
          aiDataDir: process.env.AI_DATA_DIR,
          timeoutMs: requestTimeoutMs,
        });
        if (probe.runtime.generation !== rotationGeneration) {
          throw new Error(`Committed OCR rotation probe used ${probe.runtime.generation}`);
        }
        const newChildPids = await runtimePids(installResult.generationRoot);
        if (newChildPids.length !== 1 || oldChildPids.includes(newChildPids[0])) {
          throw new Error(`OCR rotation did not publish one distinct child: ${newChildPids}`);
        }

        // A manager is process-local, but activation state is shared across API
        // replicas. Publish this committed generation in a second Node process,
        // then deactivate it from this process while the original generation is
        // still leased by the real 40 MP request. Both idle managers must observe
        // the missing descriptor and retire; the old leased request must not.
        const remoteReplicaReadyPath = `/tmp/verify-ocr-remote-replica-${process.pid}.ready.json`;
        const remoteReplicaDonePath = `/tmp/verify-ocr-remote-replica-${process.pid}.done.json`;
        const remoteReplicaSource = String.raw`
          import { readFile, readdir, rename, writeFile } from "node:fs/promises";
          import {
            drainOcrDispatcher,
            rotateOcrDispatcher,
          } from "/app/packages/ai/src/ocr-runtime-dispatcher.ts";

          const requiredEnv = (name) => {
            const value = process.env[name];
            if (!value) throw new Error("Missing remote OCR verifier environment variable: " + name);
            return value;
          };
          const sleep = (milliseconds) =>
            new Promise((resolve) => setTimeout(resolve, milliseconds));
          const runtimePids = async (runtimeRoot) => {
            const normalizedRoot = runtimeRoot.endsWith("/")
              ? runtimeRoot.slice(0, -1)
              : runtimeRoot;
            const pids = [];
            for (const entry of await readdir("/proc", { withFileTypes: true })) {
              if (!entry.isDirectory() || !/^[0-9]+$/.test(entry.name)) continue;
              try {
                const command = await readFile("/proc/" + entry.name + "/cmdline", "utf8");
                const arguments_ = command.split("\0").filter(Boolean);
                if (
                  arguments_.some(
                    (argument) =>
                      argument === normalizedRoot ||
                      argument.startsWith(normalizedRoot + "/"),
                  )
                ) {
                  pids.push(Number(entry.name));
                }
              } catch {}
            }
            return pids.sort((left, right) => left - right);
          };
          const writeAtomicJson = async (path, value) => {
            const temporaryPath = path + ".tmp";
            await writeFile(temporaryPath, JSON.stringify(value) + "\n", "utf8");
            await rename(temporaryPath, path);
          };

          void (async () => {
            try {
              const aiDataDir = requiredEnv("AI_DATA_DIR");
              const runtimeRoot = requiredEnv("OCR_REMOTE_RUNTIME_ROOT");
              const expectedGeneration = requiredEnv("OCR_REMOTE_GENERATION");
              const beforePids = await runtimePids(runtimeRoot);
              const readiness = await rotateOcrDispatcher({
                aiDataDir,
                timeoutMs: Number(requiredEnv("OCR_VERIFY_TIMEOUT_MS")),
              });
              if (readiness.runtime.generation !== expectedGeneration) {
                throw new Error(
                  "Remote OCR replica published the wrong generation: " +
                    readiness.runtime.generation,
                );
              }
              const afterPids = await runtimePids(runtimeRoot);
              const childPids = afterPids.filter((pid) => !beforePids.includes(pid));
              if (childPids.length !== 1) {
                throw new Error(
                  "Remote OCR replica did not publish exactly one private child: " +
                    JSON.stringify({ beforePids, afterPids, childPids }),
                );
              }
              await writeAtomicJson(requiredEnv("OCR_REMOTE_REPLICA_READY"), {
                schemaVersion: 1,
                generation: expectedGeneration,
                childPids,
              });

              let remoteReplicaIdleChildExited = false;
              for (let attempt = 0; attempt < 400; attempt += 1) {
                const remaining = await runtimePids(runtimeRoot);
                if (!childPids.some((pid) => remaining.includes(pid))) {
                  remoteReplicaIdleChildExited = true;
                  break;
                }
                await sleep(100);
              }
              if (!remoteReplicaIdleChildExited) {
                throw new Error(
                  "Remote OCR replica did not retire its idle child after shared deactivation",
                );
              }
              await writeAtomicJson(requiredEnv("OCR_REMOTE_REPLICA_DONE"), {
                schemaVersion: 1,
                generation: expectedGeneration,
                childPids,
                remoteReplicaIdleChildExited,
              });
              process.stdout.write("PASS: remote OCR replica observed shared deactivation\n");
            } finally {
              await drainOcrDispatcher();
            }
          })().catch((error) => {
            console.error(error);
            process.exitCode = 1;
          });
        `;
        let remoteReplicaOutcome = null;
        const remoteReplicaProcess = execFile(
          "/app/apps/api/node_modules/.bin/tsx",
          ["-e", remoteReplicaSource],
          {
            env: {
              ...process.env,
              OCR_REMOTE_GENERATION: rotationGeneration,
              OCR_REMOTE_REPLICA_DONE: remoteReplicaDonePath,
              OCR_REMOTE_REPLICA_READY: remoteReplicaReadyPath,
              OCR_REMOTE_RUNTIME_ROOT: installResult.generationRoot,
            },
            maxBuffer: 1024 * 1024,
            timeout: 180_000,
          },
        ).then(
          (value) => {
            const outcome = { ok: true, value };
            remoteReplicaOutcome = outcome;
            return outcome;
          },
          (error) => {
            const outcome = { ok: false, error };
            remoteReplicaOutcome = outcome;
            return outcome;
          },
        );
        const waitForRemoteReport = async (path, label) => {
          for (let attempt = 0; attempt < 6_000; attempt += 1) {
            try {
              return JSON.parse(await readFile(path, "utf8"));
            } catch (error) {
              if (
                !(error instanceof SyntaxError) &&
                (!error || typeof error !== "object" || error.code !== "ENOENT")
              ) {
                throw error;
              }
            }
            if (remoteReplicaOutcome) {
              throw new Error(
                `Remote OCR replica exited before ${label}: ${JSON.stringify(remoteReplicaOutcome)}`,
              );
            }
            await sleep(25);
          }
          throw new Error(`Timed out waiting for remote OCR replica ${label}`);
        };
        const remoteReady = await waitForRemoteReport(remoteReplicaReadyPath, "publication");
        const remoteReplicaChildPids = remoteReady.childPids;
        if (
          remoteReady.schemaVersion !== 1 ||
          remoteReady.generation !== rotationGeneration ||
          !Array.isArray(remoteReplicaChildPids) ||
          remoteReplicaChildPids.length !== 1 ||
          remoteReplicaChildPids.some((pid) => newChildPids.includes(pid))
        ) {
          throw new Error(`Remote OCR replica publication was invalid: ${JSON.stringify(remoteReady)}`);
        }
        const oldLeaseActiveAtReplicaDeactivation = (await readdir(leaseDirectory)).some((name) =>
          name.endsWith(".json"),
        );
        if (!oldLeaseActiveAtReplicaDeactivation) {
          throw new Error("Old OCR request completed before shared replica deactivation");
        }

        const { stdout: deactivateStdout } = await execFile("/usr/bin/python3", [
          installer,
          "deactivate",
          "--ai-data-dir",
          requiredEnv("AI_DATA_DIR"),
          "--family",
          "ocr",
        ]);
        const deactivateResult = JSON.parse(deactivateStdout);
        const replicaDeactivationSucceeded =
          deactivateResult.deactivated === true && deactivateResult.family === "ocr";
        if (!replicaDeactivationSucceeded) {
          throw new Error(`Shared OCR deactivation returned an invalid result: ${deactivateStdout}`);
        }
        try {
          await access(join(requiredEnv("AI_DATA_DIR"), "v3", "active", "ocr.json"));
          throw new Error("Shared OCR deactivation retained the active descriptor");
        } catch (error) {
          if (!error || typeof error !== "object" || error.code !== "ENOENT") throw error;
        }
        await access(oldRuntimeRoot);
        const leasedGenerationPreservedAfterDeactivation = true;

        const remoteDone = await waitForRemoteReport(remoteReplicaDonePath, "drain");
        const remoteProcessOutcome = await remoteReplicaProcess;
        const remoteReplicaIdleChildExited =
          remoteDone.schemaVersion === 1 &&
          remoteDone.generation === rotationGeneration &&
          remoteDone.remoteReplicaIdleChildExited === true &&
          JSON.stringify(remoteDone.childPids) === JSON.stringify(remoteReplicaChildPids) &&
          remoteProcessOutcome.ok === true &&
          remoteProcessOutcome.value.stdout.includes(
            "PASS: remote OCR replica observed shared deactivation",
          );
        if (!remoteReplicaIdleChildExited) {
          throw new Error(
            `Remote OCR replica drain was incomplete: ${JSON.stringify({ remoteDone, remoteProcessOutcome })}`,
          );
        }

        let localIdleChildExited = false;
        for (let attempt = 0; attempt < 1_600; attempt += 1) {
          const current = await runtimePids(installResult.generationRoot);
          if (!newChildPids.some((pid) => current.includes(pid))) {
            localIdleChildExited = true;
            break;
          }
          await sleep(25);
        }
        if (!localIdleChildExited) {
          throw new Error("Primary OCR replica retained its idle child after shared deactivation");
        }
        const oldLeaseStillActiveAfterRemoteExit = (await readdir(leaseDirectory)).some((name) =>
          name.endsWith(".json"),
        );
        let deactivatedGenerationCollectedAfterReplicaDrain = false;
        try {
          await access(installResult.generationRoot);
        } catch (error) {
          if (!error || typeof error !== "object" || error.code !== "ENOENT") throw error;
          deactivatedGenerationCollectedAfterReplicaDrain = true;
        }
        if (!deactivatedGenerationCollectedAfterReplicaDrain) {
          throw new Error("Shared OCR deactivation retained its unleased generation root");
        }

        const leasedResponse = await leasedRequest;
        const leasedResult = leasedResponse.result;
        const oldRequestCompleted =
          leasedResponse.runtime.generation === oldGeneration &&
          String(leasedResult.text ?? "").includes("BOUNDARY OCR 505");
        if (!oldRequestCompleted) {
          throw new Error(`Old leased OCR request failed during rotation: ${JSON.stringify(leasedResult)}`);
        }
        const oldGenerationLockReleasedAfterRequest =
          await generationExclusiveLockAvailable(oldGenerationLockPath);
        if (!oldGenerationLockReleasedAfterRequest) {
          throw new Error("Completed OCR request retained its shared generation kernel lock");
        }
        let oldChildExited = false;
        for (let attempt = 0; attempt < 1_000; attempt += 1) {
          if ((await runtimePids(oldRuntimeRoot)).length === 0) {
            oldChildExited = true;
            break;
          }
          await sleep(25);
        }
        if (!oldChildExited) {
          throw new Error(`Old OCR child did not exit after graceful drain: ${oldChildPids}`);
        }
        clearInterval(memorySampler);
        if (rotationMemoryReadError) throw rotationMemoryReadError;
        rotationCgroupPeakBytes = Math.max(
          rotationCgroupPeakBytes,
          await readCgroupCurrentBytes(),
        );
        await writeFile(
          requiredEnv("OCR_ROTATION_REPORT"),
          `${JSON.stringify({
            schemaVersion: 1,
            oldGeneration,
            newGeneration: rotationGeneration,
            deactivatedGenerationCollectedAfterReplicaDrain,
            leasedGenerationPreservedAfterDeactivation,
            localIdleChildExited,
            oldChildAliveDuringHandoff,
            oldGenerationLockHeldDuringRequest,
            oldGenerationLockReleasedAfterRequest,
            oldLeaseActiveAtReplicaDeactivation,
            oldLeaseStillActiveAfterRemoteExit,
            oldRequestCompleted,
            oldChildExited,
            oldChildPids,
            newChildPids,
            remoteReplicaChildPids,
            remoteReplicaIdleChildExited,
            replicaDeactivationSucceeded,
            rotationCgroupBaselineBytes,
            rotationCgroupPeakBytes,
          })}\n`,
          "utf8",
        );
        await drainOcrDispatcher();
        await execFile("/usr/bin/python3", [
          installer,
          "gc",
          "--ai-data-dir",
          requiredEnv("AI_DATA_DIR"),
          "--keep-unreferenced",
          "0",
        ]);
        try {
          await access(oldRuntimeRoot);
          throw new Error("OCR GC retained the old generation after rotation drain");
        } catch (error) {
          if (!error || typeof error !== "object" || error.code !== "ENOENT") throw error;
        }
        try {
          await access(installResult.generationRoot);
          throw new Error("OCR GC retained the deactivated replica generation");
        } catch (error) {
          if (!error || typeof error !== "object" || error.code !== "ENOENT") throw error;
        }
        process.stdout.write(
          "PASS: live two-runtime handoff and multi-replica deactivation within cgroup\n",
        );
      } finally {
        await drainOcrDispatcher();
      }
    })().catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
  '

LEASE_ROOT="${AI_DATA_DIR}/v3/leases/ocr"
if [[ -d "${LEASE_ROOT}" ]] && find "${LEASE_ROOT}" -type f -print -quit | grep -q .; then
  echo "FAIL: application OCR smoke leaked a generation lease" >&2
  exit 1
fi

python3 - \
  "${OCR_VERIFY_REPORT_DIR}/ocr-${TARGET}-${OCR_VERIFY_ENVIRONMENT}.quality.json" \
  /tmp/verify-ocr-rotation-report.json <<'PY'
import json
import pathlib
import sys

quality_path = pathlib.Path(sys.argv[1])
rotation_path = pathlib.Path(sys.argv[2])
quality = json.loads(quality_path.read_text(encoding="utf-8"))
rotation = json.loads(rotation_path.read_text(encoding="utf-8"))
minimum_memory = 4 * 1024 * 1024 * 1024
if (
    rotation.get("schemaVersion") != 1
    or rotation.get("oldGeneration") == rotation.get("newGeneration")
    or rotation.get("oldRequestCompleted") is not True
    or rotation.get("oldChildExited") is not True
    or rotation.get("oldChildAliveDuringHandoff") is not True
    or rotation.get("oldGenerationLockHeldDuringRequest") is not True
    or rotation.get("oldGenerationLockReleasedAfterRequest") is not True
    or rotation.get("oldLeaseActiveAtReplicaDeactivation") is not True
    or rotation.get("localIdleChildExited") is not True
    or rotation.get("remoteReplicaIdleChildExited") is not True
    or rotation.get("replicaDeactivationSucceeded") is not True
    or rotation.get("leasedGenerationPreservedAfterDeactivation") is not True
    or rotation.get("deactivatedGenerationCollectedAfterReplicaDrain") is not True
    or not rotation.get("oldChildPids")
    or not rotation.get("newChildPids")
    or not rotation.get("remoteReplicaChildPids")
    or set(rotation["newChildPids"]) & set(rotation["remoteReplicaChildPids"])
):
    raise SystemExit(
        f"OCR rotation/multi-replica lifecycle report is incomplete: {rotation!r}"
    )
baseline = rotation.get("rotationCgroupBaselineBytes")
rotation_peak = rotation.get("rotationCgroupPeakBytes")
if (
    not isinstance(baseline, int)
    or not isinstance(rotation_peak, int)
    or rotation_peak < baseline
    or rotation_peak > minimum_memory
):
    raise SystemExit(f"OCR two-runtime rotation exceeded its 4 GiB policy: {rotation!r}")

cumulative_peak = None
for path in (
    pathlib.Path("/sys/fs/cgroup/memory.peak"),
    pathlib.Path("/sys/fs/cgroup/memory/memory.max_usage_in_bytes"),
    pathlib.Path("/sys/fs/cgroup/memory.max_usage_in_bytes"),
):
    try:
        value = path.read_text(encoding="ascii").strip()
    except OSError:
        continue
    if value.isdigit():
        cumulative_peak = int(value)
        break
if cumulative_peak is None or cumulative_peak > minimum_memory:
    raise SystemExit(f"OCR full verification exceeded its 4 GiB cgroup: {cumulative_peak!r}")
rotation["cgroupCumulativePeakBytes"] = cumulative_peak
quality["rotation"] = rotation
quality["rotationCgroupPeakBytes"] = rotation_peak
quality["cgroupMemoryPeakBytes"] = cumulative_peak
quality_path.write_text(
    json.dumps(quality, sort_keys=True, separators=(",", ":")) + "\n",
    encoding="utf-8",
)
PY

# Complete the destructive lifecycle only after quality and live-lease checks.
# The same signed bytes must survive offline import, reset, reinstall, and
# uninstall without touching the shared legacy venv.
run_runtime_transaction import "${INDEX}" /tmp/verify-ocr-import-result.json
IMPORT_GENERATION="$(python3 - /tmp/verify-ocr-import-result.json <<'PY'
import json
import pathlib
import sys

print(json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))["generation"])
PY
)"
handoff_and_commit_runtime "${IMPORT_GENERATION}"
[[ -f "${AI_DATA_DIR}/v3/active/ocr.json" ]] || {
  echo "FAIL: offline OCR import did not reactivate the runtime" >&2
  exit 1
}
python3 "${INSTALLER}" reset --ai-data-dir "${AI_DATA_DIR}" \
  > /tmp/verify-ocr-reset-result.json
[[ ! -e "${AI_DATA_DIR}/v3/active/ocr.json" ]] || {
  echo "FAIL: OCR reset retained the active descriptor" >&2
  exit 1
}
run_runtime_transaction install "${INDEX}" /tmp/verify-ocr-reinstall-result.json
REINSTALL_GENERATION="$(python3 - /tmp/verify-ocr-reinstall-result.json <<'PY'
import json
import pathlib
import sys

print(json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))["generation"])
PY
)"
handoff_and_commit_runtime "${REINSTALL_GENERATION}"
python3 "${INSTALLER}" deactivate --ai-data-dir "${AI_DATA_DIR}" --family ocr \
  > /tmp/verify-ocr-deactivate-result.json
[[ ! -e "${AI_DATA_DIR}/v3/active/ocr.json" ]] || {
  echo "FAIL: OCR uninstall retained the active descriptor" >&2
  exit 1
}
rm -f "${INDEX_PRIVATE_KEY_FILE}"
find "${OCR_VERIFY_REPORT_DIR}" -type f -exec chmod a+r {} +
echo "PASS: OCR install/import/rollback/reset/reinstall/uninstall lifecycle"
