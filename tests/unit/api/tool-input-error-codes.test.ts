// tests/unit/api/tool-input-error-codes.test.ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { en } from "@snapotter/shared";
import { describe, expect, it } from "vitest";

/**
 * The web app shows a ToolInputError's reason only through its `code`; one
 * thrown without a code reaches the user as the generic failure text (#4727).
 * So every `new ToolInputError(...)` in the API and the engines must pass one,
 * and a literal code must have a translation.
 */

const ROOT = resolve(__dirname, "../../..");
const SOURCES = [
  "apps/api/src",
  "packages/shared/src",
  "packages/doc-engine/src",
  "packages/image-engine/src",
  "packages/media-engine/src",
  "packages/ai/src",
].map((dir) => resolve(ROOT, dir));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return name.endsWith(".ts") && !name.endsWith(".test.ts") ? [path] : [];
  });
}

interface Site {
  where: string;
  args: string;
}

/** Every `new ToolInputError(...)` call with its argument text, parens balanced. */
function toolInputErrorSites(): Site[] {
  const opener = "new ToolInputError(";
  const sites: Site[] = [];
  for (const file of SOURCES.flatMap(sourceFiles)) {
    const source = readFileSync(file, "utf8");
    let start = source.indexOf(opener);
    while (start !== -1) {
      let end = start + opener.length;
      for (let depth = 1; depth > 0 && end < source.length; end++) {
        if (source[end] === "(") depth++;
        else if (source[end] === ")") depth--;
      }
      const line = source.slice(0, start).split("\n").length;
      sites.push({
        where: `${relative(ROOT, file)}:${line}`,
        args: source.slice(start + opener.length, end - 1),
      });
      start = source.indexOf(opener, end);
    }
  }
  return sites;
}

describe("ToolInputError codes", () => {
  const sites = toolInputErrorSites();

  it("finds the call sites it checks", () => {
    expect(sites.length).toBeGreaterThan(50);
  });

  it("gives every ToolInputError a code", () => {
    const uncoded = sites.filter(({ args }) => !/\bcode:/.test(args)).map(({ where }) => where);
    expect(uncoded, "pass { code } so the web app can translate the reason").toEqual([]);
  });

  it("translates every literal code a ToolInputError carries", () => {
    const keys = new Set(Object.keys(en.errors.codes));
    const untranslated = sites.flatMap(({ where, args }) => {
      const code = /\bcode:\s*"([A-Z_]+)"/.exec(args)?.[1];
      return code && !keys.has(code) ? [`${where} ${code}`] : [];
    });
    expect(untranslated, "add the code to errors.codes in every locale").toEqual([]);
  });
});
