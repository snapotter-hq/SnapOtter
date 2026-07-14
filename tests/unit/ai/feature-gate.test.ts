import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  missingBundleForScript,
  SCRIPT_BUNDLE_MAP,
} from "../../../packages/ai/src/feature-gate.js";

let tempDir: string;
let savedDataDir: string | undefined;
let savedCwd: string;

beforeEach(() => {
  savedDataDir = process.env.DATA_DIR;
  savedCwd = process.cwd();
  tempDir = mkdtempSync(join(tmpdir(), "snapotter-gate-"));
  mkdirSync(join(tempDir, "ai"), { recursive: true });
  process.env.DATA_DIR = tempDir;
});

afterEach(() => {
  process.chdir(savedCwd);
  if (savedDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = savedDataDir;
  rmSync(tempDir, { recursive: true, force: true });
});

function setInstalled(bundleIds: string[]): void {
  const bundles: Record<string, { version: string; installedAt: string; models: string[] }> = {};
  for (const id of bundleIds) {
    bundles[id] = { version: "1.0.0-test", installedAt: "2026-01-01T00:00:00.000Z", models: [] };
  }
  writeFileSync(join(tempDir, "ai", "installed.json"), JSON.stringify({ bundles }), "utf-8");
}

describe("missingBundleForScript", () => {
  it("returns the bundle when a gated script's bundle is not installed", () => {
    setInstalled([]);
    expect(missingBundleForScript("face_landmarks")).toBe("face-detection");
    expect(missingBundleForScript("remove_bg")).toBe("background-removal");
  });

  it("returns null when the gated script's bundle is installed", () => {
    setInstalled(["face-detection"]);
    expect(missingBundleForScript("face_landmarks")).toBeNull();
  });

  it("handles a .py suffix", () => {
    setInstalled(["background-removal"]);
    expect(missingBundleForScript("remove_bg.py")).toBeNull();
    setInstalled([]);
    expect(missingBundleForScript("remove_bg.py")).toBe("background-removal");
  });

  it("returns null for ungated scripts", () => {
    setInstalled([]);
    expect(missingBundleForScript("doc_text")).toBeNull();
    expect(missingBundleForScript("unknown_script")).toBeNull();
  });

  it("does not gate built-in OCR through the legacy shared environment", () => {
    setInstalled([]);

    expect(SCRIPT_BUNDLE_MAP).not.toHaveProperty("ocr");
    expect(SCRIPT_BUNDLE_MAP).not.toHaveProperty("ocr_pdf");
    expect(missingBundleForScript("ocr")).toBeNull();
    expect(missingBundleForScript("ocr_pdf.py")).toBeNull();
  });

  it("fails closed when installed.json is missing", () => {
    // No setInstalled(): the file does not exist. Like the dispatcher, an
    // unreadable installed.json reads as "nothing installed", so a gated
    // script is blocked.
    expect(missingBundleForScript("face_landmarks")).toBe("face-detection");
  });

  it("fails closed when installed.json is corrupt", () => {
    writeFileSync(join(tempDir, "ai", "installed.json"), "{{{not json", "utf-8");
    expect(missingBundleForScript("face_landmarks")).toBe("face-detection");
  });

  it("gates both of passport-photo's scripts (issue #327)", () => {
    setInstalled(["background-removal"]); // face-detection still missing
    expect(missingBundleForScript("face_landmarks")).toBe("face-detection");
    expect(missingBundleForScript("remove_bg")).toBeNull();
  });

  it("uses the native ./data fallback when DATA_DIR is unset", () => {
    delete process.env.DATA_DIR;
    process.chdir(tempDir);
    const defaultAiDir = join(tempDir, "data", "ai");
    mkdirSync(defaultAiDir, { recursive: true });
    writeFileSync(
      join(defaultAiDir, "installed.json"),
      JSON.stringify({
        bundles: {
          "object-eraser-colorize": {
            version: "1.0.0-test",
            installedAt: "2026-01-01T00:00:00.000Z",
            models: [],
          },
        },
      }),
      "utf-8",
    );

    expect(missingBundleForScript("inpaint.py")).toBeNull();
  });
});

describe("SCRIPT_BUNDLE_MAP drift vs dispatcher.py", () => {
  it("matches TOOL_BUNDLE_MAP in dispatcher.py exactly", () => {
    const src = readFileSync(join(process.cwd(), "packages/ai/python/dispatcher.py"), "utf-8");
    const block = src.match(/TOOL_BUNDLE_MAP\s*=\s*\{([\s\S]*?)\}/);
    if (!block) throw new Error("TOOL_BUNDLE_MAP not found in dispatcher.py");

    const pythonMap: Record<string, string> = {};
    for (const entry of block[1].matchAll(/"(\w+)"\s*:\s*"([a-z0-9-]+)"/g)) {
      pythonMap[entry[1]] = entry[2];
    }

    // Both directions: the TS mirror must equal the Python source of truth.
    expect(pythonMap).toEqual(SCRIPT_BUNDLE_MAP);
  });
});
