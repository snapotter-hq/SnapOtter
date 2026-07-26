// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { SECTIONS, TOOLS, toolSection } from "@snapotter/shared";
import { describe, expect, it } from "vitest";

/**
 * README and DOCKERHUB carry the only exact numbers CLAUDE.md allows on a public
 * surface: per-section tool counts derived from toolSection(). Both had Image at
 * 105 against a live 107, DOCKERHUB had PDF at 28 against 29, both claimed 14
 * output formats against a convert enum of 17, and DOCKERHUB advertised
 * pipelines with unlimited steps against a Zod .max() of 20.
 *
 * The counts move on every tool added, so they get derived here rather than
 * restated. The headline claim stays "200+ tools" on both files.
 */

const ROOT = path.resolve(__dirname, "../../..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

const SURFACES = ["README.md", "DOCKERHUB.md"] as const;

/** README writes "Image (107)", DOCKERHUB writes "Documents / PDF (29)". */
const SECTION_LABELS: Record<string, RegExp> = {
  image: /\*\*Image \((\d+)\)/,
  video: /\*\*Video \((\d+)\)/,
  audio: /\*\*Audio \((\d+)\)/,
  pdf: /\*\*(?:Documents \/ )?PDF \((\d+)\)/,
  files: /\*\*Files \((\d+)\)/,
};

function liveSectionCount(sectionId: string): number {
  return TOOLS.filter((t) => toolSection(t) === sectionId).length;
}

/** The convert tool's output enum is the real answer to "how many output formats". */
function outputFormatCount(): number {
  const src = read("apps/api/src/routes/tools/convert.ts");
  const block = src.match(/format:\s*z\.enum\(\[([\s\S]*?)\]\)/);
  if (!block) throw new Error("could not read the convert output-format enum");
  return [...block[1].matchAll(/"([a-z0-9]+)"/g)].length;
}

/** MAX_PIPELINE_STEPS default, which routes/pipeline.ts feeds to a Zod .max(). */
function pipelineStepDefault(): number {
  const src = read("apps/api/src/lib/env.ts");
  const match = src.match(/MAX_PIPELINE_STEPS:\s*z\.coerce\.number\(\)\.default\((\d+)\)/);
  if (!match) throw new Error("could not read MAX_PIPELINE_STEPS from env.ts");
  return Number(match[1]);
}

describe("public per-section tool counts", () => {
  it("derived a plausible catalog", () => {
    const total = SECTIONS.reduce((n, s) => n + liveSectionCount(s.id), 0);
    expect(total).toBe(TOOLS.length);
    expect(SECTIONS.length).toBe(5);
  });

  it.each(SURFACES.flatMap((file) => SECTIONS.map((s) => [file, s.id] as const)))(
    "%s states the live %s count",
    (file, sectionId) => {
      const match = read(file).match(SECTION_LABELS[sectionId]);
      expect(match, `no ${sectionId} bullet in ${file}`).not.toBeNull();
      expect(Number(match?.[1])).toBe(liveSectionCount(sectionId));
    },
  );

  it.each(SURFACES)("%s keeps the 200+ headline and no exact total", (file) => {
    const text = read(file);
    expect(text).toContain("200+ tools");
    expect(text.replaceAll("200+ tools", "")).not.toMatch(/\b\d+\+? tools\b/);
  });
});

describe("public capability claims", () => {
  it.each(SURFACES)("%s states the live output-format count", (file) => {
    const match = read(file).match(/(\d+) output formats/);
    expect(match).not.toBeNull();
    expect(Number(match?.[1])).toBe(outputFormatCount());
  });

  it.each(SURFACES)("%s does not promise unlimited pipeline steps", (file) => {
    const text = read(file);
    const bullet = text.split("\n").find((l) => l.includes("**Pipelines:**"));
    expect(bullet).toBeDefined();
    expect(bullet?.toLowerCase()).not.toMatch(/unlimited steps/);
    expect(bullet).toContain(`${pipelineStepDefault()} steps`);
  });

  it("DOCKERHUB pins the tag examples to the released major", () => {
    const version = JSON.parse(read("package.json")).version as string;
    const [major, minor] = version.split(".");
    const text = read("DOCKERHUB.md");
    for (const tag of [version, `${major}.${minor}`, major]) {
      expect(text, `missing \`${tag}\` tag row`).toContain(`| \`${tag}\` |`);
    }
  });

  it("DOCKERHUB names the released version in its banner", () => {
    const version = JSON.parse(read("package.json")).version as string;
    const banner = read("DOCKERHUB.md")
      .split("\n")
      .find((l) => l.startsWith("> **SnapOtter"));
    expect(banner).toBeDefined();
    expect(banner).toContain(`\`${version}\``);
    expect(banner).toContain(`/tag/v${version}`);
  });
});
