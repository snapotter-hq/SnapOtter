import {
  FEATURE_BUNDLES,
  getBundleForTool,
  getOptionalBundleForTool,
  getRequiredBundlesForTool,
  getToolsForBundle,
  PYTHON_SIDECAR_TOOLS,
  TOOL_BUNDLE_MAP,
  TOOL_EXTRA_BUNDLES,
  TOOL_OPTIONAL_BUNDLE_MAP,
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

  it("all 8 bundles are defined", () => {
    expect(Object.keys(FEATURE_BUNDLES)).toHaveLength(8);
    expect(FEATURE_BUNDLES["background-removal"]).toBeDefined();
    expect(FEATURE_BUNDLES["face-detection"]).toBeDefined();
    expect(FEATURE_BUNDLES["object-eraser-colorize"]).toBeDefined();
    expect(FEATURE_BUNDLES["inpaint-hq"]).toBeDefined();
    expect(FEATURE_BUNDLES["upscale-enhance"]).toBeDefined();
    expect(FEATURE_BUNDLES["photo-restoration"]).toBeDefined();
    expect(FEATURE_BUNDLES.ocr).toBeDefined();
    expect(FEATURE_BUNDLES.transcription).toBeDefined();
  });

  it("every sidecar tool is reachable; only built-in-fast tools skip the required map", () => {
    const mappedTools = Object.keys(TOOL_BUNDLE_MAP);
    for (const toolId of PYTHON_SIDECAR_TOOLS) {
      // Reachable via a required primary and/or an optional upgrade pack.
      expect(
        getBundleForTool(toolId) !== null || getOptionalBundleForTool(toolId) !== null,
        `${toolId} has no bundle at all`,
      ).toBe(true);
      // A tool ABSENT from TOOL_BUNDLE_MAP must be a built-in-fast tool whose only
      // bundle is an optional pack (e.g. OCR's Fast tier + accurate pack). A tool
      // with a required base stays mapped even if it also has an optional upgrade
      // pack (e.g. erase-object's LaMa base + inpaint-hq diffusion pack).
      if (!mappedTools.includes(toolId)) {
        expect(
          getOptionalBundleForTool(toolId),
          `${toolId} is neither required-mapped nor a built-in-fast optional-pack tool`,
        ).not.toBeNull();
      }
    }
  });
});

describe("Feature bundle edge cases", () => {
  it("no tool appears in two non-optional bundles (an optional pack may re-list its tool)", () => {
    const firstBundle = new Map<string, string>();
    for (const bundle of Object.values(FEATURE_BUNDLES)) {
      for (const tool of bundle.enablesTools) {
        const prior = firstBundle.get(tool);
        if (prior === undefined) {
          firstBundle.set(tool, bundle.id);
          continue;
        }
        // The only allowed overlap: a tool's optional upgrade pack re-lists a
        // tool its primary bundle already enables (e.g. inpaint-hq over
        // erase-object). Any other pairing is an accidental duplicate.
        const optional = TOOL_OPTIONAL_BUNDLE_MAP[tool];
        expect(
          optional !== undefined && (prior === optional || bundle.id === optional),
          `Tool ${tool} appears in two non-optional bundles (${prior}, ${bundle.id})`,
        ).toBe(true);
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

describe("inpaint-hq optional upgrade for erase-object", () => {
  it("keeps object-eraser-colorize as the required primary; inpaint-hq stays optional", () => {
    // The HQ diffusion pack upgrades Object Eraser but must not gate it: the base
    // LaMa bundle remains the tool's required primary, and HQ is a separate,
    // explicit install check (mirrors OCR's Fast tier + optional accurate pack).
    expect(FEATURE_BUNDLES["inpaint-hq"]).toBeDefined();
    expect(TOOL_BUNDLE_MAP["erase-object"]).toBe("object-eraser-colorize");
    expect(TOOL_OPTIONAL_BUNDLE_MAP["erase-object"]).toBe("inpaint-hq");
    expect(getBundleForTool("erase-object")?.id).toBe("object-eraser-colorize");
    expect(getOptionalBundleForTool("erase-object")?.id).toBe("inpaint-hq");
    // erase-object must NOT require inpaint-hq (fast path works without it).
    expect(getRequiredBundlesForTool("erase-object")).toEqual(["object-eraser-colorize"]);
    expect(getRequiredBundlesForTool("erase-object")).not.toContain("inpaint-hq");
  });
});
