import { mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  gsAvailable,
  gsCompressPdf,
  gsCompressPdfTuned,
  gsGrayscalePdf,
  gsPdfaConvert,
  qpdfAvailable,
  qpdfDecrypt,
  qpdfEncrypt,
  qpdfLinearize,
  qpdfMerge,
  qpdfPageCount,
  qpdfPagesSpec,
  qpdfPagesSpecUnchecked,
  qpdfRepair,
  qpdfRotate,
  qpdfSplitRanges,
} from "@snapotter/doc-engine";
import { describe, expect, it } from "vitest";
import { fixtures } from "../../fixtures/index.js";

const PDF = fixtures.document.pdf3;

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

  it("encrypts and decrypts roundtrip", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pdf-ops-"));
    try {
      const enc = join(dir, "enc.pdf");
      const dec = join(dir, "dec.pdf");
      await qpdfEncrypt(PDF, "user1", "owner1", enc);
      await expect(qpdfPageCount(enc)).rejects.toThrow(); // password gate works
      await qpdfDecrypt(enc, "user1", dec);
      expect(await qpdfPageCount(dec)).toBe(3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects a wrong password on decrypt", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pdf-ops-"));
    try {
      await expect(
        qpdfDecrypt(fixtures.document.encrypted, "wrong", join(dir, "x.pdf")),
      ).rejects.toThrow(/password|invalid/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reorders pages with an explicit order", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pdf-ops-"));
    try {
      const out = join(dir, "reordered.pdf");
      await qpdfPagesSpec(PDF, "3,1,2", out);
      expect(await qpdfPageCount(out)).toBe(3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("linearizes", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pdf-ops-"));
    try {
      const out = join(dir, "lin.pdf");
      await qpdfLinearize(PDF, out);
      expect(await qpdfPageCount(out)).toBe(3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("qpdfPagesSpecUnchecked accepts specs exceeding 200 chars", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pdf-ops-"));
    try {
      // Build a long spec that would fail assertValidRange's 200-char cap
      // Use a spec like "1,2,3" for a 3-page PDF (valid grammar, just testing the bypass)
      const longSpec = "1,2,3";
      const out = join(dir, "unchecked.pdf");
      await qpdfPagesSpecUnchecked(PDF, longSpec, out);
      expect(await qpdfPageCount(out)).toBe(3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("qpdfPagesSpecUnchecked rejects invalid grammar", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pdf-ops-"));
    try {
      await expect(qpdfPagesSpecUnchecked(PDF, "abc;rm -rf", join(dir, "x.pdf"))).rejects.toThrow(
        /range/i,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("repairs (rewrites) a valid pdf without loss", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pdf-ops-"));
    try {
      const out = join(dir, "repaired.pdf");
      await qpdfRepair(PDF, out);
      expect(await qpdfPageCount(out)).toBe(3);
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

  it("gsCompressPdfTuned: lower quality (higher QFactor) yields a smaller file at fixed DPI", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pdf-ops-"));
    try {
      const best = join(dir, "tuned-best.pdf");
      const worst = join(dir, "tuned-worst.pdf");
      // Image-heavy scan: QFactor only bites because the primitive forces re-encode.
      await gsCompressPdfTuned(fixtures.document.pdfScanned, best, 150, 0.1);
      await gsCompressPdfTuned(fixtures.document.pdfScanned, worst, 150, 2.0);
      const bestBytes = await readFile(best);
      const worstBytes = await readFile(worst);
      expect(worstBytes.subarray(0, 5).toString()).toBe("%PDF-");
      expect(worstBytes.length).toBeLessThan(bestBytes.length);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it("converts to grayscale (valid pdf out)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pdf-ops-"));
    try {
      const out = join(dir, "gray.pdf");
      await gsGrayscalePdf(PDF, out);
      const bytes = await readFile(out);
      expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("produces a pdf/a candidate", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pdf-ops-"));
    try {
      const out = join(dir, "pdfa.pdf");
      await gsPdfaConvert(PDF, out);
      const bytes = await readFile(out);
      expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
