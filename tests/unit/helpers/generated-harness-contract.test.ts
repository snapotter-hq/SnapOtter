import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const GENERATED = join(process.cwd(), "tests/integration/generated");
const source = (filename: string): string => readFileSync(join(GENERATED, filename), "utf8");

describe("generated QA harness contract", () => {
  it.each(["fuzz-settings.test.ts", "settings-pairwise.test.ts"])(
    "%s accounts for execution through the production v2 contract and uses explicit runtime skips",
    (filename) => {
      const text = source(filename);
      expect(text).toContain("GeneratedCaseAccounting");
      expect(text).toContain("runGeneratedTool");
      expect(text).toContain("context.skip(");
      expect(text).toContain("isExpectedGeneratedRejection");
      expect(text).toContain("findMissingGeneratedPrerequisite");
      expect(text).toContain("buildGeneratedProcessInputs(fixtures, config, tool.modality)");
      expect(text).not.toMatch(/if \(!config\) return;/);
      expect(text).not.toContain("config.process(");
      expect(text).not.toContain("CRASH_PATTERN");
      expect(text).not.toContain("Clean operational failure");
    },
  );

  it.each([
    "format-matrix-generated.shared.ts",
    "format-matrix-multimodal.test.ts",
    "format-matrix-ai.test.ts",
  ])("%s makes required-AI mode strict", (filename) => {
    const text = source(filename);
    expect(text).toContain("REQUIRE_AI_FEATURES");
    expect(text).toContain("featureUnavailableDisposition");
  });

  it("multimodal matrix consumes the shared image-inclusive fixture index", () => {
    const text = source("format-matrix-multimodal.test.ts");
    expect(text).toContain("generatedFixtureDirectories");
    expect(text).toContain("selectFixturesForTool");
  });

  it.each([
    "format-matrix-generated.shared.ts",
    "format-matrix-multimodal.test.ts",
    "settings-matrix.test.ts",
  ])("%s resolves every 202 and validates its completed artifact", (filename) => {
    const text = source(filename);
    expect(text).toContain("waitForGeneratedJobArtifact");
    expect(text).not.toContain("cancelAcceptedJobAndWait");
    expect(text).not.toMatch(
      /statusCode === 200 \|\| res\.statusCode === 202\) accounting\.accept/,
    );
  });

  it("fuzz executes the exact requested run count instead of interrupting successfully", () => {
    const text = source("fuzz-settings.test.ts");
    expect(text).not.toContain("interruptAfterTimeLimit");
    expect(text).toContain("expectedAttempts: FUZZ_CONFIG.runs + 1");
  });

  it("pairwise does not truncate the covering array after it is generated", () => {
    const text = source("settings-pairwise.test.ts");
    expect(text).not.toContain("MAX_CASES_PER_TOOL");
    expect(text).not.toMatch(/\.slice\(0,/);
  });

  it("settings capability gates preserve every collected variation", () => {
    const text = source("settings-matrix.test.ts");
    expect(text).toContain("allPythonVariationsUnavailable");
    expect(text).not.toContain("describe.skip(");
  });

  it("the nightly extended lane does not require AI features it never installs", () => {
    // Strict required-AI mode (absence of a bundle is a failure) is only valid
    // on a host with bundles installed, which is the release-QA fleet. The
    // extended-matrix lane has no bundle-install step, so requiring them there
    // 501s every installed-contract case on a bundle-less runner.
    const workflow = readFileSync(join(process.cwd(), ".github/workflows/nightly.yml"), "utf8");
    const extendedLane = workflow.slice(
      workflow.indexOf("  extended-matrix:"),
      workflow.indexOf("  api-fuzz:"),
    );
    expect(extendedLane).not.toContain("REQUIRE_AI_FEATURES");
  });
});
