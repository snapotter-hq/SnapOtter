// biome-ignore-all lint/suspicious/noTemplateCurlyInString: These contract assertions intentionally match GitHub and shell interpolation syntax as literal text.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const bundlesWorkflowPath = path.resolve(root, ".github/workflows/ai-bundles.yml");
const releaseWorkflowPath = path.resolve(root, ".github/workflows/release.yml");
const verifierPath = path.resolve(root, "docker/verify-ocr-runtime.sh");
const hfReleaseRequirementsPath = path.resolve(root, "docker/hf-release-requirements.txt");
const ocrReleaseRunbookPath = path.resolve(root, ".github/OCR_RUNTIME_RELEASE_RUNBOOK.md");

function readRequired(file: string): string {
  expect(existsSync(file), `${path.relative(root, file)} is missing`).toBe(true);
  return readFileSync(file, "utf8");
}

function job(workflow: string, name: string, nextName?: string): string {
  const start = workflow.indexOf(`  ${name}:\n`);
  expect(start, `job ${name} is missing`).toBeGreaterThanOrEqual(0);
  if (!nextName) return workflow.slice(start);
  const end = workflow.indexOf(`  ${nextName}:\n`, start + name.length + 3);
  expect(end, `job ${nextName} is missing`).toBeGreaterThan(start);
  return workflow.slice(start, end);
}

function measuredEstimateContract(workflow: string): string {
  const beginMarker = "# OCR_MEASURED_ESTIMATE_CONTRACT_BEGIN";
  const endMarker = "# OCR_MEASURED_ESTIMATE_CONTRACT_END";
  const begin = workflow.indexOf(beginMarker);
  const end = workflow.indexOf(endMarker, begin + beginMarker.length);

  expect(begin, "measured-estimate contract start marker is missing").toBeGreaterThanOrEqual(0);
  expect(end, "measured-estimate contract end marker is missing").toBeGreaterThan(begin);
  return workflow
    .slice(begin + beginMarker.length, end)
    .split("\n")
    .map((line) => line.replace(/^ {10}/, ""))
    .join("\n")
    .trim();
}

