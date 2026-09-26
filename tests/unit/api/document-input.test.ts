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

vi.mock("@snapotter/doc-engine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@snapotter/doc-engine")>()),
  qpdfAvailable: qpdf.available,
  qpdfCheck: qpdf.check,
  qpdfPageCount: qpdf.pageCount,
  qpdfRequiresPassword: qpdf.requiresPassword,
}));

import { QpdfTimeoutError } from "@snapotter/doc-engine";
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

  it("treats a qpdf check timeout as inconclusive rather than damage", async () => {
    const inputPath = join(scratchDir, "big-but-healthy.pdf");
    writeFileSync(inputPath, "%PDF-path-backed");
    qpdf.requiresPassword.mockResolvedValueOnce(false);
    qpdf.check.mockRejectedValueOnce(new QpdfTimeoutError("qpdf timed out after 30s"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      await expect(
        validatePdfPath(inputPath, { rejectPasswordProtected: true }),
      ).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("timed out"));
    } finally {
      warn.mockRestore();
    }
  });

  it("still enforces the page cap when the structural check timed out", async () => {
    const inputPath = join(scratchDir, "big-and-long.pdf");
    writeFileSync(inputPath, "%PDF-path-backed");
    qpdf.requiresPassword.mockResolvedValueOnce(false);
    qpdf.check.mockRejectedValueOnce(new QpdfTimeoutError("qpdf timed out after 30s"));
    qpdf.pageCount.mockResolvedValueOnce(11);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const originalMaxPages = env.MAX_PDF_PAGES;
    env.MAX_PDF_PAGES = 10;

    try {
      await expect(validatePdfPath(inputPath, { rejectPasswordProtected: true })).rejects.toThrow(
        /11 pages.*maximum of 10/i,
      );
    } finally {
      env.MAX_PDF_PAGES = originalMaxPages;
      warn.mockRestore();
    }
  });

  it("fails closed with a clear error when the page-count probe times out under a page cap", async () => {
    const inputPath = join(scratchDir, "stalls-page-count.pdf");
    writeFileSync(inputPath, "%PDF-path-backed");
    qpdf.requiresPassword.mockResolvedValueOnce(false);
    qpdf.check.mockResolvedValueOnce(undefined);
    qpdf.pageCount.mockRejectedValueOnce(new QpdfTimeoutError("qpdf timed out after 30s"));
    const originalMaxPages = env.MAX_PDF_PAGES;
    env.MAX_PDF_PAGES = 10;

    try {
      await expect(
        validatePdfPath(inputPath, { rejectPasswordProtected: true }),
      ).rejects.toMatchObject({
        name: "InputValidationError",
        message: expect.stringMatching(/count this PDF's pages within the time limit/i),
      });
    } finally {
      env.MAX_PDF_PAGES = originalMaxPages;
    }
  });

  it("fails closed with a clear error when the password probe times out (#982)", async () => {
    const inputPath = join(scratchDir, "stalls-requires-password.pdf");
    writeFileSync(inputPath, "%PDF-path-backed");
    qpdf.requiresPassword.mockRejectedValueOnce(new QpdfTimeoutError("qpdf timed out after 30s"));

    await expect(
      validatePdfPath(inputPath, { rejectPasswordProtected: true }),
    ).rejects.toMatchObject({
      name: "InputValidationError",
      message: expect.stringMatching(/inspect this PDF within the time limit/i),
    });
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

/**
 * #1310: QPDF_PATH pointing at a missing or non-executable file makes
 * qpdfAvailable() true and every qpdf spawn reject with ENOENT. That is the
 * operator's container, not the caller's file, so it has to come back as a
 * 503 naming the variable rather than a masked 500 or a "Damaged PDF".
 */
describe("qpdf spawn failures", () => {
  const spawnFailure = (code = "ENOENT") =>
    Object.assign(new Error(`spawn /nonexistent/qpdf ${code}`), { code, syscall: "spawn" });

  const expectEngineUnavailable = async (promise: Promise<unknown>) => {
    const err = await promise.catch((e: unknown) => e);
    expect(err).toMatchObject({
      name: "InputValidationError",
      statusCode: 503,
      code: "ENGINE_UNAVAILABLE",
    });
    expect((err as Error).message).toMatch(/qpdf/);
    expect((err as { details?: string }).details).toMatch(/QPDF_PATH/);
  };

  it.each(["ENOENT", "EACCES"])(
    "reports a qpdf that cannot be started (%s) from the password probe as an unavailable engine",
    async (code) => {
      const inputPath = join(scratchDir, "fine.pdf");
      writeFileSync(inputPath, "%PDF-path-backed");
      qpdf.requiresPassword.mockRejectedValueOnce(spawnFailure(code));

      await expectEngineUnavailable(validatePdfPath(inputPath, { rejectPasswordProtected: true }));
      expect(qpdf.check).not.toHaveBeenCalled();
    },
  );

  it("does not blame the file when the structural check cannot start qpdf", async () => {
    const inputPath = join(scratchDir, "fine.pdf");
    writeFileSync(inputPath, "%PDF-path-backed");
    qpdf.requiresPassword.mockResolvedValueOnce(false);
    qpdf.check.mockRejectedValueOnce(spawnFailure());

    await expectEngineUnavailable(validatePdfPath(inputPath, { rejectPasswordProtected: true }));
    expect(qpdf.pageCount).not.toHaveBeenCalled();
  });

  it("reports the page-count probe the same way", async () => {
    const inputPath = join(scratchDir, "fine.pdf");
    writeFileSync(inputPath, "%PDF-path-backed");
    qpdf.requiresPassword.mockResolvedValueOnce(false);
    qpdf.check.mockResolvedValueOnce(undefined);
    qpdf.pageCount.mockRejectedValueOnce(spawnFailure());
    const original = env.MAX_PDF_PAGES;
    env.MAX_PDF_PAGES = 5;
    try {
      await expectEngineUnavailable(validatePdfPath(inputPath, { rejectPasswordProtected: true }));
    } finally {
      env.MAX_PDF_PAGES = original;
    }
  });
});
