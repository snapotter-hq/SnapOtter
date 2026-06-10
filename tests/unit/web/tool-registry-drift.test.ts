import { TOOLS } from "@snapotter/shared";
import { describe, expect, it } from "vitest";
import { TOOL_DISPLAY_MODES } from "@/lib/tool-display-modes";
import { toolRegistry } from "@/lib/tool-registry";

/**
 * Drift guards: the shared TOOLS catalog, the frontend registry, and the
 * display-mode map must always describe the same set of tools. A new tool
 * that misses one of the three fails here at PR time instead of shipping
 * a dead tool page.
 */
describe("tool registry drift", () => {
  it("every TOOLS entry has a frontend registry entry", () => {
    for (const tool of TOOLS) {
      expect(toolRegistry.has(tool.id), `tool "${tool.id}" missing from tool-registry.tsx`).toBe(
        true,
      );
    }
  });

  it("every TOOLS entry has a display mode", () => {
    for (const tool of TOOLS) {
      expect(
        TOOL_DISPLAY_MODES[tool.id],
        `tool "${tool.id}" missing from tool-display-modes.ts`,
      ).toBeTruthy();
    }
  });

  it("registry has no orphan entries (tools removed from TOOLS but not the registry)", () => {
    const ids = new Set(TOOLS.map((t) => t.id));
    for (const id of toolRegistry.keys()) {
      expect(ids.has(id), `registry entry "${id}" has no TOOLS definition`).toBe(true);
    }
  });

  it("display-mode map has no orphan entries", () => {
    const ids = new Set(TOOLS.map((t) => t.id));
    for (const id of Object.keys(TOOL_DISPLAY_MODES)) {
      expect(ids.has(id), `display-mode entry "${id}" has no TOOLS definition`).toBe(true);
    }
  });

  it("every registry entry has a Settings component and a valid display mode", () => {
    for (const [id, entry] of toolRegistry) {
      expect(entry.Settings, `tool "${id}" has no Settings component`).toBeTruthy();
      expect(entry.displayMode, `tool "${id}" has no displayMode`).toBe(TOOL_DISPLAY_MODES[id]);
    }
  });
});
