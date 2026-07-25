import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const DOLLAR = "$";

describe("installed AI production-container release lane", () => {
  it("runs for release calls, manual dispatch, and a weekly schedule", () => {
    const workflow = readFileSync(join(ROOT, ".github/workflows/ai-bundles.yml"), "utf8");

    expect(workflow).toContain("workflow_call:");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toMatch(/schedule:\s*\n\s*- cron: "[^\n]+"/u);
    expect(workflow).toContain("installed-ai-production:");
    expect(workflow).toContain("name: Verify installed AI in production image");
    expect(workflow).toContain("digests-linux-amd64");
    expect(workflow).toContain("actions/workflows/release.yml/runs");
    expect(workflow).toContain('conclusion == "success"');
  });

  it("uses exact run-scoped resources and always cleans only those resources", () => {
    const workflow = readFileSync(join(ROOT, ".github/workflows/ai-bundles.yml"), "utf8");
    const lane = workflow.slice(workflow.indexOf("  installed-ai-production:"));

    expect(lane).toContain(`sha256:${DOLLAR}{IMAGE_DIGEST}`);
    expect(lane).toContain("org.opencontainers.image.source");
    expect(lane).toContain(`[[ ! -s "${DOLLAR}{digest_files[0]}" ]]`);
    expect(lane).toContain(`io.snapotter.qa.scope=${DOLLAR}{RUN_SCOPE}`);
    expect(lane).toContain(`if: ${DOLLAR}{{ always() }}`);
    expect(lane).toContain(`docker rm --force "${DOLLAR}{RUN_SCOPE}-app"`);
    expect(lane).toContain(`docker volume rm "${DOLLAR}{RUN_SCOPE}-data"`);
    expect(lane).toContain(`docker network rm "${DOLLAR}{RUN_SCOPE}-network"`);
    expect(lane).not.toMatch(/docker\s+(?:system\s+)?prune/u);
    expect(lane).toContain("available_kib");
    expect(lane).toContain("--publish 127.0.0.1::1349");
    expect(lane).toContain(`docker port "${DOLLAR}{RUN_SCOPE}-app" 1349/tcp`);
    expect(lane).toContain(`QA_BASE_URL=http://127.0.0.1:${DOLLAR}{QA_PORT}`);
    expect(lane).not.toContain("127.0.0.1:13499");
    expect(lane).toContain("--env SNAPOTTER_GPU=0");
  });

  it("invokes a fail-closed authenticated verifier without fake installed state", () => {
    const verifier = readFileSync(
      join(ROOT, "tests/qa/verify-installed-ai-production.mts"),
      "utf8",
    );

    expect(verifier).toContain("/api/auth/login");
    expect(verifier).toContain("/api/v1/admin/features/");
    expect(verifier).toContain('"transcription"');
    expect(verifier).toContain('"background-removal"');
    for (const tool of [
      "transcribe-audio",
      "auto-subtitles",
      "blur-background",
      "background-replace",
    ]) {
      expect(verifier).toContain(`"${tool}"`);
    }
    for (const oracle of [
      "expectKnownTranscript",
      "expectSrtArtifact",
      "expectObservablePixelChange",
      "expectForegroundPreserved",
      "expectConfiguredBackground",
      "expectBackgroundBlurEnergyReduced",
    ]) {
      expect(verifier).toContain(oracle);
    }
    expect(verifier).not.toContain("installed.json");
    expect(verifier).not.toContain("seed-ai-models");
  });

  it("keeps actionlint strict while declaring the one custom runner label", () => {
    const config = readFileSync(join(ROOT, ".github/actionlint.yaml"), "utf8");
    expect(config).toContain("self-hosted-runner:");
    expect(config).toContain("snapotter-nvidia");

    const workflow = readFileSync(join(ROOT, ".github/workflows/ai-bundles.yml"), "utf8");
    expect(workflow).not.toContain("queue: max");
  });
});
