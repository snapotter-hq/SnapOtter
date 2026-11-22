import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getRequiredBundlesForTool, TOOL_OPTIONAL_BUNDLE_MAP } from "@snapotter/shared";
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

  // #5213: these harnesses call processV2 directly, so an optional-bundle-only
  // tool must not be skipped whole, and each case checks its own bundle.
  it.each(["fuzz-settings.test.ts", "settings-pairwise.test.ts"])(
    "%s gates optional-bundle-only tools per case, not per tool",
    (filename) => {
      const text = source(filename);
      expect(text).toMatch(/!PER_REQUEST_AI_GATED_TOOLS\.has\(toolId\)/);
      expect(text).toMatch(
        /findMissingSettingsBundle\(config, parsed\.data, REQUIRE_AI_FEATURES\)/,
      );
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

  // #4443: under REQUIRE_AI_FEATURES=1 a bundle missing from DATA_DIR must
  // fail the tool by name, not skip it or hide behind per-request 501s.
  it.each([
    "format-matrix-generated.shared.ts",
    "format-matrix-multimodal.test.ts",
    "settings-matrix.test.ts",
  ])("%s gates AI tools on installed bundles through requiredAiGate", (filename) => {
    const text = source(filename);
    expect(text).toContain("requiredAiGate(toolId");
    expect(text).toContain("firstMissingBundle: getFirstMissingBundleForTool");
    expect(text).not.toMatch(/&& !REQUIRE_AI_FEATURES\)/);
  });

  // #5206: the image format matrix must leave optional-bundle-only tools to
  // the per-request 501 handling instead of skipping the whole tool.
  it("image format matrix gates optional-bundle-only tools per request, not per tool", () => {
    const text = source("format-matrix-generated.shared.ts");
    expect(text).toContain("PER_REQUEST_AI_GATED_TOOLS");
    expect(text).toMatch(/!PER_REQUEST_AI_GATED_TOOLS\.has\(toolId\)/);
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

  // A long tool's refusal of a bad file arrives as a failed job, not a 4xx
  // response. Each 202 branch has to read the recorded status off the job row,
  // or the refusal reads as a crash and accounting stops balancing (#5038).
  it.each([
    "format-matrix-generated.shared.ts",
    "format-matrix-multimodal.test.ts",
    "settings-matrix.test.ts",
  ])("%s counts a recorded client-fault job failure as a rejection", (filename) => {
    const text = source(filename);
    expect(text).toContain("isRecordedRejection(await settledJobRow(");
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

  // The set skips a tool outright by default, so a tool listed without a
  // feature bundle silently loses all its settings coverage (#4987).
  it("settings matrix AI-gates only tools that have a feature bundle", () => {
    const set = source("settings-matrix.test.ts").match(
      /const AI_GATED_TOOLS = new Set\(\[([^\]]*)\]\)/,
    );
    expect(set, "AI_GATED_TOOLS literal not found").not.toBeNull();
    const ids = [...(set?.[1] ?? "").matchAll(/"([^"]+)"/g)].map(([, id]) => id);
    expect(ids.length).toBeGreaterThan(0);
    const unbundled = ids.filter(
      (id) => getRequiredBundlesForTool(id).length === 0 && !TOOL_OPTIONAL_BUNDLE_MAP[id],
    );
    expect(unbundled).toEqual([]);
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
    // on a host with bundles installed: the ubuntu_gpu AI matrix step in the
    // release preflight (.claude/scripts/fix-issue/ai-matrix.sh, #4443). The
    // extended-matrix lane has no bundle-install step, so requiring them there
    // fails every AI tool on a bundle-less runner.
    const workflow = readFileSync(join(process.cwd(), ".github/workflows/nightly.yml"), "utf8");
    const extendedLane = workflow.slice(
      workflow.indexOf("  extended-matrix:"),
      workflow.indexOf("  api-fuzz:"),
    );
    expect(extendedLane).not.toContain("REQUIRE_AI_FEATURES");
  });
});
