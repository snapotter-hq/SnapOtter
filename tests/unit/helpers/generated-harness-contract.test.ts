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
});
