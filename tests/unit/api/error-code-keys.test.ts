// tests/unit/api/error-code-keys.test.ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { en, SUPPORTED_LOCALES, TRANSLATION_LOADERS } from "@snapotter/shared";
import { describe, expect, it } from "vitest";

const API_SRC = resolve(__dirname, "../../../apps/api/src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return name.endsWith(".ts") && !name.endsWith(".test.ts") ? [path] : [];
  });
}

// Every `code: "NAME"` literal the API can send, across all routes and helpers.
function emittedCodes(): Set<string> {
  const codes = new Set<string>();
  for (const file of sourceFiles(API_SRC)) {
    for (const match of readFileSync(file, "utf8").matchAll(/code: "([A-Z_]+)"/g)) {
      codes.add(match[1]);
    }
  }
  return codes;
}

describe("error code translation keys", () => {
  const keys = Object.keys(en.errors.codes);

  it("only lists codes the API actually emits", () => {
    const emitted = emittedCodes();
    const orphans = keys.filter((code) => !emitted.has(code));
    expect(orphans).toEqual([]);
  });

  it("has a translation for every code in every locale", async () => {
    for (const { code } of SUPPORTED_LOCALES) {
      if (code === "en") continue;
      const load = TRANSLATION_LOADERS[code];
      expect(load, `loader for ${code}`).toBeDefined();
      const translations = (await load()).errors.codes;
      for (const key of keys) {
        expect(translations[key as keyof typeof translations], `${code}.${key}`).toBeTruthy();
      }
    }
  });
});
