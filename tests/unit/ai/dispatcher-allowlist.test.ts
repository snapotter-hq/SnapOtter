import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pythonDir = resolve(__dirname, "../../../packages/ai/python");

function allowedScripts(): string[] {
  const source = readFileSync(resolve(pythonDir, "dispatcher.py"), "utf-8");
  const body = /^ALLOWED_SCRIPTS = \{([^}]*)\}/m.exec(source)?.[1];
  if (!body) throw new Error("ALLOWED_SCRIPTS literal not found in dispatcher.py");
  return [...body.matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]);
}

describe("sidecar ALLOWED_SCRIPTS (#4307)", () => {
  it("excludes install_feature, which must keep its install and venv locks", () => {
    // The installer is spawned directly by the install route. Through the
    // long-lived sidecar it would skip the install file lock and venv writer lock.
    expect(allowedScripts()).not.toContain("install_feature");
  });

  it("excludes ocr_preprocess, which nothing dispatches", () => {
    expect(allowedScripts()).not.toContain("ocr_preprocess");
    expect(existsSync(resolve(pythonDir, "ocr_preprocess.py"))).toBe(false);
  });

  it("only lists scripts that exist", () => {
    for (const name of allowedScripts()) {
      expect(existsSync(resolve(pythonDir, `${name}.py`)), `${name}.py is missing`).toBe(true);
    }
  });
});
