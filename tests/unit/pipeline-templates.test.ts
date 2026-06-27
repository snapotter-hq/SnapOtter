import { en, PIPELINE_TEMPLATES, TOOLS, templateRequiredBundles } from "@snapotter/shared";
import { describe, expect, it } from "vitest";

const VALID_MODALITIES = new Set(["image", "video", "audio", "document", "file"]);
const toolIds = new Set(TOOLS.map((t) => t.id));

describe("PIPELINE_TEMPLATES", () => {
  it("has unique ids that don't collide with tool ids", () => {
    const ids = PIPELINE_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(toolIds.has(id), `template id "${id}" collides with a tool id`).toBe(false);
    }
  });

  it("every template has a valid modality and at least one step", () => {
    for (const tpl of PIPELINE_TEMPLATES) {
      expect(VALID_MODALITIES.has(tpl.modality), `bad modality on "${tpl.id}"`).toBe(true);
      expect(tpl.steps.length, `template "${tpl.id}" has no steps`).toBeGreaterThan(0);
      for (const step of tpl.steps) {
        expect(typeof step.toolId).toBe("string");
        expect(step.settings && typeof step.settings).toBe("object");
      }
    }
  });

  it("has a name and description in en.ts for every template id", () => {
    for (const tpl of PIPELINE_TEMPLATES) {
      const entry = (
        en.pipelineTemplates as Record<string, { name?: string; description?: string }>
      )[tpl.id];
      expect(entry?.name, `missing en name for "${tpl.id}"`).toBeTruthy();
      expect(entry?.description, `missing en description for "${tpl.id}"`).toBeTruthy();
    }
  });

  it("derives the expected required bundles", () => {
    const byId = Object.fromEntries(PIPELINE_TEMPLATES.map((t) => [t.id, t]));
    expect(templateRequiredBundles(byId["web-optimize"])).toEqual([]);
    expect(templateRequiredBundles(byId["cut-out-subject"])).toEqual(["background-removal"]);
    expect(new Set(templateRequiredBundles(byId["restore-old-photo"]))).toEqual(
      new Set(["photo-restoration", "object-eraser-colorize", "upscale-enhance"]),
    );
  });
});
