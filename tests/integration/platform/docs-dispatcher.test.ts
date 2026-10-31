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
import { fixtures } from "../../fixtures/index.js";
import { hasFitz, hasPikepdf, hasPython } from "../../helpers/python-gate.js";

// Ensure the bridge uses a reachable Python; set PYTHON_VENV_PATH before
// any import triggers a dispatcher spawn.
if (hasPython && !existsSync(join(process.cwd(), ".venv", "bin", "python3"))) {
  // Resolve the system python3 path to derive the venv prefix.
  const res = spawnSync("which", ["python3"], { encoding: "utf8" });
  if (res.status === 0 && res.stdout.trim()) {
    const parts = res.stdout.trim().split("/");
    process.env.PYTHON_VENV_PATH = parts.slice(0, -2).join("/");
  }
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
    const pages = await pdfPageCountPy(fixtures.document.pdf3);
    expect(pages).toBe(3);
  });

  it("metadata get/set roundtrip", async () => {
    const pdf = fixtures.document.pdf3;
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
    const pdf = fixtures.document.pdf3;
    const dir = mkdtempSync(join(tmpdir(), "text-"));
    try {
      const out = join(dir, "text.txt");
      const result = await pdfTextPy(pdf, out);
      expect(result.chars).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("aborts an in-flight docs wrapper while a concurrent sibling docs call survives via per-request fallback (#2733)", async () => {
    const pdf = fixtures.document.pdf3;
    const dir = mkdtempSync(join(tmpdir(), "concurrent-cancel-"));
    try {
      // Warm up the shared docs dispatcher so both concurrent calls enter dispatcherRun.
      const readyStatus = await getDocsDispatcher().init();
      expect(readyStatus.ready).toBe(true);

      const canceledAc = new AbortController();
      const siblingAc = new AbortController();
      const out1 = join(dir, "canceled.txt");
      const out2 = join(dir, "survived.txt");

      const canceledPromise = pdfTextPy(pdf, out1, { signal: canceledAc.signal });
      const siblingPromise = pdfTextPy(pdf, out2, { signal: siblingAc.signal });

      canceledAc.abort(new DOMException("The operation was aborted", "AbortError"));

      const [canceledSettled, siblingResult] = await Promise.all([
        canceledPromise.then(
          () => ({ ok: true as const }),
          (err: unknown) => ({ ok: false as const, err }),
        ),
        siblingPromise,
      ]);

      expect(canceledSettled.ok).toBe(false);
      if (!canceledSettled.ok) {
        expect((canceledSettled.err as Error).name).toBe("AbortError");
      }
      expect(siblingResult.chars).toBeGreaterThan(0);
      expect(getDocsDispatcher().getStatus().consecutiveCrashes).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
