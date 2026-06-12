import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDocsDispatcher, runDocsScript, shutdownDocsDispatcher } from "@snapotter/ai";
import {
  pdfMetadataGetPy,
  pdfMetadataSetPy,
  pdfPageCountPy,
  pdfTextPy,
} from "@snapotter/doc-engine";
import { afterAll, describe, expect, it } from "vitest";

/**
 * Resolve a Python 3 binary path that actually exists.
 * Checks the configured venv first, then falls back to system python3.
 * Returns null when no usable python3 is found.
 */
function resolvePython(): string | null {
  const venv = process.env.PYTHON_VENV_PATH || join(process.cwd(), ".venv");
  if (existsSync(`${venv}/bin/python3`)) return `${venv}/bin/python3`;
  // Fall back: find system python3 and derive a "venv" path the bridge accepts
  const res = spawnSync("which", ["python3"], { encoding: "utf8" });
  if (res.status === 0 && res.stdout.trim()) {
    const bin = res.stdout.trim();
    // python3 at /opt/homebrew/bin/python3 -> venv prefix = /opt/homebrew
    const parts = bin.split("/");
    if (parts.length >= 3) {
      const prefix = parts.slice(0, -2).join("/");
      if (existsSync(`${prefix}/bin/python3`)) return `${prefix}/bin/python3`;
    }
  }
  return null;
}

/** Check whether a Python module is importable by the resolved interpreter. */
function pythonWith(mod: string): boolean {
  if (!pythonBin) return false;
  const res = spawnSync(pythonBin, ["-c", `import ${mod}`], { encoding: "utf8" });
  return res.status === 0;
}

const pythonBin = resolvePython();
const hasPython = pythonBin !== null;
const hasPikepdf = hasPython && pythonWith("pikepdf");
const hasFitz = hasPython && pythonWith("fitz");

// Ensure the bridge uses a reachable Python; set PYTHON_VENV_PATH before
// any import triggers a dispatcher spawn.
if (hasPython && !existsSync(join(process.cwd(), ".venv", "bin", "python3"))) {
  const parts = (pythonBin ?? "").split("/");
  process.env.PYTHON_VENV_PATH = parts.slice(0, -2).join("/");
}

if (!hasPython) console.log("[docs-dispatcher] SKIP: no python3 found (venv or system)");
if (hasPython && !hasPikepdf)
  console.log("[docs-dispatcher] pikepdf not available; pikepdf tests will skip");
if (hasPython && !hasFitz)
  console.log("[docs-dispatcher] fitz (PyMuPDF) not available; fitz tests will skip");

afterAll(async () => {
  await shutdownDocsDispatcher();
});

describe.skipIf(!hasPython)("docs dispatcher health probe", () => {
  it("runs doc_health through the docs-profile dispatcher", async () => {
    const result = await runDocsScript("doc_health", {});
    const parsed = JSON.parse(result.trim());
    expect(parsed).toEqual({ ok: true });
  });

  it("getDocsDispatcher returns a PythonDispatcher instance", () => {
    const dispatcher = getDocsDispatcher();
    expect(dispatcher).toBeDefined();
    expect(typeof dispatcher.run).toBe("function");
    expect(typeof dispatcher.shutdown).toBe("function");
  });
});

describe.skipIf(!hasPikepdf)("docs dispatcher pikepdf (requires python + pikepdf)", () => {
  it("counts pdf pages through the docs profile", async () => {
    const pages = await pdfPageCountPy(join(process.cwd(), "tests/fixtures/test-3page.pdf"));
    expect(pages).toBe(3);
  });

  it("metadata get/set roundtrip", async () => {
    const pdf = join(process.cwd(), "tests/fixtures/test-3page.pdf");
    const dir = mkdtempSync(join(tmpdir(), "meta-"));
    try {
      const out = join(dir, "meta.pdf");
      await pdfMetadataSetPy(pdf, out, { Title: "Wave2" });
      const meta = await pdfMetadataGetPy(out);
      expect(meta.Title).toBe("Wave2");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe.skipIf(!hasFitz)("docs dispatcher fitz (requires python + PyMuPDF)", () => {
  it("extracts text with chars > 0", async () => {
    const pdf = join(process.cwd(), "tests/fixtures/test-3page.pdf");
    const dir = mkdtempSync(join(tmpdir(), "text-"));
    try {
      const out = join(dir, "text.txt");
      const result = await pdfTextPy(pdf, out);
      expect(result.chars).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
