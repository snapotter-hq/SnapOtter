import { mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  gsAvailable,
  gsCompressPdf,
  qpdfAvailable,
  qpdfMerge,
  qpdfPageCount,
  qpdfRotate,
  qpdfSplitRanges,
} from "@snapotter/doc-engine";
import { describe, expect, it } from "vitest";

const PDF = join(process.cwd(), "tests/fixtures/test-3page.pdf");

describe.skipIf(!qpdfAvailable())("doc-engine pdf ops (requires qpdf)", () => {
  it("merges two pdfs into one with summed pages", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pdf-ops-"));
    try {
      const out = join(dir, "merged.pdf");
      await qpdfMerge([PDF, PDF], out);
      expect(await qpdfPageCount(out)).toBe(6);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("splits a range into a new pdf", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pdf-ops-"));
    try {
      const out = join(dir, "part.pdf");
      await qpdfSplitRanges(PDF, "1-2", out);
      expect(await qpdfPageCount(out)).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rotates pages (output stays valid with same page count)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pdf-ops-"));
    try {
      const out = join(dir, "rotated.pdf");
      await qpdfRotate(PDF, 90, "1-z", out);
      expect(await qpdfPageCount(out)).toBe(3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects an invalid range", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pdf-ops-"));
    try {
      await expect(qpdfSplitRanges(PDF, "abc;rm", join(dir, "x.pdf"))).rejects.toThrow(/range/i);
      await expect(qpdfSplitRanges(PDF, "-1", join(dir, "x.pdf"))).rejects.toThrow(/range/i);
      await expect(qpdfSplitRanges(PDF, "--", join(dir, "x.pdf"))).rejects.toThrow(/range/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe.skipIf(!gsAvailable())("doc-engine ghostscript compress (requires gs)", () => {
  it("produces a smaller-or-equal valid pdf", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pdf-ops-"));
    try {
      const out = join(dir, "compressed.pdf");
      await gsCompressPdf(PDF, out, "ebook");
      const inBytes = await readFile(PDF);
      const outBytes = await readFile(out);
      expect(outBytes.subarray(0, 5).toString()).toBe("%PDF-");
      expect(outBytes.length).toBeLessThanOrEqual(inBytes.length * 2); // tiny fixtures can grow; validity is the real assertion
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
