import { describe, expect, it } from "vitest";
import { getRequiredBundlesForTool } from "../../../packages/shared/src/features.js";
import {
  PIPELINE_TEMPLATES,
  type PipelineTemplate,
  templateRequiredBundles,
} from "../../../packages/shared/src/pipeline-templates.js";

// templateRequiredBundles collects the deduped union of the bundles required by
// each step's tool. Pins the two loops, the Set-based dedup, and the spread.
describe("templateRequiredBundles", () => {
  it("returns the deduped union of per-step bundles for every prebuilt template", () => {
    for (const t of PIPELINE_TEMPLATES) {
      const expected = new Set(t.steps.flatMap((s) => getRequiredBundlesForTool(s.toolId)));
      const result = templateRequiredBundles(t);
      expect(new Set(result)).toEqual(expected);
      expect(result.length).toBe(new Set(result).size); // no duplicates
    }
  });

  it("dedupes when the same bundle-requiring tool appears in two steps", () => {
    const withBundle = PIPELINE_TEMPLATES.flatMap((t) => t.steps.map((s) => s.toolId)).find(
      (id) => getRequiredBundlesForTool(id).length > 0,
    );
    // Every shipped AI-pipeline template should carry at least one bundle tool.
    expect(withBundle).toBeDefined();
    const bundles = getRequiredBundlesForTool(withBundle as string);
    const template: PipelineTemplate = {
      ...PIPELINE_TEMPLATES[0],
      steps: [
        { toolId: withBundle as string, settings: {} },
        { toolId: withBundle as string, settings: {} },
      ],
    };
    const result = templateRequiredBundles(template);
    expect(new Set(result)).toEqual(new Set(bundles));
    expect(result.length).toBe(bundles.length); // two identical steps collapse to one set
  });

  it("returns an empty array when no step requires a bundle", () => {
    const plain = PIPELINE_TEMPLATES.flatMap((t) => t.steps.map((s) => s.toolId)).find(
      (id) => getRequiredBundlesForTool(id).length === 0,
    );
    expect(plain).toBeDefined();
    const template: PipelineTemplate = {
      ...PIPELINE_TEMPLATES[0],
      steps: [{ toolId: plain as string, settings: {} }],
    };
    expect(templateRequiredBundles(template)).toEqual([]);
  });
});
