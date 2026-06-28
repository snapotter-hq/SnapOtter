import {
  getRequiredBundlesForTool,
  PIPELINE_TEMPLATES,
  templateRequiredBundles,
} from "@snapotter/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getToolConfig } from "../../apps/api/src/routes/tool-factory.js";
import { buildTestApp, type TestApp } from "./test-server.js";

// Mirror of PASSWORD_TOOLS in apps/api/src/routes/pipeline.ts. These cannot be
// persisted or run in a saved/template pipeline.
const PASSWORD_TOOLS = new Set(["protect-pdf", "unlock-pdf"]);

describe("pipeline templates drift guard", () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await buildTestApp();
  }, 30_000);

  afterAll(async () => {
    await testApp.cleanup();
  }, 10_000);

  it("every step's toolId is registry-runnable with valid settings", () => {
    for (const tpl of PIPELINE_TEMPLATES) {
      for (const step of tpl.steps) {
        const config = getToolConfig(step.toolId);
        expect(
          config,
          `template "${tpl.id}" references unregistered tool "${step.toolId}"`,
        ).toBeDefined();
        expect(PASSWORD_TOOLS.has(step.toolId), `template "${tpl.id}" uses a password tool`).toBe(
          false,
        );
        const parsed = config!.settingsSchema.safeParse(step.settings);
        expect(
          parsed.success,
          `template "${tpl.id}" step "${step.toolId}" invalid settings: ${
            parsed.success ? "" : JSON.stringify(parsed.error.issues)
          }`,
        ).toBe(true);
      }
    }
  });

  it("derived required bundles match the per-tool bundle map", () => {
    for (const tpl of PIPELINE_TEMPLATES) {
      const expected = new Set<string>();
      for (const step of tpl.steps) {
        for (const b of getRequiredBundlesForTool(step.toolId)) expected.add(b);
      }
      expect(new Set(templateRequiredBundles(tpl))).toEqual(expected);
    }
  });
});
