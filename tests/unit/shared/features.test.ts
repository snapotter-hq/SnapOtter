import {
  FEATURE_BUNDLES,
  getBundleForTool,
  getOptionalBundleForTool,
  getRequiredBundlesForTool,
  getToolsForBundle,
  PYTHON_SIDECAR_TOOLS,
  TOOL_BUNDLE_MAP,
  TOOL_EXTRA_BUNDLES,
} from "@snapotter/shared";
import { describe, expect, it } from "vitest";

describe("Feature bundles", () => {
  it("every PYTHON_SIDECAR_TOOL maps to one mandatory or optional bundle", () => {
    for (const toolId of PYTHON_SIDECAR_TOOLS) {
      const bundle = getBundleForTool(toolId) ?? getOptionalBundleForTool(toolId);
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

  it("all 7 bundles are defined", () => {
    expect(Object.keys(FEATURE_BUNDLES)).toHaveLength(7);
    expect(FEATURE_BUNDLES["background-removal"]).toBeDefined();
    expect(FEATURE_BUNDLES["face-detection"]).toBeDefined();
    expect(FEATURE_BUNDLES["object-eraser-colorize"]).toBeDefined();
    expect(FEATURE_BUNDLES["upscale-enhance"]).toBeDefined();
    expect(FEATURE_BUNDLES["photo-restoration"]).toBeDefined();
    expect(FEATURE_BUNDLES.ocr).toBeDefined();
    expect(FEATURE_BUNDLES.transcription).toBeDefined();
  });

  it("TOOL_BUNDLE_MAP covers sidecar tools without an optional capability pack", () => {
    const mappedTools = Object.keys(TOOL_BUNDLE_MAP);
    for (const toolId of PYTHON_SIDECAR_TOOLS) {
      if (getOptionalBundleForTool(toolId)) {
        expect(
          mappedTools,
          `${toolId} must remain available without its optional pack`,
        ).not.toContain(toolId);
      } else {
        expect(mappedTools, `${toolId} missing from TOOL_BUNDLE_MAP`).toContain(toolId);
      }
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

describe("getRequiredBundlesForTool", () => {
  it("returns the primary bundle for a single-bundle tool", () => {
    expect(getRequiredBundlesForTool("remove-background")).toEqual(["background-removal"]);
  });

  it("returns [] for non-AI tools", () => {
    expect(getRequiredBundlesForTool("resize")).toEqual([]);
    expect(getRequiredBundlesForTool("nonexistent-tool")).toEqual([]);
  });

  it("includes the primary bundle plus extras for cross-bundle tools", () => {
    // Passport Photo runs face-landmark detection (face-detection) on top of
    // background removal (its primary bundle).
    expect(getRequiredBundlesForTool("passport-photo")).toEqual([
      "background-removal",
      "face-detection",
    ]);
  });

  it("lists the primary bundle first", () => {
    for (const toolId of PYTHON_SIDECAR_TOOLS) {
      const required = getRequiredBundlesForTool(toolId);
      if (required.length > 0) {
        expect(required[0]).toBe(TOOL_BUNDLE_MAP[toolId]);
      }
    }
  });

  it("never lists a bundle twice", () => {
    for (const toolId of PYTHON_SIDECAR_TOOLS) {
      const required = getRequiredBundlesForTool(toolId);
      expect(new Set(required).size).toBe(required.length);
    }
  });
});

describe("TOOL_EXTRA_BUNDLES", () => {
  it("references only real bundles and never the tool's own primary bundle", () => {
    for (const [toolId, extras] of Object.entries(TOOL_EXTRA_BUNDLES)) {
      const primary = TOOL_BUNDLE_MAP[toolId];
      for (const bundleId of extras) {
        expect(FEATURE_BUNDLES[bundleId], `Unknown extra bundle ${bundleId}`).toBeDefined();
        expect(bundleId, `${toolId} lists its primary bundle as an extra`).not.toBe(primary);
      }
    }
  });
});
