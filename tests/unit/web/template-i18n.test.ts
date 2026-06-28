import { en } from "@snapotter/shared";
import { describe, expect, it } from "vitest";
import {
  getTemplateDescription,
  getTemplateName,
} from "../../../apps/web/src/lib/template-i18n.js";

describe("template-i18n", () => {
  it("resolves a known template's name and description from en", () => {
    expect(getTemplateName(en, "web-optimize", "fallback")).toBe(
      en.pipelineTemplates["web-optimize"].name,
    );
    expect(getTemplateDescription(en, "web-optimize", "fallback")).toBe(
      en.pipelineTemplates["web-optimize"].description,
    );
  });

  it("returns the fallback for an unknown id", () => {
    expect(getTemplateName(en, "does-not-exist", "fallback")).toBe("fallback");
    expect(getTemplateDescription(en, "does-not-exist", "fallback")).toBe("fallback");
  });
});
