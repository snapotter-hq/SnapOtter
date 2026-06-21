import { mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  pdfcpuAvailable,
  pdfcpuBooklet,
  pdfcpuCropMargin,
  pdfcpuNup,
  pdfcpuTextStamp,
} from "@snapotter/doc-engine";
import { describe, expect, it } from "vitest";
import { fixtures } from "../../fixtures/index.js";

const PDF = fixtures.document.pdf3;

// --- Gated integration tests: skip when pdfcpu is not installed locally ---
describe.skipIf(!pdfcpuAvailable())("doc-engine pdfcpu (requires pdfcpu binary)", () => {
  it("nup(2) reduces 3 pages to 2 sheets", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pdfcpu-"));
    try {
      const out = join(dir, "nup2.pdf");
      await pdfcpuNup(PDF, 2, out);
      const bytes = await readFile(out);
      expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("crop preserves page count", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pdfcpu-"));
    try {
      const out = join(dir, "cropped.pdf");
      await pdfcpuCropMargin(PDF, 20, out);
      const bytes = await readFile(out);
      expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("textStamp produces valid pdf output", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pdfcpu-"));
    try {
      const out = join(dir, "stamped.pdf");
      await pdfcpuTextStamp(
        PDF,
        { text: "CONFIDENTIAL", position: "c", fontSize: 24, opacity: 0.5, rotation: 45 },
        out,
      );
      const bytes = await readFile(out);
      expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("booklet produces valid pdf output", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pdfcpu-"));
    try {
      const out = join(dir, "booklet.pdf");
      await pdfcpuBooklet(PDF, 2, out);
      const bytes = await readFile(out);
      expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("textStamp with page numbers (%p/%P) produces valid output", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pdfcpu-"));
    try {
      const out = join(dir, "numbered.pdf");
      await pdfcpuTextStamp(
        PDF,
        { text: "Page %p of %P", position: "bc", fontSize: 10, opacity: 1, rotation: 0 },
        out,
      );
      const bytes = await readFile(out);
      expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// --- Ungated validation tests: run without the binary ---
describe("pdfcpu validation (no binary required)", () => {
  it("rejects invalid stamp position", async () => {
    await expect(
      pdfcpuTextStamp(
        "/fake.pdf",
        { text: "test", position: "xx", fontSize: 12, opacity: 0.5, rotation: 0 },
        "/out.pdf",
      ),
    ).rejects.toThrow(/position/i);
  });

  it("rejects empty stamp text", async () => {
    await expect(
      pdfcpuTextStamp(
        "/fake.pdf",
        { text: "", position: "c", fontSize: 12, opacity: 0.5, rotation: 0 },
        "/out.pdf",
      ),
    ).rejects.toThrow(/text/i);
  });

  it("rejects oversize stamp text (>200 chars)", async () => {
    await expect(
      pdfcpuTextStamp(
        "/fake.pdf",
        { text: "x".repeat(201), position: "c", fontSize: 12, opacity: 0.5, rotation: 0 },
        "/out.pdf",
      ),
    ).rejects.toThrow(/text/i);
  });

  it("rejects fontSize out of range", async () => {
    await expect(
      pdfcpuTextStamp(
        "/fake.pdf",
        { text: "test", position: "c", fontSize: 5, opacity: 0.5, rotation: 0 },
        "/out.pdf",
      ),
    ).rejects.toThrow(/font size/i);
    await expect(
      pdfcpuTextStamp(
        "/fake.pdf",
        { text: "test", position: "c", fontSize: 73, opacity: 0.5, rotation: 0 },
        "/out.pdf",
      ),
    ).rejects.toThrow(/font size/i);
  });

  it("rejects opacity out of range", async () => {
    await expect(
      pdfcpuTextStamp(
        "/fake.pdf",
        { text: "test", position: "c", fontSize: 12, opacity: 0.04, rotation: 0 },
        "/out.pdf",
      ),
    ).rejects.toThrow(/opacity/i);
    await expect(
      pdfcpuTextStamp(
        "/fake.pdf",
        { text: "test", position: "c", fontSize: 12, opacity: 1.1, rotation: 0 },
        "/out.pdf",
      ),
    ).rejects.toThrow(/opacity/i);
  });

  it("rejects rotation out of range", async () => {
    await expect(
      pdfcpuTextStamp(
        "/fake.pdf",
        { text: "test", position: "c", fontSize: 12, opacity: 0.5, rotation: -181 },
        "/out.pdf",
      ),
    ).rejects.toThrow(/rotation/i);
    await expect(
      pdfcpuTextStamp(
        "/fake.pdf",
        { text: "test", position: "c", fontSize: 12, opacity: 0.5, rotation: 181 },
        "/out.pdf",
      ),
    ).rejects.toThrow(/rotation/i);
  });

  it("rejects crop margin out of range", async () => {
    await expect(pdfcpuCropMargin("/fake.pdf", -1, "/out.pdf")).rejects.toThrow(/margin/i);
    await expect(pdfcpuCropMargin("/fake.pdf", 2001, "/out.pdf")).rejects.toThrow(/margin/i);
    await expect(pdfcpuCropMargin("/fake.pdf", NaN, "/out.pdf")).rejects.toThrow(/margin/i);
  });

  it("rejects invalid nup value", async () => {
    await expect(pdfcpuNup("/fake.pdf", 5 as never, "/out.pdf")).rejects.toThrow(/n-up/i);
    await expect(pdfcpuNup("/fake.pdf", 7 as never, "/out.pdf")).rejects.toThrow(/n-up/i);
  });

  it("rejects invalid booklet value", async () => {
    await expect(pdfcpuBooklet("/fake.pdf", 3 as never, "/out.pdf")).rejects.toThrow(/booklet/i);
    await expect(pdfcpuBooklet("/fake.pdf", 5 as never, "/out.pdf")).rejects.toThrow(/booklet/i);
  });
});
