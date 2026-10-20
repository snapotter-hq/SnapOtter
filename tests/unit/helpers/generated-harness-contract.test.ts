import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import { registerCompressPdf } from "../../../apps/api/src/routes/tools/compress-pdf.js";

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

  it("compress-pdf settings-matrix variations exercise quality and targetSize modes without stripped keys (#3128)", () => {
    registerCompressPdf({ post: () => undefined } as unknown as Parameters<
      typeof registerCompressPdf
    >[0]);
    const schema = getToolConfig("compress-pdf")?.settingsSchema;
    expect(schema).toBeDefined();
    if (!schema) return;

    const text = source("settings-matrix.test.ts");
    const block = text.match(/"compress-pdf":\s*\[([\s\S]*?)\n\s*\],/)?.[1] ?? "";
    const labelCount = [...block.matchAll(/label:\s*"/g)].length;
    const rawSettings = [...block.matchAll(/settings:\s*(\{[^}]+\})/g)].map(
      (match) =>
        JSON.parse(match[1].replace(/([a-zA-Z0-9_]+)\s*:/g, '"$1":')) as Record<string, unknown>,
    );
    expect(rawSettings.length).toBeGreaterThan(0);
    expect(rawSettings.length).toBe(labelCount);

    const parsedSettings = rawSettings.map((raw) => {
      const parsed = schema.safeParse(raw);
      expect(parsed.success).toBe(true);
      if (!parsed.success) throw parsed.error;
      const data = parsed.data as Record<string, unknown>;
      const strippedKeys = Object.keys(raw).filter((key) => !(key in data));
      expect(strippedKeys).toEqual([]);
      return data;
    });

    const qualities = parsedSettings.filter((s) => s.mode === "quality").map((s) => s.quality);
    const targetSizes = parsedSettings
      .filter((s) => s.mode === "targetSize")
      .map((s) => s.targetSizeKb);
    expect(qualities).toEqual(expect.arrayContaining([1, 50, 100]));
    expect(targetSizes).toEqual(expect.arrayContaining([10, 500]));
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
