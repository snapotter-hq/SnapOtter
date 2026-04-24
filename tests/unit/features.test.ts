import {
  FEATURE_BUNDLES,
  getBundleForTool,
  getToolsForBundle,
  PYTHON_SIDECAR_TOOLS,
  TOOL_BUNDLE_MAP,
} from "@snapotter/shared";
import { describe, expect, it } from "vitest";

describe("Feature bundles", () => {
  it("every PYTHON_SIDECAR_TOOL maps to exactly one bundle", () => {
    for (const toolId of PYTHON_SIDECAR_TOOLS) {
      const bundle = getBundleForTool(toolId);
      expect(bundle, `${toolId} has no bundle`).toBeDefined();
    }
  });

  it("getBundleForTool returns null for non-AI tools", () => {
    expect(getBundleForTool("resize")).toBeNull();
    expect(getBundleForTool("crop")).toBeNull();
  });

  it("getToolsForBundle returns correct tools", () => {
    const tools = getToolsForBundle("background-removal");
    expect(tools).toContain("remove-background");
    expect(tools).toContain("passport-photo");
    expect(tools).not.toContain("upscale");
  });

  it("all 6 bundles are defined", () => {
    expect(Object.keys(FEATURE_BUNDLES)).toHaveLength(6);
    expect(FEATURE_BUNDLES["background-removal"]).toBeDefined();
    expect(FEATURE_BUNDLES["face-detection"]).toBeDefined();
    expect(FEATURE_BUNDLES["object-eraser-colorize"]).toBeDefined();
    expect(FEATURE_BUNDLES["upscale-enhance"]).toBeDefined();
    expect(FEATURE_BUNDLES["photo-restoration"]).toBeDefined();
    expect(FEATURE_BUNDLES["ocr"]).toBeDefined();
  });

  it("TOOL_BUNDLE_MAP covers all sidecar tools", () => {
    const mappedTools = Object.keys(TOOL_BUNDLE_MAP);
    for (const toolId of PYTHON_SIDECAR_TOOLS) {
      expect(mappedTools, `${toolId} missing from TOOL_BUNDLE_MAP`).toContain(toolId);
    }
  });
});

describe("Feature bundle edge cases", () => {
  it("no duplicate tools across bundles", () => {
    const allTools: string[] = [];
    for (const bundle of Object.values(FEATURE_BUNDLES)) {
      for (const tool of bundle.enablesTools) {
        expect(allTools, `Tool ${tool} appears in multiple bundles`).not.toContain(tool);
        allTools.push(tool);
      }
    }
  });

  it("every bundle has a non-empty estimated size", () => {
    for (const bundle of Object.values(FEATURE_BUNDLES)) {
      expect(bundle.estimatedSize.length).toBeGreaterThan(0);
    }
  });

  it("getToolsForBundle returns empty array for unknown bundle", () => {
    expect(getToolsForBundle("nonexistent")).toEqual([]);
  });

  it("getBundleForTool returns null for unknown tool", () => {
    expect(getBundleForTool("nonexistent-tool")).toBeNull();
  });

  it("TOOL_BUNDLE_MAP has no undefined values", () => {
    for (const [tool, bundle] of Object.entries(TOOL_BUNDLE_MAP)) {
      expect(bundle, `Tool ${tool} has undefined bundle`).toBeDefined();
      expect(
        FEATURE_BUNDLES[bundle],
        `Bundle ${bundle} for tool ${tool} not in FEATURE_BUNDLES`,
      ).toBeDefined();
    }
  });

  it("every bundle id matches its key in FEATURE_BUNDLES", () => {
    for (const [key, bundle] of Object.entries(FEATURE_BUNDLES)) {
      expect(bundle.id).toBe(key);
    }
  });

  it("every bundle has a non-empty name and description", () => {
    for (const bundle of Object.values(FEATURE_BUNDLES)) {
      expect(bundle.name.length).toBeGreaterThan(0);
      expect(bundle.description.length).toBeGreaterThan(0);
    }
  });

  it("every bundle has at least one tool", () => {
    for (const [id, bundle] of Object.entries(FEATURE_BUNDLES)) {
      expect(bundle.enablesTools.length, `Bundle ${id} has no tools`).toBeGreaterThan(0);
    }
  });
});
