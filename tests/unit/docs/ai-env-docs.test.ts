import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { SUPPORTED_LOCALES } from "../../../packages/shared/src/i18n/index.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

const inpaintSource = read("packages/ai/python/inpaint_hq.py");
const docsFor = (locale: string) =>
  read(
    locale === "en"
      ? "apps/docs/guide/configuration.md"
      : `apps/docs/${locale}/guide/configuration.md`,
  );

function row(doc: string, name: string): string {
  const line = doc.split("\n").find((l) => l.startsWith(`| \`${name}\` |`));
  expect(line, `no ${name} row`).toBeDefined();
  return line ?? "";
}

// #5384: these worked but appeared nowhere in the docs.
const AI_ENV = [
  "SNAPOTTER_GPU",
  "SD15_INPAINT_DIR",
  "SD15_INPAINT_STEPS",
  "SD15_INPAINT_STRENGTH",
  "SD15_INPAINT_GUIDANCE",
  "SD15_INPAINT_PROMPT",
  "SD15_INPAINT_NEGATIVE",
  "SD15_INPAINT_SEED",
] as const;

describe("AI environment variables are documented", () => {
  test.each(SUPPORTED_LOCALES.map((l) => l.code))("%s lists every variable", (locale) => {
    const doc = docsFor(locale);
    for (const name of AI_ENV) row(doc, name);
  });

  test("the SD15_INPAINT_* defaults match inpaint_hq.py", () => {
    const doc = docsFor("en");
    const defaults: Record<string, string> = {
      SD15_INPAINT_STEPS: "28",
      SD15_INPAINT_STRENGTH: "0.95",
      SD15_INPAINT_GUIDANCE: "7.0",
      SD15_INPAINT_SEED: "0",
    };
    for (const [name, value] of Object.entries(defaults)) {
      expect(inpaintSource, name).toContain(`"${name}", "${value}"`);
      expect(row(doc, name).split("|")[2]).toContain(`\`${value}\``);
    }
    const negative = /"SD15_INPAINT_NEGATIVE",\s*"([^"]+)"/.exec(inpaintSource)?.[1];
    expect(row(doc, "SD15_INPAINT_NEGATIVE")).toContain(`\`${negative}\``);
  });

  test("strength explains the direction", () => {
    expect(row(docsFor("en"), "SD15_INPAINT_STRENGTH")).toMatch(
      /Lower values keep more of the original pixels/,
    );
  });

  test("SNAPOTTER_GPU names the values that force the CPU", () => {
    const cell = row(docsFor("en"), "SNAPOTTER_GPU");
    for (const v of ["`0`", "`false`", "`no`"]) expect(cell).toContain(v);
  });
});
