import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  convertDocument,
  qpdfAvailable,
  qpdfCheck,
  qpdfPageCount,
  sofficeAvailable,
} from "@snapotter/doc-engine";
import { describe, expect, it } from "vitest";
import { fixtures } from "../../fixtures/index.js";

const PDF = fixtures.document.pdf3;
const DOCX = fixtures.document.tiny("docx");

describe.skipIf(!qpdfAvailable())("doc-engine qpdf (requires qpdf)", () => {
  it("counts pages", async () => {
    expect(await qpdfPageCount(PDF)).toBe(3);
  });

  it("passes a structural check on a valid pdf", async () => {
    await expect(qpdfCheck(PDF)).resolves.toBeUndefined();
  });

  it("rejects garbage", async () => {
    const dir = mkdtempSync(join(tmpdir(), "doc-engine-"));
    try {
      const bad = join(dir, "bad.pdf");
      writeFileSync(bad, "not a pdf at all");
      await expect(qpdfCheck(bad)).rejects.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe.skipIf(!sofficeAvailable())("doc-engine libreoffice (requires soffice)", () => {
  it("converts docx to pdf with an isolated profile", async () => {
    const dir = mkdtempSync(join(tmpdir(), "doc-engine-lo-"));
    try {
      const outPath = await convertDocument(DOCX, dir, "pdf", { timeoutMs: 120_000 });
      const bytes = await readFile(outPath);
      expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 150_000);
});
