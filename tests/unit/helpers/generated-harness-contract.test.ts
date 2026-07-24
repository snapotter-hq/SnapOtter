import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const GENERATED = join(process.cwd(), "tests/integration/generated");
const source = (filename: string): string => readFileSync(join(GENERATED, filename), "utf8");

describe("generated QA harness contract", () => {
  it.each(["fuzz-settings.test.ts", "settings-pairwise.test.ts"])(
    "%s accounts for execution and uses explicit runtime skips",
    (filename) => {
      const text = source(filename);
      expect(text).toContain("GeneratedCaseAccounting");
      expect(text).toContain("context.skip(");
      expect(text).not.toMatch(/if \(!config\) return;/);
      expect(text).not.toContain("Clean operational failure");
    },
  );

  it.each([
    "format-matrix-generated.test.ts",
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
    "format-matrix-generated.test.ts",
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
    expect(text).toContain("expectedAttempts: NUM_RUNS");
  });

  it("the actual nightly extended lane requires installed AI features", () => {
    const workflow = readFileSync(join(process.cwd(), ".github/workflows/nightly.yml"), "utf8");
    const extendedLane = workflow.slice(
      workflow.indexOf("  extended-matrix:"),
      workflow.indexOf("  api-fuzz:"),
    );
    expect(extendedLane).toContain('REQUIRE_AI_FEATURES: "1"');
  });
});
