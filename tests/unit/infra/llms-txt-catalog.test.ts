// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { CONVERSION_PRESET_BY_ID, SECTIONS, TOOLS, toolSection } from "@snapotter/shared";
import { describe, expect, it } from "vitest";

/**
 * Three llms.txt surfaces, all of which drifted:
 *
 * - apps/api/src/routes/docs.ts generates the served /llms.txt and had "241
 *   catalog tool routes" as a string literal, two behind the catalog.
 * - the repo-root llms.txt repeated the same 241 and listed image tool names
 *   from before the PR #520 renames, missing two tools outright.
 * - apps/landing/public/llms.txt is served from snapotter.com, so the "200+
 *   tools" invariant applies there and an exact count must never come back.
 */

const ROOT = path.resolve(__dirname, "../../..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

const CATALOG_NAMES = new Set(TOOLS.map((t) => t.name));

function sectionNames(sectionId: string) {
  const tools = TOOLS.filter((t) => toolSection(t) === sectionId);
  return {
    base: tools.filter((t) => !CONVERSION_PRESET_BY_ID[t.id]).map((t) => t.name),
    presets: tools.filter((t) => CONVERSION_PRESET_BY_ID[t.id]).map((t) => t.name),
  };
}

describe("served /llms.txt generator", () => {
  it("counts the catalog instead of quoting a number", () => {
    const src = read("apps/api/src/routes/docs.ts");
    const line = src.split("\n").find((l) => l.includes("catalog tool routes"));
    expect(line).toBeDefined();
    // Assembled rather than written inline so the linter does not read it as a
    // stray template placeholder in this file.
    const interpolation = ["$", "{", "TOOLS.length", "}"].join("");
    expect(line).toContain(interpolation);
    expect(line).not.toMatch(/\b\d{2,} catalog tool routes/);
  });
});

describe("repo-root llms.txt", () => {
  const text = read("llms.txt");

  it("quotes the live catalog size in both places", () => {
    const counts = [...text.matchAll(/(\d+)\s+(?:catalog tool routes|tool routes)/g)].map((m) =>
      Number(m[1]),
    );
    expect(counts.length).toBeGreaterThanOrEqual(2);
    expect([...new Set(counts)]).toEqual([TOOLS.length]);
  });

  it.each(SECTIONS.map((s) => s.id))("lists every %s tool by its catalog name", (sectionId) => {
    const section = SECTIONS.find((s) => s.id === sectionId);
    const heading = `### ${section?.name}\n\n`;
    const start = text.indexOf(heading);
    expect(start).toBeGreaterThan(-1);
    const body = text.slice(start + heading.length).split("\n")[0];
    const [basePart, presetPart = ""] = body.split(". Plus format converters:");
    const listed = (part: string) =>
      part
        .replace(/\.$/, "")
        .split(", ")
        .map((s) => s.trim())
        .filter(Boolean);

    const { base, presets } = sectionNames(sectionId);
    expect(listed(basePart)).toEqual(base);
    expect(listed(presetPart)).toEqual(presets);
  });

  it("names the Vite major the web app actually pins", () => {
    const major = JSON.parse(read("apps/web/package.json")).devDependencies.vite.match(/(\d+)/)[1];
    expect(text).toContain(`Vite ${major}`);
  });

  it("uses the same volume names as the canonical compose file", () => {
    // Docker volume names are case sensitive, so a lowercase copy silently
    // strands the reader's data in a second volume.
    const compose = read("docker/docker-compose.yml");
    for (const volume of ["SnapOtter-data", "SnapOtter-pgdata", "SnapOtter-redisdata"]) {
      expect(compose).toContain(volume);
      expect(text).toContain(volume);
      expect(text).not.toContain(volume.toLowerCase());
    }
  });
});

describe("landing llms.txt", () => {
  const text = read("apps/landing/public/llms.txt");

  /**
   * The landing copy groups and abbreviates on purpose, so a name here is
   * allowed to be a group label rather than a tool. Every entry below is a
   * deliberate label; a renamed tool that lands here is a bug, not a label.
   */
  const CURATED_LABELS = new Set([
    "Background Removal (rembg)",
    "Super-Resolution (RealESRGAN 2x/4x)",
    "Object Eraser (LaMa inpainting)",
    "local image/PDF OCR (Tesseract or RapidOCR with PP-OCR ONNX models)",
    "Speech Transcription (faster-whisper)",
    "Face Detection (MediaPipe)",
    "AI Canvas Expand (outpainting)",
  ]);

  const TOOL_LIST_PREFIXES = [
    "Core:",
    "Adjustments:",
    "AI-Powered:",
    "Watermark & Overlay:",
    "Analysis:",
    "Layout:",
    "PDF:",
    "Conversion:",
  ];

  /** Split on commas that sit outside a parenthetical, so "(2x/4x, RealESRGAN)" stays whole. */
  function splitTopLevel(list: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let current = "";
    for (const ch of list) {
      if (ch === "(") depth += 1;
      else if (ch === ")") depth -= 1;
      if (ch === "," && depth === 0) {
        parts.push(current);
        current = "";
        continue;
      }
      current += ch;
    }
    parts.push(current);
    return parts.map((p) => p.trim()).filter(Boolean);
  }

  function listedTools(): string[] {
    const out: string[] = [];
    for (const line of text.split("\n")) {
      const prefix = TOOL_LIST_PREFIXES.find((p) => line.startsWith(p));
      if (!prefix) continue;
      out.push(...splitTopLevel(line.slice(prefix.length).replace(/\.$/, "")));
    }
    return out;
  }

  it("collected the grouped tool lists", () => {
    expect(listedTools().length).toBeGreaterThan(60);
  });

  it("names tools the catalog still ships", () => {
    const unknown = listedTools().filter((entry) => {
      if (CURATED_LABELS.has(entry)) return false;
      // "Convert Image (JPEG/PNG/...)" is the catalog name plus a format hint.
      const bare = entry.replace(/\s*\([^)]*\)\s*$/, "").trim();
      return !CATALOG_NAMES.has(entry) && !CATALOG_NAMES.has(bare);
    });
    expect(unknown).toEqual([]);
  });

  it("keeps the 200+ phrasing and carries no exact tool count", () => {
    expect(text).toContain("200+ tools");
    // "200+" is the sanctioned phrasing; anything else counting tools or models
    // is a number that will be wrong by the next release.
    expect(text.replaceAll("200+ tools", "")).not.toMatch(/\b\d+\+? tools\b/);
    expect(text).not.toMatch(/\b\d+ (?:local )?AI models\b/);
  });
});
