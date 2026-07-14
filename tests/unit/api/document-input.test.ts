import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../../../apps/api/src/config.js";

const qpdf = vi.hoisted(() => ({
  available: vi.fn(),
  check: vi.fn(),
  pageCount: vi.fn(),
  requiresPassword: vi.fn(),
}));

vi.mock("@snapotter/doc-engine", () => ({
  qpdfAvailable: qpdf.available,
  qpdfCheck: qpdf.check,
  qpdfPageCount: qpdf.pageCount,
  qpdfRequiresPassword: qpdf.requiresPassword,
}));

import {
  DocumentInputHandler,
  validatePdfPath,
} from "../../../apps/api/src/modality/document-input.js";

let scratchDir: string;

beforeEach(() => {
  vi.clearAllMocks();
  scratchDir = mkdtempSync(join(tmpdir(), "snapotter-document-input-"));
  qpdf.available.mockReturnValue(true);
  qpdf.requiresPassword.mockResolvedValue(true);
});

afterEach(() => {
  rmSync(scratchDir, { recursive: true, force: true });
});

describe("DocumentInputHandler password policy", () => {
  it("rejects an encrypted PDF when the consuming tool cannot accept a password", async () => {
    const handler = new DocumentInputHandler();

    await expect(
      handler.prepare(Buffer.from("%PDF-encrypted"), "scan.pdf", {
        scratchDir,
        rejectPasswordProtected: true,
      }),
    ).rejects.toThrow(/password-protected/i);
    expect(qpdf.check).not.toHaveBeenCalled();
  });

  it("preserves the existing policy for tools such as unlock-pdf", async () => {
    const handler = new DocumentInputHandler();
    const input = Buffer.from("%PDF-encrypted");

    await expect(handler.prepare(input, "scan.pdf", { scratchDir })).resolves.toEqual({
      buffer: input,
      filename: "scan.pdf",
    });
  });

  it("requires PDF magic for a PDF-only consumer regardless of the client filename", async () => {
    const handler = new DocumentInputHandler();

    await expect(
      handler.prepare(Buffer.from("not a PDF"), "renamed.txt", {
        scratchDir,
        rejectPasswordProtected: true,
      }),
    ).rejects.toThrow(/PDF header/i);
    expect(qpdf.requiresPassword).not.toHaveBeenCalled();
  });
});

describe("path-backed PDF validation", () => {
  it("runs structural, encryption, and page validation directly against the file path", async () => {
    const inputPath = join(scratchDir, "scan.pdf");
    writeFileSync(inputPath, "%PDF-path-backed");
    qpdf.requiresPassword.mockResolvedValueOnce(false);
    qpdf.pageCount.mockResolvedValueOnce(3);
    const originalMaxPages = env.MAX_PDF_PAGES;
    env.MAX_PDF_PAGES = 10;

    try {
      await expect(
        validatePdfPath(inputPath, { rejectPasswordProtected: true }),
      ).resolves.toBeUndefined();
    } finally {
      env.MAX_PDF_PAGES = originalMaxPages;
    }

    expect(qpdf.requiresPassword).toHaveBeenCalledWith(inputPath);
    expect(qpdf.check).toHaveBeenCalledWith(inputPath);
    expect(qpdf.pageCount).toHaveBeenCalledWith(inputPath);
  });

  it("enforces the PDF page cap without loading the file into a Buffer", async () => {
    const inputPath = join(scratchDir, "too-many-pages.pdf");
    writeFileSync(inputPath, "%PDF-path-backed");
    qpdf.requiresPassword.mockResolvedValueOnce(false);
    qpdf.pageCount.mockResolvedValueOnce(11);
    const originalMaxPages = env.MAX_PDF_PAGES;
    env.MAX_PDF_PAGES = 10;

    try {
      await expect(validatePdfPath(inputPath, { rejectPasswordProtected: true })).rejects.toThrow(
        /11 pages.*maximum of 10/i,
      );
    } finally {
      env.MAX_PDF_PAGES = originalMaxPages;
    }
  });

  it("reports qpdf structural failures as input validation errors", async () => {
    const inputPath = join(scratchDir, "damaged.pdf");
    writeFileSync(inputPath, "%PDF-path-backed");
    qpdf.requiresPassword.mockResolvedValueOnce(false);
    qpdf.check.mockRejectedValueOnce(new Error("xref table is corrupt"));

    await expect(validatePdfPath(inputPath, { rejectPasswordProtected: true })).rejects.toThrow(
      /Damaged PDF.*xref table is corrupt/i,
    );
    expect(qpdf.pageCount).not.toHaveBeenCalled();
  });

  it("stops before invoking qpdf when path validation is canceled", async () => {
    const inputPath = join(scratchDir, "canceled.pdf");
    writeFileSync(inputPath, "%PDF-canceled");
    const controller = new AbortController();
    controller.abort();

    await expect(
      validatePdfPath(inputPath, {
        rejectPasswordProtected: true,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(qpdf.requiresPassword).not.toHaveBeenCalled();
    expect(qpdf.check).not.toHaveBeenCalled();
  });
});