describe("OCR v3 bundle release workflow", () => {
  it("scans and inventories both architecture-specific release images", () => {
    const workflow = readRequired(releaseWorkflowPath);
    const scanJob = job(workflow, "scan", "sbom");
    const sbomJob = job(workflow, "sbom", "ai-bundles");

    for (const platform of ["linux-amd64", "linux-arm64"]) {
      expect(scanJob).toContain(`- ${platform}`);
      expect(sbomJob).toContain(`- ${platform}`);
    }
    expect(scanJob).toContain("digests-${{ matrix.platform }}");
    expect(sbomJob).toContain("digests-${{ matrix.platform }}");
    expect(scanJob).toContain("${{ matrix.platform }}-trivy.json");
    expect(sbomJob).toContain("${{ matrix.platform }}-sbom.cdx.json");
  });

  it("builds and verifies both portable targets on native runners", () => {
    const workflow = readRequired(bundlesWorkflowPath);

    expect(workflow).not.toContain("workflow_dispatch:");
    expect(workflow).not.toContain("default: false");
    expect(job(workflow, "validate-inputs", "build-ocr")).toContain(
      `[[ "\${VERSION}" =~ ^[0-9]+\\.[0-9]+\\.[0-9]+`,
    );
    const validationJob = job(workflow, "validate-inputs", "build-ocr");
    expect(validationJob).toContain("Validate OCR runtime trust configuration");
    expect(validationJob).toContain(
      `: "\${OCR_RUNTIME_INDEX_KEY_ID:?Set repository variable OCR_RUNTIME_INDEX_KEY_ID}"`,
    );
    expect(validationJob).toContain("Configured OCR runtime public key is not Ed25519");
    expect(validationJob).not.toContain("OCR_RUNTIME_INDEX_SIGNING_KEY_B64");
    for (const target of ["linux-amd64-cpu-py312", "linux-arm64-cpu-py311"]) {
      expect(workflow).toContain(`target: ${target}`);
    }
    expect(workflow).toContain(
      "for suffix in tar.gz tar.gz.sha256 artifact.json index-input.json; do",
    );
    expect(workflow).toContain("/tmp/bundles/primary/ocr-${TARGET}.${suffix}");
    expect(workflow).toContain("runner: ubuntu-latest");
    expect(workflow).toContain("runner: ubuntu-24.04-arm");
    const buildJob = job(workflow, "build-ocr", "verify-ocr");
    expect(buildJob).toContain("timeout-minutes: 90");
    expect(buildJob).toContain("for build in primary rebuild; do");
    expect(buildJob).toContain('cmp --silent "/tmp/bundles/primary/ocr-${TARGET}.${suffix}"');
    expect(buildJob).toContain("OCR runtime rebuild is not byte-reproducible");
    expect(buildJob).toContain("tar.gz.sha256 artifact.json index-input.json");
    expect(workflow).not.toContain("  build-legacy:\n");
    expect(workflow).not.toContain("  verify-legacy:\n");
    expect(workflow).not.toMatch(/bundle: ocr\s+arch: (amd64-gpu|arm64-cpu)/);
    expect(workflow).not.toMatch(/paddleocr|onnxruntime-gpu/i);
  });

  it("blocks release on the amd64 CPU pack running with a real NVIDIA GPU exposed", () => {
    const workflow = readRequired(bundlesWorkflowPath);
    const gpuJob = job(workflow, "verify-ocr-nvidia", "sign-ocr-index");
    const signJob = job(workflow, "sign-ocr-index", "verify-signed-ocr-index");

    expect(gpuJob).toContain("runs-on: [self-hosted, linux, x64, snapotter-nvidia]");
    expect(gpuJob).toContain("Clear persistent runner release state");
    expect(gpuJob).toContain("rm -rf /tmp/image-digest /tmp/bundles /tmp/ocr-quality");
    expect(gpuJob).toContain("nvidia-smi");
    expect(gpuJob).toContain("--gpus all");
    expect(gpuJob).toContain("NVIDIA_VISIBLE_DEVICES=all");
    expect(gpuJob).toContain("CUDA_VISIBLE_DEVICES=0");
    expect(gpuJob).toContain("docker/verify-ocr-runtime.sh");
    expect(gpuJob).toContain("linux-amd64-cpu-py312");
    expect(signJob).toContain("needs: [build-ocr, verify-ocr, verify-ocr-nvidia]");
  });

  it("installs each exact archive offline before a functional CPU-only smoke", () => {
    const workflow = readRequired(bundlesWorkflowPath);
    const verifier = readRequired(verifierPath);

    const verifyJob = job(workflow, "verify-ocr", "verify-ocr-nvidia");
    expect(verifyJob).toContain("--network none");
    expect(verifyJob).toContain("--memory 3g --memory-swap 3g");
    expect(verifyJob).toContain('"${TARGET}" memory-preflight');
    expect(verifyJob).toContain("--memory 4g --memory-swap 4g");
    expect(verifyJob).toContain("timeout-minutes: 90");
    expect(verifyJob).toContain("docker/verify-ocr-runtime.sh");
    expect(verifyJob).toContain("Verify image has the release trust identity");
    expect(verifyJob).toContain("Verification image OCR key ID does not match");
    expect(verifyJob).toContain("Verification image OCR public key does not match");
    expect(verifyJob).toContain(
      'actual_official_container="$(docker run --rm --entrypoint sh "${SNAPOTTER_BUNDLE_IMAGE}"',
    );
    expect(verifyJob).toContain("Verification image is not marked as an official container");
    expect(verifier).toContain("install_runtime.py");
    expect(verifier).toContain("--preverified-index");
    expect(verifier).toContain("--expected-index-sha256");
    expect(verifier).toContain('f"{{runtime}}/{entrypoint}", "--smoke"');
    expect(verifier).toContain("SNAPOTTER_NETWORK_DISABLED=1");
    expect(verifier).toContain('SNAPOTTER_OCR_PROVIDERS_JSON="[\\"CPUExecutionProvider\\"]"');
    expect(verifier).toContain('"provider": "CPUExecutionProvider"');
    expect(verifier).toContain('"device": "cpu"');
    expect(verifier).toContain("/fixtures/image/valid/ocr-clean.png");
    expect(verifier).toContain("/fixtures/image/valid/ocr-chat.jpeg");
    expect(verifier).toContain("/fixtures/image/valid/ocr-japanese.png");
    expect(verifier).toContain("verify-ocr-rotated.png");
    expect(verifier).toContain("verify-ocr-korean.png");
    expect(verifier).toContain("verify-ocr-blank.png");
    expect(verifier).toContain("verify-ocr-german.png");
    expect(verifier).toContain("verify-ocr-french.png");
    expect(verifier).toContain("verify-ocr-spanish.png");
    expect(verifier).toContain("verify-ocr-chinese.png");
    expect(verifier).toContain("verify-ocr-noisy.png");
    expect(verifier).toContain("verify-ocr-boundary.png");
    expect(verifier).toContain("BOUNDARY OCR 505");
    expect(verifier).toContain("np.full((5000, 8000, 3)");
    expect(verifier).toContain("verify-ocr-rotated-90.png");
    expect(verifier).toContain("verify-ocr-rotated-270.png");
    expect(verifier).toContain("verify-ocr-skewed.png");
    expect(verifier).toContain("verify-ocr-mixed-script.png");
    expect(verifier).toContain("normalized_edit_error");
    expect(verifier).toContain("raw_edit_error");
    expect(verifier).toContain("quality_report");
    expect(verifier).toContain("memory.peak");
    expect(verifier).toContain("runtime_tree_snapshot");
    expect(verifier).toContain("BEST_REGRESSION_TOLERANCE");
    expect(verifier).toContain("best_error > balanced_error + BEST_REGRESSION_TOLERANCE");
    expect(verifier).toContain('if language == "auto"');
    expect(verifier).toContain("korean-PP-OCRv5");
    expect(verifier).toContain("안녕하세요 스냅오터 OCR 505");
    expect(verifier).toContain("Blank OCR hallucinated text");
    expect(verifier).toContain('("german", generated_german');
    expect(verifier).toContain('("french", generated_french');
    expect(verifier).toContain('("spanish", generated_spanish');
    expect(verifier).toContain('("chinese", generated_chinese');
    expect(verifier).toContain('f"{label}-best"');
    expect(verifier).toContain("clean-enhanced-best");
    expect(verifier).toContain("noisy-enhanced-best");
    expect(verifier).toContain("blank-enhanced-best");
    expect(verifier).toContain(
      'JSON.stringify({ enhance: true, language: "auto", quality: "best" })',
    );
    expect(verifier).toContain(
      '!String(result.text ?? "").toLowerCase().includes("quick brown fox")',
    );
    expect(verifier).toContain('result.actualQuality !== "best"');
    expect(verifier).toContain("runOcrRuntime");
    expect(verifier).toContain("application OCR runtime lifecycle");
    expect(verifier).toContain("application Fast OCR lifecycle");
    expect(verifier).toContain("application Fast PDF OCR lifecycle");
    expect(verifier).toContain('DATA_DIR="/tmp/verify-ocr-data"');
    expect(verifier).toContain('AI_DATA_DIR="${DATA_DIR}/ai"');
    expect(verifier).toContain('env AI_DATA_DIR="${AI_DATA_DIR}" DATA_DIR="${DATA_DIR}"');
    expect(verifier).toContain("SNAPOTTER_OFFICIAL_CONTAINER=1");
    expect(verifier).toContain("PYTHONDONTWRITEBYTECODE=1");
    expect(verifier).toContain("PYTHONUNBUFFERED=1");
    expect(verifier).toContain("leaked a generation lease");
    expect(verifier).toContain('OCR_VERIFY_TIMEOUT_SECONDS="${OCR_VERIFY_TIMEOUT_SECONDS:-1200}"');
    expect(verifier).toContain(
      'timeout --signal=TERM --kill-after=10s "${OCR_VERIFY_TIMEOUT_SECONDS}s" env -i',
    );
    expect(verifier).toContain("OCR artifact metadata is not canonical JSON");
    expect(verifier).toContain('VERIFY_MODE="${2:-full}"');
    expect(verifier).toContain('"memory-preflight"');
    expect(verifier).toContain('resources.get("minimumMemoryBytes") != 4 * 1024 * 1024 * 1024');
    expect(verifier).toContain("insufficient memory for accurate OCR runtime");
    expect(verifier).toContain("memory preflight mutated runtime state");
    expect(verifier).toContain("Second OCR install was not idempotent");
    expect(verifier).toContain("handoff_and_commit_runtime");
    expect(verifier).toContain("handoffOcrDispatcher");
    expect(verifier).toContain("probeOcrDispatcher");
    expect(verifier).toContain('"commit"');
    expect(verifier).toContain("pending first-install activation");
    expect(verifier).toContain('reconcile --ai-data-dir "${AI_DATA_DIR}"');
    expect(verifier).toContain("committedGeneration");
    expect(verifier).toContain("restoredGeneration");
    expect(verifier).toContain("rollback --ai-data-dir");
    expect(verifier).toContain("deactivate --ai-data-dir");
    expect(verifier).toContain("reset --ai-data-dir");
    expect(verifier).toContain('run_runtime_transaction import "${INDEX}"');
    expect(verifier).toContain("drainOcrDispatcher");
    expect(verifier).toContain("rotationCgroupPeakBytes");
    expect(verifier).toContain("oldChildAliveDuringHandoff");
    expect(verifier).toContain("oldChildExited");
    expect(verifier).toContain("oldRequestCompleted");
    expect(verifier).toContain("handoffOcrDispatcher");
    expect(verifier).not.toMatch(/paddleocr|onnxruntime-gpu/i);
  });

  it("runs native verification as the production user and covers arbitrary UID with GID 0", () => {
    const workflow = readRequired(bundlesWorkflowPath);
    const verifier = readRequired(verifierPath);
    const verifyJob = job(workflow, "verify-ocr", "verify-ocr-nvidia");
    const gpuJob = job(workflow, "verify-ocr-nvidia", "sign-ocr-index");
    const nativeStep = verifyJob.slice(
      verifyJob.indexOf("Verify offline install and runtime smoke"),
      verifyJob.indexOf("Upload native OCR quality and resource report"),
    );
    const gpuStep = gpuJob.slice(
      gpuJob.indexOf("Verify the portable CPU runtime with NVIDIA exposed"),
      gpuJob.indexOf("Upload NVIDIA-exposed CPU OCR quality and resource report"),
    );

    expect(verifier).toContain('if [[ "$(id -u)" -eq 0 ]]; then');
    expect(verifier).toContain("OCR verifier must run as an unprivileged user");
    expect(verifier).toContain("full | install-smoke | memory-preflight)");
    expect(verifier).toContain('if [[ "${VERIFY_MODE}" == "install-smoke" ]]');
    const installSmokeExit = verifier.indexOf("PASS: OCR signed install smoke lifecycle");
    expect(installSmokeExit).toBeGreaterThan(verifier.indexOf("pending first-install activation"));
    expect(installSmokeExit).toBeGreaterThan(verifier.indexOf("handoff_and_commit_runtime"));
    expect(installSmokeExit).toBeGreaterThan(
      verifier.indexOf("Second OCR install was not idempotent"),
    );
    expect(installSmokeExit).toBeGreaterThan(
      verifier.indexOf('reset --ai-data-dir "${AI_DATA_DIR}"'),
    );
    expect(verifier).toContain('find "${OCR_VERIFY_REPORT_DIR}" -type f -exec chmod a+r {} +');

    for (const step of [nativeStep, gpuStep]) {
      expect(step).not.toContain("--entrypoint");
      expect(step).toContain("-e EMBEDDED=0");
      expect(step).toContain('-e PUID="${RUNNER_UID}"');
      expect(step).toContain('-e PGID="${RUNNER_GID}"');
      expect(step).toContain("/verify-ocr-runtime.sh");
      expect(step).toContain("full");
      expect(step).toContain("rm -rf /tmp/ocr-quality");
      expect(step).toContain("install -d -m 1777 /tmp/ocr-quality");
      expect(step.indexOf("rm -rf /tmp/ocr-quality")).toBeLessThan(
        step.indexOf("install -d -m 1777 /tmp/ocr-quality"),
      );
      expect(step).toContain("chmod 0755 /tmp/ocr-quality");
      expect(step).toContain("test -r");
    }
    expect(nativeStep.match(/-e EMBEDDED=0/g)).toHaveLength(3);
    expect(gpuStep.match(/-e EMBEDDED=0/g)).toHaveLength(1);
    expect(nativeStep).toContain("memory-preflight");
    expect(nativeStep).toContain("--user 20001:0");
    expect(nativeStep).toContain('"${TARGET}" install-smoke');
  });

  it("gates the exact Fast OCR language payload while keeping its layer size approximate", () => {
    const workflow = readRequired(bundlesWorkflowPath);
    const verifyJob = job(workflow, "verify-ocr", "verify-ocr-nvidia");

    expect(verifyJob).toContain("Verify exact Fast OCR payload");
    expect(verifyJob).toContain("-e EMBEDDED=0");
    expect(verifyJob).toContain("chi_sim deu eng fra jpn spa");
    expect(verifyJob).toContain("osd.traineddata");
    expect(verifyJob).toContain("kor.traineddata");
    expect(verifyJob).toContain("14003738");
    expect(verifyJob).toContain("about 25 MiB remains a measured approximate image-layer size");
    const fastPayloadStep = verifyJob.slice(
      verifyJob.indexOf("Verify exact Fast OCR payload"),
      verifyJob.indexOf("Verify offline install and runtime smoke"),
    );
    expect(fastPayloadStep.match(/-e EMBEDDED=0/g)).toHaveLength(1);
  });

  it("blocks each supported OCR language on complete cohort and document metrics", () => {
    const verifier = readRequired(verifierPath);

    for (const category of [
      "clean",
      "ui",
      "scene",
      "degradation",
      "rotation-90",
      "rotation-180",
      "rotation-270",
      "small-angle",
    ]) {
      expect(verifier).toContain(`"${category}"`);
    }
    expect(verifier).toContain("LANGUAGE_QUALITY_CASES");
    expect(verifier).toContain("REQUIRED_LANGUAGE_COHORTS");
    expect(verifier).toContain("grapheme_clusters");
    expect(verifier).toContain("graphemeCer");
    expect(verifier).toContain("wordErrorRate");
    expect(verifier).toContain("insertionCount");
    expect(verifier).toContain("catastrophicFailure");
    expect(verifier).toContain("catastrophicFailureCount");
    expect(verifier).toContain("polygonCoverage");
    expect(verifier).toContain("minimum_polygon_coverage");
    expect(verifier).toContain("memory.current");
    expect(verifier).toContain("memoryCheckpoints");
    expect(verifier).toContain('record_memory_checkpoint("fixtures-generated")');
    expect(verifier).toContain('record_memory_checkpoint("40mp-boundary-complete")');
    expect(verifier).toContain("verify-ocr-multipage.pdf");
    expect(verifier).toContain('pages: "3,1"');
    expect(verifier).toContain('"--- Page 1 ---"');
    expect(verifier).toContain('"--- Page 3 ---"');
    expect(verifier).toContain("PAGE TWO OMIT 505");
    expect(verifier).toContain("exactPageRecall");
    expect(verifier).toContain("pageOrderCorrect");
    expect(verifier).toContain('report.get("minimumMemoryBytes") != 4 * 1024 * 1024 * 1024');
    expect(verifier).toContain("rotationCgroupPeakBytes");
  });

  it("proves shared OCR deactivation drains every replica without breaking an old lease", () => {
    const verifier = readRequired(verifierPath);

    expect(verifier).toContain("rotateOcrDispatcher");
    expect(verifier).toContain("OCR_REMOTE_REPLICA_READY");
    expect(verifier).toContain("OCR_REMOTE_REPLICA_DONE");
    expect(verifier).toContain('"deactivate"');
    expect(verifier).toContain("remoteReplicaIdleChildExited");
    expect(verifier).toContain("localIdleChildExited");
    expect(verifier).toContain("oldLeaseActiveAtReplicaDeactivation");
    expect(verifier).toContain("oldGenerationLockHeldDuringRequest");
    expect(verifier).toContain("oldGenerationLockReleasedAfterRequest");
    expect(verifier).toContain("fcntl.LOCK_EX | fcntl.LOCK_NB");
    expect(verifier).toContain("replicaDeactivationSucceeded");
    expect(verifier).toContain("leasedGenerationPreservedAfterDeactivation");
    expect(verifier).toContain("deactivatedGenerationCollectedAfterReplicaDrain");
    expect(verifier).toContain('command.split("\\0").filter(Boolean)');
  });

  it("blocks native release on every licensed real fixture across Fast, Balanced, and Best", () => {
    const workflow = readRequired(bundlesWorkflowPath);
    const verifyJob = job(workflow, "verify-ocr", "verify-ocr-nvidia");
    const verifier = readRequired(verifierPath);

    expect(verifyJob).toContain('-v "$PWD/tests/fixtures:/fixtures:ro"');
    expect(verifier).toContain('REAL_FIXTURE_MANIFEST = REAL_FIXTURE_ROOT / "manifest.json"');
    expect(verifier).toContain(
      'REAL_FIXTURE_MANIFEST_SHA256 = "979c2ce9fbae524a2627e3b12ba785d5f3c2d73b2c372d486e66f7a1fd248f5f"',
    );
    for (const fixtureId of [
      "jawildtext-board-0001",
      "jawildtext-board-0049",
      "jawildtext-board-0127",
      "commons-hagye-station-715",
      "jawildtext-receipt-11120",
      "cord-v2-test-0080",
      "clinocr-poor-t7-s2",
    ]) {
      expect(verifier).toContain(`"${fixtureId}"`);
    }
    expect(verifier).toContain('REAL_CORPUS_QUALITIES = ("fast", "balanced", "best")');
    expect(verifier).toContain("REAL_CORPUS_HELD_OUT_POLICY");
    expect(verifier).toContain("REAL_BOARD_COHORT_EXPECTED");
    expect(verifier).toContain("REAL_KOREAN_COHORT_EXPECTED");
    expect(verifier).toContain("REAL_KOREAN_GROUND_TRUTH_EXPECTED");
    expect(verifier).toContain('"status": "REJECTED_AFTER_FROZEN_GATE"');
    expect(verifier).toContain('"enforcedBehavior": "reject-before-tesseract-spawn"');
    expect(verifier).toContain(
      '"diagnosticManifestSha256": "8e82e22b5d939ca40e97d8a74e8ce73dda451e99ba8b33a95a94723c4679d1b4"',
    );
    expect(verifier).toContain(
      '"qualityCheckpointSha256": "41e4c01959602c3c255c09210fd3203ab80eee696bf28578d1137bf07f38bab7"',
    );
    expect(verifier).toContain(
      '"fastReportSha256": "0a9743c46e67aad7948d5a5880bfbd5096a4023c6006de5f94668580a2df276a"',
    );
    expect(verifier).toContain(
      '"fastTextSha256": "6ddecdd52dd0a66074fb3c1d003a28493975f63421f70600706ccc01b7bb2c73"',
    );
    expect(verifier).toContain('"releaseGatePassed": False');
    expect(verifier).toContain('"tokenRecall": 0.1875');
    expect(verifier).toContain('"tokenPrecision": 0.25');
    expect(verifier).toContain('"tokenF1": 0.214286');
    expect(verifier).toContain('"selectionStatus": "FROZEN_BEFORE_ANY_OCR_OUTPUT"');
    expect(verifier).toContain('"minimumTokenRecall": 0.25');
    expect(verifier).toContain('"minimumTokenPrecision": 0.50');
    expect(verifier).toContain('"minimumTokenF1": 0.32');
    expect(verifier).toContain("verified_real_fixture_path");
    expect(verifier).toContain("file_sha256");
    expect(verifier).toContain('annotation.get("exactGroundTruth") != ground_truth[:-1]');
    expect(verifier).toContain('annotation.get("source") != expected_source');
    expect(verifier).toContain("run_fast_real_ocr");
    expect(verifier).toContain("SNAPOTTER_FAST_REAL_RESULTS");
    expect(verifier).toContain("const expectedFixtureIds = new Set([");
    expect(verifier).toContain("fixtureIds.length !== expectedFixtureIds.size");
    expect(verifier).toContain("recordIds.length !== expectedFixtureIds.size");
    expect(verifier).toContain("const persistFastRealResults = async () =>");
    expect(verifier).toContain("FAST_KOREAN_UNSUPPORTED_REASON");
    expect(verifier).toContain("koreanTesseractSentinelPath");
    expect(verifier).toContain("koreanTesseractMarkerPath");
    expect(verifier).toContain("process.env.TESSERACT_PATH = koreanTesseractSentinelPath");
    expect(verifier).toContain(
      'await extractText(image, scratch, { quality: "fast", language: "ko" })',
    );
    expect(verifier).toContain('releaseGateStatus: "unsupported-by-design"');
    expect(verifier).toContain("releaseGatePassed: null");
    expect(verifier).toContain("supported: false");
    expect(verifier).toContain("decisionEnforced: true");
    expect(verifier).toContain("tesseractSpawned: false");
    expect(verifier).toContain(
      'FAST_REAL_RESULTS="${OCR_VERIFY_REPORT_DIR}/ocr-${TARGET}-${OCR_VERIFY_ENVIRONMENT}.fast-real.json"',
    );
    expect(verifier).toContain("Fast real OCR evidence: ${FAST_REAL_RESULTS}");
    expect(verifier).toMatch(
      /records\[fixture\.id\] = result;\s+await persistFastRealResults\(\);/,
    );
    expect(verifier).toMatch(
      /verificationError:\s+error instanceof Error[\s\S]*await persistFastRealResults\(\);[\s\S]*throw error;/,
    );
    expect(verifier).not.toContain("Object.keys(records).length !== 4");
    expect(verifier).toContain("fastLanguageCohorts");
    expect(verifier).toContain('extractText(image, scratch, { quality: "fast"');
    expect(verifier).not.toContain('["fast-ko-clean"');
    expect(verifier).not.toContain('["fast-ko-pure-clean"');
    expect(verifier).toContain('expectedNormalized: expectedNormalized.join("")');
    expect(verifier).toContain('actualNormalized: actualNormalized.join("")');
    expect(verifier).toContain("await persistFastLanguageReport(failureMessage)");
    expect(verifier).toContain("throw new Error(failureMessage)");
    expect(verifier.indexOf("records.push(record)")).toBeLessThan(
      verifier.indexOf("await persistFastLanguageReport(failureMessage)"),
    );
    expect(verifier.indexOf("await persistFastLanguageReport(failureMessage)")).toBeLessThan(
      verifier.indexOf("throw new Error(failureMessage)"),
    );
    expect(verifier).toContain("runtime.recognize_image");
    expect(verifier).toContain("real_token_multiset");
    expect(verifier).toContain("minimumTokenRecall");
    expect(verifier).toContain("minimumTokenPrecision");
    expect(verifier).toContain("minimumTokenF1");
    expect(verifier).toContain("maximumGraphemeCer");
    expect(verifier).toContain("maximumWordErrorRate");
    expect(verifier).toContain('"releaseGatePassed": not release_failures');
    expect(verifier).toContain('"releaseGateFailures": release_failures');
    expect(verifier).toContain('"manifestSha256": REAL_FIXTURE_MANIFEST_SHA256');
    expect(verifier).toContain('quality_report["realCorpusAttempt"] = attempt');
    expect(verifier).toContain('attempt["status"] = "failed"');
    expect(verifier).toContain('attempt["status"] = "completed"');
    expect(verifier).toContain("real OCR release gate failed across held-out cases");
    expect(verifier).toContain('"id": "auto"');
    expect(verifier).toContain('const selectors = { en: "en", id: "auto", ja: "ja", ko: "ko" };');
    expect(verifier).toContain("has_source_shard == has_source_file");
    expect(verifier).toContain("0x1100 <= ord(character) <= 0x11FF");
    expect(verifier).toContain("0xAC00 <= ord(character) <= 0xD7AF");
    expect(verifier).toContain('("board-or-sign", "ko", "fast")');
    expect(verifier).toContain('("board-or-sign", "ko", "balanced")');
    expect(verifier).toContain('("board-or-sign", "ko", "best")');
    expect(verifier).toContain('REAL_KOREAN_COHORT_EXPECTED["perImageTierFloors"][quality]');
    expect(verifier).toContain('expected_korean_cohort["perImageTierFloors"][quality]');
    expect(verifier).toContain('case.get("releaseGateStatus") != "unsupported-by-design"');
    expect(verifier).toContain('case.get("releaseGatePassed") is not None');
    expect(verifier).toContain('case.get("supported") is not False');
    expect(verifier).toContain('case.get("decisionEnforced") is not True');
    expect(verifier).not.toContain('"eng+deu+fra+spa+chi_sim+jpn+kor"');
    expect(verifier).toContain("expected_real_fixtures");
    expect(verifier).toContain("expected_real_cases");
    expect(verifier).not.toContain("REAL_CORPUS_CALIBRATION");
  });

  it("inventories and vulnerability-gates each verified OCR runtime artifact", () => {
    const workflow = readRequired(bundlesWorkflowPath);
    const verifyJob = job(workflow, "verify-ocr", "verify-ocr-nvidia");
    const publishJob = job(workflow, "publish");

    const runtimeVerification = verifyJob.indexOf("Verify offline install and runtime smoke");
    const extraction = verifyJob.indexOf(
      "Extract verified OCR runtime for supply-chain inspection",
    );
    const sbom = verifyJob.indexOf("Generate per-target OCR runtime SBOMs");
    const vulnerabilityGate = verifyJob.indexOf("Gate OCR runtime vulnerabilities");

    expect(runtimeVerification).toBeGreaterThanOrEqual(0);
    expect(extraction).toBeGreaterThan(runtimeVerification);
    expect(sbom).toBeGreaterThan(extraction);
    expect(vulnerabilityGate).toBeGreaterThan(sbom);
    expect(verifyJob).toContain('artifact["archive"]["sha256"]');
    expect(verifyJob).toContain(
      'artifact.get("resources", {}).get("minimumMemoryBytes") != 4 * 1024 * 1024 * 1024',
    );
    expect(verifyJob).toContain("tarfile.data_filter");
    expect(verifyJob).toContain(
      'expected_files = {record["path"]: record for record in artifact["files"]}',
    );
    expect(verifyJob).toContain("Extracted OCR runtime file manifest mismatch");
    expect(verifyJob).not.toContain('scan_root / "runtime-manifest.json"');
    expect(verifyJob).toContain("dir:/tmp/ocr-runtime-scan");
    expect(verifyJob).toContain("Install pinned Syft 1.42.3 from verified release bytes");
    expect(verifyJob).toContain("0d6be741479eddd2c8644a288990c04f3df0d609bbc1599a005532a9dff63509");
    expect(verifyJob).toContain("ocr-${TARGET}-sbom.cdx.json");
    expect(verifyJob).toContain("ocr-${TARGET}-sbom.spdx.json");
    expect(verifyJob).toContain('--source-name "snapotter-ocr-${TARGET}"');
    expect(verifyJob).toContain('--source-version "${VERSION}"');
    expect(verifyJob).toContain(
      "aquasecurity/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25",
    );
    expect(verifyJob).toContain("scan-type: sbom");
    expect(verifyJob).toContain(
      "scan-ref: /tmp/ocr-security/ocr-${{ matrix.target }}-sbom.cdx.json",
    );
    expect(verifyJob).not.toContain("scan-type: fs");
    expect(verifyJob).toContain('severity: "CRITICAL,HIGH"');
    expect(verifyJob).toContain('exit-code: "1"');
    expect(verifyJob).toContain("ocr-${{ matrix.target }}-trivy.json");
    expect(verifyJob).toContain("ocr-quality-${{ matrix.target }}");
    expect(verifyJob).toContain("*.quality.json");
    expect(verifyJob).toContain("name: ocr-security-${{ matrix.target }}");
    expect(verifyJob).toContain("if-no-files-found: error");
    expect(publishJob).toContain("expected_attestations = {");
    expect(publishJob).toContain('f"ocr-{target}-sbom.cdx.json"');
    expect(publishJob).toContain('f"ocr-{target}-sbom.spdx.json"');
    expect(publishJob).toContain('f"ocr-{target}-trivy.json"');
    expect(publishJob).toContain('f"ocr-{target}-native-cpu.quality.json"');
    expect(publishJob).toContain('"ocr-linux-amd64-cpu-py312-nvidia-exposed-cpu.quality.json"');
    expect(publishJob).toContain("Signed OCR attestation closure mismatch");
  });

  it("hash-locks tooling before exposing the HuggingFace write token", () => {
    const workflow = readRequired(bundlesWorkflowPath);
    const publishJob = job(workflow, "publish");
    const requirements = readRequired(hfReleaseRequirementsPath);

    expect(publishJob).toContain("actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0");
    expect(publishJob).toContain("ref: ${{ inputs.release_commit }}");
    expect(publishJob).toContain("persist-credentials: false");
    expect(publishJob).toContain("actions/setup-python@ece7cb06caefa5fff74198d8649806c4678c61a1");
    expect(publishJob).toContain('python-version: "3.11.14"');
    expect(publishJob).toContain("/tmp/hf-release-venv/bin/python -m pip install");
    expect(publishJob).toContain("--disable-pip-version-check --require-hashes --no-deps");
    expect(publishJob).toContain("--only-binary=:all:");
    expect(publishJob).toContain("docker/hf-release-requirements.txt");
    expect(publishJob.match(/\/tmp\/hf-release-venv\/bin\/python - <<'PY'/g)).toHaveLength(2);
    expect(publishJob).not.toMatch(/pip install -U|huggingface_hub\[hf_xet\](?:\s|")/);
    expect(requirements).toContain("huggingface-hub==0.36.2");
    expect(requirements).toContain("hf-xet==");
    expect(requirements).toContain("--hash=sha256:");
  });

  it("signs one canonical two-target index and verifies it before upload", () => {
    const workflow = readRequired(bundlesWorkflowPath);
    const signJob = job(workflow, "sign-ocr-index", "verify-signed-ocr-index");
    const verifySignedJob = job(workflow, "verify-signed-ocr-index", "publish");
    const publishJob = job(workflow, "publish");

    expect(workflow).toContain("OCR_RUNTIME_INDEX_SIGNING_KEY_B64:");
    expect(workflow).toContain("required: true");
    expect(signJob).toContain("needs: [build-ocr, verify-ocr, verify-ocr-nvidia]");
    expect(signJob).toContain("OCR_RUNTIME_INDEX_KEY_ID");
    expect(signJob).toContain("OCR_RUNTIME_INDEX_PUBLIC_KEY_PEM_B64");
    expect(signJob).toContain("Checkout exact release tag for provenance verification");
    expect(signJob).toContain("SNAPOTTER_RELEASE_COMMIT");
    expect(signJob).toContain("name: digests-linux-amd64");
    expect(signJob).toContain("name: digests-linux-arm64");
    expect(signJob).toContain(
      'provenance.get("sourceImageDigest") != expected_image_digests[target]',
    );
    expect(signJob).toContain(`[[ "\${OCR_RUNTIME_INDEX_KEY_ID}" =~ ^[A-Za-z0-9]`);
    expect(signJob).toContain("openssl pkeyutl -sign -rawin");
    expect(signJob).toContain("openssl pkeyutl -verify -rawin");
    expect(signJob).toContain("ocr-runtime-index.json");
    expect(signJob).toContain("ocr-runtime-trusted-keys.json");
    expect(signJob).toContain("pattern: ocr-security-*");
    expect(signJob).toContain("pattern: ocr-quality-*");
    expect(signJob).toContain('"attestations": attestations');
    expect(signJob).toContain('"publicKey": (root / "trusted-public.pem").read_text()');
    expect(signJob).toContain(
      'expected_targets = {"linux-amd64-cpu-py312", "linux-arm64-cpu-py311"}',
    );
    expect(signJob).toContain('model_objects = artifact.get("modelObjects")');
    expect(signJob).toContain("model provenance does not bind its immutable revision");
    expect(signJob).toContain('"snapotter-agpl"');
    expect(signJob).toContain('"apache-2.0"');
    expect(signJob).toContain('"antlr-4.9.3-license"');
    expect(signJob).toContain('file_records.get("THIRD_PARTY_NOTICES.json")');
    expect(signJob).toContain('provenance = artifact.get("provenance")');
    expect(signJob).toContain(
      'artifact.get("resources", {}).get("minimumMemoryBytes") != 4 * 1024 * 1024 * 1024',
    );
    expect(signJob).toContain("invalid build provenance");
    expect(signJob).toContain("OCR signing private key must use canonical base64");
    expect(signJob).toContain("OCR runtime public key must use canonical base64");
    expect(verifySignedJob).toContain("needs: sign-ocr-index");
    expect(verifySignedJob).toContain("runner: ubuntu-latest");
    expect(verifySignedJob).toContain("runner: ubuntu-24.04-arm");
    expect(verifySignedJob).toContain("name: ocr-runtime-metadata");
    expect(verifySignedJob).toContain("digests-${{ matrix.image_platform }}");
    expect(verifySignedJob).toContain("OCR_RUNTIME_INDEX_MAX_BYTES");
    expect(verifySignedJob).toContain("loadOcrRuntimeTrustKeys");
    expect(verifySignedJob).toContain("verifyRuntimeIndex");
    expect(verifySignedJob).toContain("/app/packages/ai/src/runtime-index.ts");
    expect(verifySignedJob).not.toContain("OCR_RUNTIME_INDEX_PUBLIC_KEY_PEM_B64");
    expect(verifySignedJob).not.toContain("--entrypoint");
    expect(verifySignedJob).toContain("-e EMBEDDED=0");
    expect(verifySignedJob.match(/-e EMBEDDED=0/g)).toHaveLength(1);
    expect(publishJob).toContain("needs: [verify-ocr, sign-ocr-index, verify-signed-ocr-index]");
    expect(publishJob).toContain('f"ocr-{target}.artifact.json"');
    expect(publishJob).toContain("ocr-runtime-index.json");
    expect(publishJob).toContain("v3.mkdir(parents=True)");
    expect(publishJob).toContain("missing or colliding OCR release objects");
    expect(publishJob).toContain("file.relative_to(root).as_posix()");
    expect(publishJob).toContain("HfApi");
    expect(publishJob).toContain("file_exists");
    expect(publishJob).toContain('for entry in existing_manifest["files"]');
    expect(publishJob).toContain("Existing bundle object has wrong digest");
    expect(publishJob).toContain('openssl", "pkeyutl", "-verify"');
    expect(publishJob).toContain("Existing release contains different OCR runtime artifacts");
    expect(publishJob).toContain("is_variable_ocr_attestation");
    expect(publishJob).toContain("Signed OCR attestation digest mismatch");
    expect(publishJob).toContain("Signed OCR artifact closure mismatch");
    expect(publishJob).toContain("Candidate OCR runtime index signature is invalid");
    expect(publishJob).toContain("actual_objects != expected_objects");
    expect(publishJob).toContain("Candidate feature-bundle manifest closure mismatch");
    expect(publishJob).toContain(
      "Existing feature-bundle version has uncommitted or missing objects",
    );
    expect(publishJob).toContain("BUNDLE_RELEASE_EXISTS=true");
    expect(publishJob).toContain("if: env.BUNDLE_RELEASE_EXISTS != 'true'");
    expect(publishJob).toContain('"files": files');
  });

  it("rejects signed artifacts whose measured sizes drift beyond the release tolerance", () => {
    const workflow = readRequired(bundlesWorkflowPath);
    const signJob = job(workflow, "sign-ocr-index", "verify-signed-ocr-index");
    const contract = measuredEstimateContract(signJob);
    const python = `${contract}\n\nimport json\nimport sys\npayload = json.loads(sys.argv[1])\nvalidate_measured_estimate(\n    "linux-amd64-cpu-py312", payload["manifestTarget"], payload["archive"]\n)\n`;
    const manifestTarget = {
      compressedSizeEstimate: 200_000_001,
      extractedSizeEstimate: 500_000_000,
      sizeKind: "measured-estimate",
    };
    const archive = { expandedSize: 505_000_000, size: 202_000_001 };
    const runContract = (
      candidateManifestTarget: Record<string, unknown>,
      candidateArchive: Record<string, unknown>,
    ) =>
      execFileSync(
        "python3",
        [
          "-c",
          python,
          JSON.stringify({ archive: candidateArchive, manifestTarget: candidateManifestTarget }),
        ],
        { stdio: "pipe" },
      );

    expect(signJob).toContain('Path("docker/feature-manifest.json")');
    expect(signJob).toContain("manifest_targets[target]");
    expect(signJob).toContain("validate_measured_estimate(target");
    expect(() => runContract(manifestTarget, archive)).not.toThrow();

    expect(() =>
      runContract(manifestTarget, {
        ...archive,
        size: 202_000_002,
      }),
    ).toThrow();
    expect(() =>
      runContract(
        {
          ...manifestTarget,
          extractedSizeEstimate: true,
        },
        archive,
      ),
    ).toThrow();
    expect(() =>
      runContract(
        {
          ...manifestTarget,
          sizeKind: "measured-build",
        },
        archive,
      ),
    ).toThrow();
  });

  it("keeps public image tags behind the verified signed-index gate", () => {
    const release = readRequired(releaseWorkflowPath);
    const releaseJob = job(release, "release", "prebuilt");
    const docker = job(release, "docker", "scan");
    const aiBundles = job(release, "ai-bundles", "manifest");
    const manifest = job(release, "manifest");

    expect(releaseJob).toContain("Validate OCR release trust before publishing");
    expect(releaseJob).toContain("OCR runtime public key must use canonical base64");
    expect(releaseJob).not.toContain("OCR_RUNTIME_INDEX_SIGNING_KEY_B64");
    expect(docker).toContain("SNAPOTTER_OFFICIAL_CONTAINER=1");
    expect(releaseJob.indexOf("Validate OCR release trust before publishing")).toBeLessThan(
      releaseJob.indexOf("Run semantic-release"),
    );
    expect(docker).toContain("Validate OCR runtime trust baked into the image");
    expect(docker).toContain("Configured OCR runtime public key is not Ed25519");
    expect(aiBundles).not.toContain("if: false");
    expect(aiBundles).toContain("needs: [release, docker, scan]");
    expect(aiBundles).not.toContain("use_release_digests");
    expect(aiBundles).not.toContain("secrets: inherit");
    expect(aiBundles).toContain("GHCR_TOKEN: ${{ secrets.GHCR_TOKEN }}");
    expect(aiBundles).toContain("HF_TOKEN: ${{ secrets.HF_TOKEN }}");
    expect(aiBundles).toContain(
      "OCR_RUNTIME_INDEX_SIGNING_KEY_B64: ${{ secrets.OCR_RUNTIME_INDEX_SIGNING_KEY_B64 }}",
    );
    expect(manifest).toContain("needs: [release, docker, scan, sbom, ai-bundles]");
    expect(docker).toContain("Reuse an existing published platform digest");
    expect(docker).toContain("snapotter-v${VERSION}-${PLATFORM_PAIR}.digest");
    expect(docker).toContain('reuse_description="immutable ${asset_name} checkpoint"');
    expect(docker).toContain('echo "Reusing ${reuse_description} at ${digest}."');
    expect(docker).toContain('ghcr_ref="ghcr.io/snapotter-hq/snapotter"');
    expect(docker).toContain("Existing GitHub release platform digest differs");
    expect(docker).toContain("retention-days: 90");
    expect(manifest).toContain("continue-on-error: true");
    expect(manifest).toContain("Recover expired digest artifacts from the GitHub release");
    expect(manifest).toContain("snapotter-v${VERSION}-linux-*.digest");
    expect(manifest).toContain("Expected exactly two immutable platform digest release assets");
  });

  it("rejects non-canonical public-key base64 at the earliest release boundaries", () => {
    const bundles = readRequired(bundlesWorkflowPath);
    const release = readRequired(releaseWorkflowPath);
    const bundleValidation = job(bundles, "validate-inputs", "build-ocr");
    const releaseValidation = job(release, "release", "prebuilt");

    for (const validation of [bundleValidation, releaseValidation]) {
      expect(validation).toContain("base64 --wrap=0 < /tmp/ocr-");
      expect(validation).toContain('== "${OCR_RUNTIME_INDEX_PUBLIC_KEY_PEM_B64}"');
      expect(validation).toContain("OCR runtime public key must use canonical base64");
    }
    expect(
      releaseValidation.indexOf("OCR runtime public key must use canonical base64"),
    ).toBeLessThan(releaseValidation.indexOf("Run semantic-release"));
  });

  it("documents secure OCR signing-key provisioning, rotation, and release preflight", () => {
    const runbook = readRequired(ocrReleaseRunbookPath);

    expect(runbook).toContain("openssl genpkey -algorithm ED25519");
    expect(runbook).toContain("openssl base64 -A");
    expect(runbook).toContain("OCR_RUNTIME_INDEX_SIGNING_KEY_B64");
    expect(runbook).toContain("OCR_RUNTIME_INDEX_KEY_ID");
    expect(runbook).toContain("OCR_RUNTIME_INDEX_PUBLIC_KEY_PEM_B64");
    expect(runbook).toContain("gh secret set --repo snapotter-hq/SnapOtter");
    expect(runbook).toContain("gh secret set --org snapotter-hq");
    expect(runbook).toContain("offline backup");
    expect(runbook).toContain("rotation");
    expect(runbook).toContain("recovery");
    expect(runbook).toContain("self-hosted, linux, x64, snapotter-nvidia");
    expect(runbook).toContain("gh variable get OCR_RUNTIME_INDEX_KEY_ID");
    expect(runbook).toContain("gh secret list --repo snapotter-hq/SnapOtter");
  });

  it("makes every run-scoped artifact upload safe to replace on a rerun", () => {
    const workflows = [readRequired(bundlesWorkflowPath), readRequired(releaseWorkflowPath)];
    const expectedUploadCounts = [5, 1];

    workflows.forEach((workflow, workflowIndex) => {
      const uploadSteps = [
        ...workflow.matchAll(
          /uses: actions\/upload-artifact@[^\n]+\n([\s\S]*?)(?=\n {6}- |\n {2}[a-zA-Z0-9_-]+:|$)/g,
        ),
      ];
      expect(uploadSteps).toHaveLength(expectedUploadCounts[workflowIndex]);
      for (const uploadStep of uploadSteps) {
        expect(uploadStep[0]).toContain("overwrite: true");
      }
    });
  });

  it("always removes only release-scoped state from the persistent NVIDIA runner", () => {
    const workflow = readRequired(bundlesWorkflowPath);
    const gpuJob = job(workflow, "verify-ocr-nvidia", "sign-ocr-index");
    const cleanupStart = gpuJob.indexOf("Remove release-scoped state from persistent runner");

    expect(cleanupStart).toBeGreaterThan(gpuJob.indexOf("Upload NVIDIA-exposed"));
    const cleanup = gpuJob.slice(cleanupStart);
    expect(gpuJob).toContain("DOCKER_CONFIG: /tmp/snapotter-ocr-docker-config");
    expect(cleanup).toContain("if: always()");
    expect(cleanup).toContain('docker image rm "${SNAPOTTER_BUNDLE_IMAGE}"');
    expect(cleanup).toContain(
      "rm -rf /tmp/image-digest /tmp/bundles /tmp/ocr-quality /tmp/snapotter-ocr-docker-config",
    );
    expect(cleanup).not.toMatch(/docker (system|builder|image) prune/);
  });

  it("binds every downstream checkout to one peeled release commit", () => {
    const release = readRequired(releaseWorkflowPath);
    const bundles = readRequired(bundlesWorkflowPath);
    const releaseJob = job(release, "release", "prebuilt");

    expect(releaseJob).toContain("release_commit: ${{ steps.check.outputs.release_commit }}");
    expect(releaseJob).toContain('git rev-parse "refs/tags/v${version}^{commit}"');
    expect(release.match(/ref: \$\{\{ needs\.release\.outputs\.release_commit \}\}/g)).toHaveLength(
      5,
    );
    expect(bundles).toContain("release_commit:");
    expect(bundles).toContain("required: true");
    expect(bundles.match(/ref: \$\{\{ inputs\.release_commit \}\}/g)).toHaveLength(5);
    expect(bundles).toContain('git rev-parse "refs/tags/v${VERSION}^{commit}"');
    expect(bundles).toContain('[[ "$(git rev-parse HEAD)" == "${RELEASE_COMMIT}"');
    expect(bundles).toContain('"${tag_commit}" == "${RELEASE_COMMIT}"');

    const caller = job(release, "ai-bundles", "manifest");
    expect(caller).toContain("release_commit: ${{ needs.release.outputs.release_commit }}");
  });

  it("records the release source and reusable-workflow revision independently", () => {
    const workflow = readRequired(bundlesWorkflowPath);
    const buildJob = job(workflow, "build-ocr", "verify-ocr");
    const signJob = job(workflow, "sign-ocr-index", "verify-signed-ocr-index");

    expect(buildJob).toContain("SNAPOTTER_OCR_SOURCE_COMMIT");
    expect(buildJob).toContain("${{ inputs.release_commit }}");
    expect(buildJob).toContain("SNAPOTTER_OCR_BUILDER_ID");
    expect(buildJob).toContain("${{ github.workflow_sha }}");
    expect(signJob).toContain("SNAPOTTER_RELEASE_COMMIT");
    expect(signJob).toContain("SNAPOTTER_WORKFLOW_COMMIT");
    expect(signJob).toContain('provenance.get("builderId")');
    expect(signJob).toContain(
      'f"github-actions:.github/workflows/ai-bundles.yml@{workflow_commit}"',
    );
    expect(signJob).toContain('source_commit != os.environ["SNAPOTTER_RELEASE_COMMIT"]');
  });

  it("snapshots Hugging Face reads and publishes with a compare-and-swap parent", () => {
    const publishJob = job(readRequired(bundlesWorkflowPath), "publish");

    expect(publishJob).toContain("group: snapotter-hf-feature-bundles-publish");
    expect(publishJob).toContain("cancel-in-progress: false");
    expect(publishJob).toContain("queue: max");
    expect(publishJob).toContain("snapshot_revision = api.repo_info(");
    expect(publishJob).toContain('repo_id, repo_type="model", revision="main", token=token');
    expect(publishJob).toContain("revision=snapshot_revision");
    expect(publishJob).toContain("HF_PARENT_COMMIT");
    expect(publishJob).toContain("api.upload_folder(");
    expect(publishJob).toContain("parent_commit=parent_commit");
    expect(publishJob).toContain("commit_info.oid");
    expect(publishJob).toContain("Hugging Face repository changed during release audit");
    expect(publishJob).toContain("Hugging Face repository changed during post-upload audit");
    expect(publishJob).toContain("Published feature-bundle closure mismatch");
    expect(publishJob).not.toMatch(/\bhf upload\b/);
  });

  it("refetches the immutable release tag at the Hugging Face mutation boundary", () => {
    const publishJob = job(readRequired(bundlesWorkflowPath), "publish");
    const uploadStart = publishJob.indexOf(
      "Upload only after every verification and signing gate passed",
    );
    const uploadStep = publishJob.slice(uploadStart);

    expect(uploadStart).toBeGreaterThan(0);
    expect(uploadStep).toContain("RELEASE_COMMIT: ${{ inputs.release_commit }}");
    expect(uploadStep).toContain('"git", "fetch", "--force", "--no-tags", "origin"');
    expect(uploadStep).toContain('f"refs/tags/v{version}:{publish_ref}"');
    expect(uploadStep).toContain('published_tag_commit != os.environ["RELEASE_COMMIT"]');
    expect(uploadStep.indexOf('"git", "fetch", "--force"')).toBeLessThan(
      uploadStep.indexOf("api.upload_folder("),
    );
  });

  it("installs the exact Syft 1.42.3 Linux binary from verified release bytes", () => {
    for (const workflow of [readRequired(bundlesWorkflowPath), readRequired(releaseWorkflowPath)]) {
      expect(workflow).not.toContain("anchore/sbom-action/download-syft@");
      expect(workflow).not.toContain("install.sh");
      expect(workflow).toContain(
        "https://github.com/anchore/syft/releases/download/v${SYFT_VERSION}/${archive}",
      );
      expect(workflow).toContain(
        "0d6be741479eddd2c8644a288990c04f3df0d609bbc1599a005532a9dff63509",
      );
      expect(workflow).toContain(
        "dc630590c953347789d08f8ebf57c7d8094db89100785fcd94b1cddeac791804",
      );
      expect(workflow).toContain("sha256sum --check");
      expect(workflow).toContain('case "$(uname -m)" in');
    }
  });

  it("repairs and verifies an immutable reused image digest in both registries", () => {
    const dockerJob = job(readRequired(releaseWorkflowPath), "docker", "scan");

    expect(dockerJob).toContain('ghcr_ref="ghcr.io/snapotter-hq/snapotter"');
    expect(dockerJob).toContain('dockerhub_ref="snapotter/snapotter"');
    expect(dockerJob).toContain("repair_digest_replica");
    expect(dockerJob).toContain("--prefer-index=false");
    expect(dockerJob).toContain('"${destination}@${digest}"');
    expect(dockerJob).toContain("Registry returned different bytes for ${reference}@${digest}");
    expect(dockerJob).toContain('.os == "linux" and .architecture == $architecture');
    expect(dockerJob).toContain("Registry digest has the wrong platform");
    expect(dockerJob).toContain("Release digest is unavailable in both registries");
    expect(dockerJob).not.toContain("repair-${VERSION}");
  });

  it("revalidates exact release provenance before tag or checkpoint digest reuse", () => {
    const dockerJob = job(readRequired(releaseWorkflowPath), "docker", "scan");
    const stepName = "Reuse an existing published platform digest";
    const stepStart = dockerJob.indexOf(`      - name: ${stepName}\n`);
    expect(stepStart).toBeGreaterThanOrEqual(0);
    const runStart = dockerJob.indexOf("        run: |\n", stepStart);
    expect(runStart).toBeGreaterThan(stepStart);
    const bodyStart = runStart + "        run: |\n".length;
    const nextStep = dockerJob.indexOf("\n      - name:", bodyStart);
    expect(nextStep).toBeGreaterThan(bodyStart);
    const script = dockerJob.slice(bodyStart, nextStep).replace(/^ {10}/gm, "");

    const releaseCommit = "a".repeat(40);
    const wrongCommit = "b".repeat(40);
    const version = "9.8.7";
    const source = "https://github.com/snapotter-hq/SnapOtter";
    const platformManifest =
      '{"schemaVersion":2,"mediaType":"application/vnd.oci.image.manifest.v1+json"}';
    const digest = `sha256:${createHash("sha256").update(platformManifest).digest("hex")}`;
    const index = JSON.stringify({
      schemaVersion: 2,
      manifests: [{ digest, platform: { os: "linux", architecture: "amd64" } }],
    });
    const tempRoot = mkdtempSync(path.join(tmpdir(), "snapotter-release-provenance-"));
    const binDir = path.join(tempRoot, "bin");
    execFileSync("mkdir", ["-p", binDir]);
    const scriptPath = path.join(tempRoot, "reuse.sh");
    writeFileSync(scriptPath, script, { mode: 0o700 });
    writeFileSync(
      path.join(binDir, "docker"),
      [
        "#!/usr/bin/env bash",
        "set -euo pipefail",
        'printf \'%s\\n\' "$*" >> "${MOCK_DOCKER_LOG}"',
        'if [[ "${3:-}" == "create" ]]; then',
        '  destination=""',
        "  while (( $# > 0 )); do",
        '    if [[ "$1" == "--tag" ]]; then',
        '      destination="${2:?missing repair destination}"',
        "      break",
        "    fi",
        "    shift",
        "  done",
        '  case "${destination}" in',
        '    ghcr.io/*) touch "${MOCK_STATE_DIR}/repaired-GHCR" ;;',
        '    snapotter/*) touch "${MOCK_STATE_DIR}/repaired-DOCKERHUB" ;;',
        '    *) echo "unexpected repair destination: ${destination}" >&2; exit 2 ;;',
        "  esac",
        "  exit 0",
        "fi",
        'reference="${4:?missing image reference}"',
        'if [[ "${reference}" != *@* ]]; then',
        '  if [[ "${MOCK_TAG_MODE}" == "found" ]]; then',
        "    printf '%s' \"${MOCK_INDEX}\"",
        "    exit 0",
        "  fi",
        "  echo 'manifest unknown' >&2",
        "  exit 1",
        "fi",
        'case "${reference}" in',
        '  ghcr.io/*) registry="GHCR" ;;',
        '  snapotter/*) registry="DOCKERHUB" ;;',
        '  *) echo "unexpected registry reference: ${reference}" >&2; exit 2 ;;',
        "esac",
        'state_name="MOCK_${registry}_STATE"',
        'config_name="MOCK_${registry}_IMAGE_CONFIG"',
        'registry_state="${!state_name}"',
        'image_config="${!config_name}"',
        'if [[ -f "${MOCK_STATE_DIR}/repaired-${registry}" ]]; then',
        '  registry_state="present"',
        '  image_config="${MOCK_REPAIRED_IMAGE_CONFIG}"',
        "fi",
        'if [[ "${registry_state}" == "missing" ]]; then',
        "  echo 'manifest unknown' >&2",
        "  exit 1",
        "fi",
        'if [[ " $* " == *" --raw "* ]]; then',
        "  printf '%s' \"${MOCK_PLATFORM_MANIFEST}\"",
        "  exit 0",
        "fi",
        'if [[ " $* " == *" --format "* ]]; then',
        "  printf '%s\\n' \"${image_config}\"",
        "  exit 0",
        "fi",
        "echo 'unexpected docker invocation' >&2",
        "exit 2",
      ].join("\n"),
      { mode: 0o700 },
    );
    writeFileSync(
      path.join(binDir, "gh"),
      [
        "#!/usr/bin/env bash",
        "set -euo pipefail",
        'if [[ " $* " == *"releases/assets/"* ]]; then',
        "  printf '%s\\n' \"${MOCK_PLATFORM_DIGEST}\"",
        "else",
        "  printf '123\\n'",
        "fi",
      ].join("\n"),
      { mode: 0o700 },
    );

    const exactLabels = {
      "org.opencontainers.image.revision": releaseCommit,
      "org.opencontainers.image.source": source,
      "org.opencontainers.image.version": version,
    };
    const imageConfig = (labels: Record<string, string>) =>
      JSON.stringify({
        os: "linux",
        architecture: "amd64",
        config: { Labels: labels },
      });
    const runCase = (
      caseName: string,
      options: {
        dockerhubLabels?: Record<string, string>;
        dockerhubState?: "missing" | "present";
        ghcrLabels?: Record<string, string>;
        ghcrState?: "missing" | "present";
        repairedLabels?: Record<string, string>;
        tagMode: "found" | "missing";
      },
    ) => {
      const outputPath = path.join(tempRoot, `${caseName}.output`);
      const logPath = path.join(tempRoot, `${caseName}.docker.log`);
      const stateDir = path.join(tempRoot, `${caseName}.state`);
      execFileSync("mkdir", ["-p", stateDir]);
      let exitCode = 0;
      try {
        execFileSync("bash", ["--noprofile", "--norc", "-e", "-o", "pipefail", scriptPath], {
          env: {
            ...process.env,
            PATH: `${binDir}:${process.env.PATH ?? ""}`,
            GITHUB_OUTPUT: outputPath,
            GITHUB_REPOSITORY: "snapotter-hq/SnapOtter",
            GITHUB_TOKEN: "test-token",
            MOCK_DOCKER_LOG: logPath,
            MOCK_DOCKERHUB_IMAGE_CONFIG: imageConfig(options.dockerhubLabels ?? exactLabels),
            MOCK_DOCKERHUB_STATE: options.dockerhubState ?? "present",
            MOCK_GHCR_IMAGE_CONFIG: imageConfig(options.ghcrLabels ?? exactLabels),
            MOCK_GHCR_STATE: options.ghcrState ?? "present",
            MOCK_INDEX: index,
            MOCK_PLATFORM_DIGEST: digest,
            MOCK_PLATFORM_MANIFEST: platformManifest,
            MOCK_REPAIRED_IMAGE_CONFIG: imageConfig(options.repairedLabels ?? exactLabels),
            MOCK_STATE_DIR: stateDir,
            MOCK_TAG_MODE: options.tagMode,
            PLATFORM: "linux/amd64",
            PLATFORM_PAIR: "linux-amd64",
            RELEASE_COMMIT: releaseCommit,
            VERSION: version,
          },
          stdio: "pipe",
        });
      } catch (error) {
        exitCode = (error as { status?: number }).status ?? -1;
      }
      return {
        exitCode,
        log: readFileSync(logPath, "utf8"),
        output: existsSync(outputPath) ? readFileSync(outputPath, "utf8") : "",
      };
    };

    try {
      const valid = runCase("valid-checkpoint", { tagMode: "missing" });
      expect(valid.exitCode).toBe(0);
      expect(valid.output).toContain(`digest=${digest}\n`);
      expect(valid.output).toContain("reused=true\n");
      for (const registry of ["ghcr.io/snapotter-hq/snapotter", "snapotter/snapotter"]) {
        expect(valid.log).toContain(`imagetools inspect ${registry}@${digest} --format`);
      }

      const invalidCases = [
        [
          "mismatched-tag-revision",
          "found",
          { ...exactLabels, "org.opencontainers.image.revision": wrongCommit },
        ],
        [
          "missing-checkpoint-revision",
          "missing",
          {
            "org.opencontainers.image.source": source,
            "org.opencontainers.image.version": version,
          },
        ],
        [
          "mismatched-checkpoint-source",
          "missing",
          {
            ...exactLabels,
            "org.opencontainers.image.source": "https://github.com/example/untrusted",
          },
        ],
        [
          "mismatched-checkpoint-version",
          "missing",
          {
            ...exactLabels,
            "org.opencontainers.image.version": "0.0.0",
          },
        ],
      ] as const;
      for (const [caseName, tagMode, labels] of invalidCases) {
        const result = runCase(caseName, {
          dockerhubLabels: labels,
          ghcrLabels: labels,
          tagMode,
        });
        expect(result.exitCode, caseName).toBe(0);
        expect(result.output, caseName).toBe("reused=false\n");
        for (const registry of ["ghcr.io/snapotter-hq/snapotter", "snapotter/snapotter"]) {
          expect(result.log, caseName).toContain(
            `imagetools inspect ${registry}@${digest} --format`,
          );
        }
      }

      const repairCases = [
        {
          caseName: "repair-missing-dockerhub",
          destination: "snapotter/snapotter",
          destinationState: "dockerhubState",
          source: "ghcr.io/snapotter-hq/snapotter",
        },
        {
          caseName: "repair-missing-ghcr",
          destination: "ghcr.io/snapotter-hq/snapotter",
          destinationState: "ghcrState",
          source: "snapotter/snapotter",
        },
      ] as const;
      for (const repairCase of repairCases) {
        const result = runCase(repairCase.caseName, {
          [repairCase.destinationState]: "missing",
          tagMode: "missing",
        });
        expect(result.exitCode, repairCase.caseName).toBe(0);
        expect(result.output, repairCase.caseName).toContain("reused=true\n");
        const sourceValidation = result.log.indexOf(
          `imagetools inspect ${repairCase.source}@${digest} --format`,
        );
        const repair = result.log.indexOf(
          `imagetools create --prefer-index=false --tag ${repairCase.destination}@${digest} ${repairCase.source}@${digest}`,
        );
        const destinationRevalidation = result.log.lastIndexOf(
          `imagetools inspect ${repairCase.destination}@${digest} --format`,
        );
        expect(sourceValidation, repairCase.caseName).toBeGreaterThanOrEqual(0);
        expect(repair, repairCase.caseName).toBeGreaterThanOrEqual(0);
        expect(repair, repairCase.caseName).toBeGreaterThan(sourceValidation);
        expect(destinationRevalidation, repairCase.caseName).toBeGreaterThan(repair);
      }

      const wrongGhcr = runCase("wrong-ghcr-valid-dockerhub", {
        ghcrLabels: {
          ...exactLabels,
          "org.opencontainers.image.revision": wrongCommit,
        },
        tagMode: "missing",
      });
      expect(wrongGhcr.exitCode).toBe(0);
      expect(wrongGhcr.output).toBe("reused=false\n");
      expect(wrongGhcr.log).not.toContain("imagetools create");
      for (const registry of ["ghcr.io/snapotter-hq/snapotter", "snapotter/snapotter"]) {
        expect(wrongGhcr.log).toContain(`imagetools inspect ${registry}@${digest} --format`);
      }

      const failedRepair = runCase("failed-repair-revalidation", {
        dockerhubState: "missing",
        repairedLabels: {
          ...exactLabels,
          "org.opencontainers.image.revision": wrongCommit,
        },
        tagMode: "missing",
      });
      expect(failedRepair.exitCode).not.toBe(0);
      expect(failedRepair.output).not.toContain("reused=true");
      const failedRepairCopy = failedRepair.log.indexOf(
        `imagetools create --prefer-index=false --tag snapotter/snapotter@${digest} ghcr.io/snapotter-hq/snapotter@${digest}`,
      );
      expect(failedRepairCopy).toBeGreaterThanOrEqual(0);
      expect(
        failedRepair.log.lastIndexOf(`imagetools inspect snapotter/snapotter@${digest} --format`),
      ).toBeGreaterThan(failedRepairCopy);

      const reuseStep = dockerJob.slice(stepStart, nextStep);
      expect(reuseStep).toContain("RELEASE_COMMIT: ${{ needs.release.outputs.release_commit }}");
      expect(reuseStep).toContain(
        '.config.Labels["org.opencontainers.image.revision"] == $release_commit',
      );
      expect(reuseStep).toContain(
        '.config.Labels["org.opencontainers.image.source"] == $expected_source',
      );
      expect(reuseStep).toContain('.config.Labels["org.opencontainers.image.version"] == $version');
      expect(dockerJob).toContain(
        "org.opencontainers.image.revision=${{ needs.release.outputs.release_commit }}",
      );
      expect(dockerJob).toContain(
        "org.opencontainers.image.source=https://github.com/${{ github.repository }}",
      );
      expect(dockerJob).toContain(
        "org.opencontainers.image.version=${{ needs.release.outputs.new_version }}",
      );

      const exportStart = dockerJob.indexOf("      - name: Export digest\n");
      const persistStart = dockerJob.indexOf(
        "      - name: Persist immutable platform digest on the GitHub release\n",
        exportStart,
      );
      expect(exportStart).toBeGreaterThan(nextStep);
      expect(persistStart).toBeGreaterThan(exportStart);
      const exportStep = dockerJob.slice(exportStart, persistStart);
      expect(exportStep).toContain("RELEASE_COMMIT: ${{ needs.release.outputs.release_commit }}");
      expect(exportStep).toContain(
        '.config.Labels["org.opencontainers.image.revision"] == $release_commit',
      );
      expect(exportStep).toContain(
        '.config.Labels["org.opencontainers.image.source"] == $expected_source',
      );
      expect(exportStep).toContain(
        '.config.Labels["org.opencontainers.image.version"] == $version',
      );
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("cannot publish manifests from recovered checkpoints without provenance revalidation", () => {
    const manifestJob = job(readRequired(releaseWorkflowPath), "manifest", "aliases");
    const recovery = manifestJob.indexOf(
      "Recover expired digest artifacts from the GitHub release",
    );
    const dockerHubLogin = manifestJob.indexOf("Log in to Docker Hub", recovery);
    const ghcrLogin = manifestJob.indexOf("Log in to GitHub Container Registry", dockerHubLogin);
    const validation = manifestJob.indexOf(
      "Revalidate platform digest provenance before publication",
      ghcrLogin,
    );
    const dockerHubPublish = manifestJob.indexOf("Create immutable Docker Hub manifest");
    const ghcrPublish = manifestJob.indexOf("Create immutable GHCR manifest");

    expect(recovery).toBeGreaterThanOrEqual(0);
    expect(dockerHubLogin).toBeGreaterThan(recovery);
    expect(ghcrLogin).toBeGreaterThan(dockerHubLogin);
    expect(validation).toBeGreaterThan(ghcrLogin);
    expect(dockerHubPublish).toBeGreaterThan(validation);
    expect(ghcrPublish).toBeGreaterThan(dockerHubPublish);

    const validationStep = manifestJob.slice(validation, dockerHubPublish);
    expect(validationStep).toContain("RELEASE_COMMIT: ${{ needs.release.outputs.release_commit }}");
    expect(validationStep).toContain("ghcr.io/snapotter-hq/snapotter");
    expect(validationStep).toContain("snapotter/snapotter");
    expect(validationStep).toContain('"${reference}@${digest}" --raw');
    expect(validationStep).toContain("--format '{{json .Image}}'");
    expect(validationStep).toContain(
      '.config.Labels["org.opencontainers.image.revision"] == $release_commit',
    );
    expect(validationStep).toContain(
      '.config.Labels["org.opencontainers.image.source"] == $expected_source',
    );
    expect(validationStep).toContain(
      '.config.Labels["org.opencontainers.image.version"] == $version',
    );
    expect(validationStep).toContain("Recovered platform digest closure is invalid");
  });

  it("serializes mutation boundaries without locking the approval-gated manifest", () => {
    const release = readRequired(releaseWorkflowPath);
    const releaseJob = job(release, "release", "prebuilt");
    const prebuiltJob = job(release, "prebuilt", "docker");
    const dockerJob = job(release, "docker", "scan");
    const manifestJob = job(release, "manifest", "aliases");
    const aliasesJob = job(release, "aliases");

    expect(releaseJob).toContain("group: snapotter-semantic-release");
    expect(releaseJob).toContain("cancel-in-progress: false");
    expect(prebuiltJob).toContain(
      "group: snapotter-prebuilt-${{ needs.release.outputs.new_version }}-${{ matrix.arch }}",
    );
    expect(prebuiltJob).toContain("cancel-in-progress: false");
    expect(dockerJob).toContain(
      "group: snapotter-image-${{ needs.release.outputs.new_version }}-${{ matrix.platform }}",
    );
    expect(dockerJob).toContain("cancel-in-progress: false");
    expect(manifestJob).not.toContain("concurrency:");
    expect(aliasesJob).toContain("group: snapotter-image-moving-aliases");
    expect(aliasesJob).toContain("cancel-in-progress: false");
    expect(aliasesJob).toContain("queue: max");
    expect(aliasesJob).not.toContain("environment:");
  });

  it("requires application SBOM completion before publishing public image tags", () => {
    const manifest = job(readRequired(releaseWorkflowPath), "manifest", "aliases");
    expect(manifest).toContain("needs: [release, docker, scan, sbom, ai-bundles]");
  });

  it("revalidates the remote release tag after approval and at both immutable publications", () => {
    const manifest = job(readRequired(releaseWorkflowPath), "manifest", "aliases");

    expect(manifest).toContain("ref: ${{ needs.release.outputs.release_commit }}");
    expect(manifest).toContain("persist-credentials: false");
    expect(manifest.match(/git fetch --force --no-tags origin/g)).toHaveLength(3);
    expect(manifest.match(/refs\/tags\/v\$\{VERSION\}:refs\/tags\/v\$\{VERSION\}/g)).toHaveLength(
      3,
    );
    expect(manifest.match(/"\$\{tag_commit\}" == "\$\{RELEASE_COMMIT\}"/g)).toHaveLength(3);

    const dockerPublish = manifest.indexOf("Create immutable Docker Hub manifest");
    const ghcrPublish = manifest.indexOf("Create immutable GHCR manifest");
    const dockerStep = manifest.slice(dockerPublish, ghcrPublish);
    const ghcrStep = manifest.slice(ghcrPublish);
    expect(dockerStep.indexOf("git fetch --force --no-tags origin")).toBeGreaterThan(0);
    expect(dockerStep.indexOf("git fetch --force --no-tags origin")).toBeLessThan(
      dockerStep.indexOf("docker buildx imagetools create"),
    );
    expect(ghcrStep.indexOf("git fetch --force --no-tags origin")).toBeGreaterThan(0);
    expect(ghcrStep.indexOf("git fetch --force --no-tags origin")).toBeLessThan(
      ghcrStep.indexOf("docker buildx imagetools create"),
    );
  });

  it("publishes immutable version tags separately and never regresses moving aliases", () => {
    const release = readRequired(releaseWorkflowPath);
    const manifest = job(release, "manifest", "aliases");
    const aliases = job(release, "aliases");

    expect(manifest).toContain('arguments=("-t" "snapotter/snapotter:${VERSION}")');
    expect(manifest).toContain('arguments=("-t" "ghcr.io/snapotter-hq/snapotter:${VERSION}")');
    expect(manifest).not.toContain("{{major}}");
    expect(manifest).not.toContain("value=latest");
    expect(aliases).toContain("needs: [release, manifest]");
    expect(aliases).toContain(
      "Fetch and evaluate stable tags immediately before Docker Hub aliases",
    );
    expect(aliases).toContain("Fetch and evaluate stable tags immediately before GHCR aliases");
    expect(aliases.match(/git fetch --force --prune --prune-tags --tags origin/g)).toHaveLength(2);
    expect(aliases).toContain("stable_pattern = re.compile(");
    expect(aliases).toContain("same_minor");
    expect(aliases).toContain("same_major");
    expect(aliases).toContain('aliases.append("latest")');
    expect(aliases).toContain("No non-regressing Docker Hub aliases are eligible");
    expect(aliases).toContain("No non-regressing GHCR aliases are eligible");
    expect(aliases).toContain('arguments+=("-t" "snapotter/snapotter:${alias}")');
    expect(aliases).toContain('arguments+=("-t" "ghcr.io/snapotter-hq/snapotter:${alias}")');
  });

  it("computes moving aliases from the highest stable tag in each semver scope", () => {
    const aliasesJob = job(readRequired(releaseWorkflowPath), "aliases");
    const embedded = aliasesJob.match(
      /cat > \/tmp\/eligible-image-aliases\.py <<'PY'\n([\s\S]*?)\n {10}PY/,
    );
    expect(embedded).not.toBeNull();
    const script = embedded?.[1].replace(/^ {10}/gm, "") ?? "";
    const repository = mkdtempSync(path.join(tmpdir(), "snapotter-aliases-"));
    const scriptPath = path.join(repository, "eligible-image-aliases.py");
    const outputPath = path.join(repository, "aliases.txt");

    try {
      writeFileSync(scriptPath, script);
      execFileSync("git", ["init", "--quiet"], { cwd: repository });
      execFileSync(
        "git",
        [
          "-c",
          "user.name=SnapOtter",
          "-c",
          "user.email=release@snapotter.test",
          "commit",
          "--allow-empty",
          "--quiet",
          "-m",
          "release tags",
        ],
        { cwd: repository },
      );
      for (const tag of ["v1.2.3", "v1.2.4", "v1.3.0", "v2.0.0", "v2.1.0-beta.1"]) {
        execFileSync("git", ["tag", tag], { cwd: repository });
      }

      const evaluate = (version: string): string[] => {
        execFileSync("python3", [scriptPath], {
          cwd: repository,
          env: { ...process.env, ALIAS_OUTPUT: outputPath, VERSION: version },
        });
        return readFileSync(outputPath, "utf8").trim().split("\n").filter(Boolean);
      };

      expect(evaluate("1.2.3")).toEqual([]);
      expect(evaluate("1.2.4")).toEqual(["1.2"]);
      expect(evaluate("1.3.0")).toEqual(["1.3", "1"]);
      expect(evaluate("2.0.0")).toEqual(["2.0", "2", "latest"]);
      expect(evaluate("2.1.0-beta.1")).toEqual([]);
    } finally {
      rmSync(repository, { force: true, recursive: true });
    }
  });

  it("builds deterministic immutable prebuilt archive and checksum assets", () => {
    const prebuilt = job(readRequired(releaseWorkflowPath), "prebuilt", "docker");

    expect(prebuilt).toContain(
      'SOURCE_DATE_EPOCH="$(git show -s --format=%ct "${RELEASE_COMMIT}")"',
    );
    expect(prebuilt.indexOf("Export reproducible build epoch")).toBeLessThan(
      prebuilt.indexOf("Build web frontend"),
    );
    expect(prebuilt).toContain('echo "SOURCE_DATE_EPOCH=${SOURCE_DATE_EPOCH}" >> "$GITHUB_ENV"');
    expect(prebuilt).toContain("--sort=name");
    expect(prebuilt).toContain('--mtime="@${SOURCE_DATE_EPOCH}"');
    expect(prebuilt).toContain("--owner=0 --group=0 --numeric-owner");
    expect(prebuilt).toContain("--pax-option=delete=atime,delete=ctime");
    expect(prebuilt).toContain("gzip -n");
    expect(prebuilt).not.toContain("--clobber");
    expect(prebuilt).toContain("verify_or_upload_asset");
    expect(prebuilt).toContain("Existing immutable release asset differs");
    expect(prebuilt).toContain("Expected exactly one immutable release asset after upload");
    expect(prebuilt).toContain('verify_or_upload_asset "/tmp/${archive_name}"');
    expect(prebuilt).toContain('verify_or_upload_asset "/tmp/${archive_name}.sha256"');
  });
});
