import { readdirSync } from "node:fs";
import { join } from "node:path";
import { TOOLS, toolSection } from "@snapotter/shared";
import { describe, expect, it } from "vitest";
import {
  formatBytes,
  sizeChange,
  TOOL_CONTENT,
  type ToolContent,
} from "../../../apps/landing/src/data/tool-content/index.js";
import { isNoindexPath } from "../../../apps/landing/src/lib/index-policy.js";

const CONTENT_DIR = join(__dirname, "../../../apps/landing/src/data/tool-content");
const entries = Object.values(TOOL_CONTENT);

function allStrings(content: ToolContent): string[] {
  return [
    content.testedWith,
    ...content.runs.flatMap((r) => [r.input, r.settings, r.output]),
    ...content.steps,
    ...content.limits,
    ...content.sources.flatMap((s) => [s.name, s.license]),
    ...(content.alternatives ? [content.alternatives.text, content.alternatives.sourceName] : []),
  ];
}

describe("landing first-hand tool content (#4911)", () => {
  it("registers every content module in the index", () => {
    const modules = readdirSync(CONTENT_DIR)
      .filter((f) => f.endsWith(".ts") && f !== "index.ts" && f !== "types.ts")
      .map((f) => f.replace(/\.ts$/, ""))
      .sort();
    expect(Object.keys(TOOL_CONTENT).sort()).toEqual(modules);
  });

  it("names a real tool whose page search engines may index", () => {
    for (const content of entries) {
      const tool = TOOLS.find((t) => t.id === content.toolId);
      expect(tool, content.toolId).toBeDefined();
      if (!tool) continue;
      // Content on a noindexed page earns nothing; add it to INDEXED_KEEP_PATHS first.
      expect(isNoindexPath(`/tools/${toolSection(tool)}/${tool.id}/`), tool.id).toBe(false);
    }
  });

  it("records a measured byte count for every run", () => {
    for (const content of entries) {
      expect(content.runs.length, content.toolId).toBeGreaterThan(0);
      for (const run of content.runs) {
        expect(Number.isSafeInteger(run.inputBytes) && run.inputBytes > 0, run.input).toBe(true);
        expect(Number.isSafeInteger(run.outputBytes) && run.outputBytes > 0, run.output).toBe(true);
      }
    }
  });

  it("gives steps, limits, a dated test note, and a licensed source for each tool", () => {
    for (const content of entries) {
      expect(content.steps.length, content.toolId).toBeGreaterThan(1);
      expect(content.limits.length, content.toolId).toBeGreaterThan(0);
      expect(content.testedWith, content.toolId).toMatch(/\d{4}-\d{2}-\d{2}/);
      expect(content.sources.length, content.toolId).toBeGreaterThan(0);
      for (const source of content.sources) {
        expect(source.url, content.toolId).toMatch(/^https:\/\//);
        expect(source.license.length, content.toolId).toBeGreaterThan(0);
      }
    }
  });

  it("cites the hosted alternative's own page with the date it was read", () => {
    for (const content of entries) {
      const note = content.alternatives;
      if (!note) continue;
      expect(note.sourceUrl, content.toolId).toMatch(/^https:\/\//);
      expect(note.checked, content.toolId).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(note.checked)), content.toolId).toBe(false);
    }
  });

  it("keeps dashes out of the visible copy", () => {
    for (const content of entries) {
      for (const text of allStrings(content)) {
        expect(text, content.toolId).not.toMatch(/[–—]| -- /);
      }
    }
  });
});

describe("formatBytes", () => {
  it("uses decimal units", () => {
    expect(formatBytes(1_651)).toBe("2 KB");
    expect(formatBytes(520_411)).toBe("520 KB");
    expect(formatBytes(4_815_461)).toBe("4.8 MB");
    expect(formatBytes(681_285_280)).toBe("681.3 MB");
    expect(formatBytes(999)).toBe("999 bytes");
    expect(formatBytes(999_499)).toBe("999 KB");
    expect(formatBytes(999_999)).toBe("1.0 MB");
  });
});

describe("sizeChange", () => {
  it("reports shrinkage and growth as a signed percentage", () => {
    expect(sizeChange(4_815_461, 520_411)).toBe("-89%");
    expect(sizeChange(14_621_544, 18_435_512)).toBe("+26%");
    expect(sizeChange(1_000, 1_001)).toBe("same size");
  });

  it("does not round a tiny extraction down to -100%", () => {
    expect(sizeChange(681_285_280, 1_651)).toBe("under 1% of input");
  });
});
