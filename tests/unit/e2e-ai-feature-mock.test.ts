import fs from "node:fs";
import path from "node:path";
import { FEATURE_BUNDLES } from "@snapotter/shared";
import { describe, expect, test } from "vitest";

const e2eDir = path.join(process.cwd(), "tests", "e2e");
const read = (name: string) => fs.readFileSync(path.join(e2eDir, name), "utf8");

// AI tool pages render an install prompt instead of the dropzone when their
// bundle is missing, and the e2e image (and `pnpm test:docker`) ships none.
describe("e2e AI feature gate (#5253)", () => {
  test("mockAllAiFeaturesInstalled reports every shipped bundle", () => {
    const helpers = read("helpers.ts");
    expect(helpers).toContain("export async function mockAllAiFeaturesInstalled");
    expect(helpers).toMatch(/Object\.values\(FEATURE_BUNDLES\)/);
    expect(Object.keys(FEATURE_BUNDLES).length).toBeGreaterThan(0);
  });

  test.each([
    "gui-tools-ai.spec.ts",
    "ai-canvas-expand.spec.ts",
    "gui-tools-expanded.spec.ts",
    "gui-navigation.spec.ts",
  ])("%s mocks the AI feature gate before it opens tool pages", (spec) => {
    expect(read(spec)).toMatch(
      /test\.beforeEach\(async \(\{ page \}\) => \{\s*await mockAllAiFeaturesInstalled\(page\);/,
    );
  });
});
