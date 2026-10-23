import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyBaseLogger } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../../../apps/api/src/config.js";

const qpdf = vi.hoisted(() => ({
  available: vi.fn(),
  check: vi.fn(),
  pageCount: vi.fn(),
  requiresPassword: vi.fn(),
}));

const fsPromisesSpy = vi.hoisted(() => ({
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  fsPromisesSpy.mkdir.mockImplementation((...args: Parameters<typeof actual.mkdir>) =>
    actual.mkdir(...args),
  );
  fsPromisesSpy.writeFile.mockImplementation((...args: Parameters<typeof actual.writeFile>) =>
    actual.writeFile(...args),
  );
  return {
    ...actual,
    mkdir: fsPromisesSpy.mkdir,
    writeFile: fsPromisesSpy.writeFile,
  };
});

vi.mock("@snapotter/doc-engine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@snapotter/doc-engine")>()),
  qpdfAvailable: qpdf.available,
  qpdfCheck: qpdf.check,
  qpdfPageCount: qpdf.pageCount,
  qpdfRequiresPassword: qpdf.requiresPassword,
}));

import { QpdfTimeoutError } from "@snapotter/doc-engine";
import { logger } from "../../../apps/api/src/lib/logger.js";
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

  it("rejects empty files and non-ZIP Office/EPUB files with plain-language messages", async () => {
    const handler = new DocumentInputHandler();

    await expect(handler.prepare(Buffer.alloc(0), "empty.pdf", { scratchDir })).rejects.toThrow(
      /empty \(0 bytes\)/i,
    );

    const emptyPath = join(scratchDir, "zero.pdf");
    writeFileSync(emptyPath, "");
    await expect(validatePdfPath(emptyPath)).rejects.toThrow(/empty \(0 bytes\)/i);

    await expect(
      handler.prepare(Buffer.from("not a zip"), "report.docx", { scratchDir }),
    ).rejects.toThrow(/couldn't be opened as an Office or EPUB document/i);
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

  it("scrubs internal scratch paths from qpdf stderr before slicing Damaged PDF errors (#2925)", async () => {
    const inputPath = join(scratchDir, "qpdf-1234", "input.pdf");
    const longPadding = "x".repeat(200);
    const leakedStderr = `qpdf exited 2: WARNING: ${inputPath}: ${longPadding}\nWARNING: ${inputPath}: trailing path`;
    const captureRejection = (promise: Promise<void>): Promise<Error> =>
      promise.then(
        (): Error => {
          throw new Error("expected rejection");
        },
        (e: unknown): Error => e as Error,
      );

    // 1. qpdfRequiresPassword failure
    const validHeaderPath = join(scratchDir, "damaged-pw.pdf");
    writeFileSync(validHeaderPath, "%PDF-path-backed");
    qpdf.requiresPassword.mockRejectedValueOnce(new Error(leakedStderr));
    const pwErr = await captureRejection(
      validatePdfPath(validHeaderPath, { rejectPasswordProtected: true }),
    );
    expect(pwErr.name).toBe("InputValidationError");
    expect(pwErr.message).toContain("Damaged PDF: qpdf exited 2: WARNING: [internal]");
    expect(pwErr.message).toContain("WARNING: [internal] trailing path");
    expect(pwErr.message).not.toContain(scratchDir);
    expect(pwErr.message).not.toContain(tmpdir());

    // 2. qpdfCheck failure
    qpdf.requiresPassword.mockResolvedValueOnce(false);
    qpdf.check.mockRejectedValueOnce(new Error(leakedStderr));
    const checkErr = await captureRejection(
      validatePdfPath(validHeaderPath, { rejectPasswordProtected: true }),
    );
    expect(checkErr.name).toBe("InputValidationError");
    expect(checkErr.message).toContain("Damaged PDF: qpdf exited 2: WARNING: [internal]");
    expect(checkErr.message).toContain("WARNING: [internal] trailing path");
    expect(checkErr.message).not.toContain(scratchDir);
    expect(checkErr.message).not.toContain(tmpdir());

    // 3. qpdfPageCount failure
    const originalMaxPages = env.MAX_PDF_PAGES;
    env.MAX_PDF_PAGES = 10;
    try {
      qpdf.requiresPassword.mockResolvedValueOnce(false);
      qpdf.check.mockResolvedValueOnce(undefined);
      qpdf.pageCount.mockRejectedValueOnce(new Error(leakedStderr));
      const pageCountErr = await captureRejection(
        validatePdfPath(validHeaderPath, { rejectPasswordProtected: true }),
      );
      expect(pageCountErr.name).toBe("InputValidationError");
      expect(pageCountErr.message).toContain("Damaged PDF: qpdf exited 2: WARNING: [internal]");
      expect(pageCountErr.message).toContain("WARNING: [internal] trailing path");
      expect(pageCountErr.message).not.toContain(scratchDir);
      expect(pageCountErr.message).not.toContain(tmpdir());
    } finally {
      env.MAX_PDF_PAGES = originalMaxPages;
    }
  });

  it("treats a qpdf check timeout as inconclusive and warns through the given logger (#1547)", async () => {
    const inputPath = join(scratchDir, "big-but-healthy.pdf");
    writeFileSync(inputPath, "%PDF-path-backed");
    qpdf.requiresPassword.mockResolvedValueOnce(false);
    qpdf.check.mockRejectedValueOnce(new QpdfTimeoutError("qpdf timed out after 30s"));
    const log = { warn: vi.fn() };
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      await expect(
        validatePdfPath(inputPath, { rejectPasswordProtected: true, log }),
      ).resolves.toBeUndefined();
      expect(log.warn).toHaveBeenCalledOnce();
      expect(log.warn.mock.calls[0][0]).toMatchObject({
        err: expect.objectContaining({ message: "qpdf timed out after 30s" }),
        filePath: inputPath,
        bytes: 16,
      });
      expect(log.warn.mock.calls[0][1]).toBe(
        "document-input: qpdf structural check timed out, skipping it",
      );
      // nothing bypasses pino any more
      expect(consoleWarn).not.toHaveBeenCalled();
    } finally {
      consoleWarn.mockRestore();
    }
  });

  it("forwards the request logger from prepare into the qpdf-timeout warn (#1547)", async () => {
    qpdf.requiresPassword.mockResolvedValueOnce(false);
    qpdf.check.mockRejectedValueOnce(new QpdfTimeoutError("qpdf timed out after 30s"));
    const warn = vi.fn();
    const log = { warn } as unknown as FastifyBaseLogger;
    const processWarn = vi.spyOn(logger, "warn").mockImplementation(() => {});

    try {
      await expect(
        new DocumentInputHandler().prepare(Buffer.from("%PDF-path-backed"), "big.pdf", {
          scratchDir,
          rejectPasswordProtected: true,
          log,
        }),
      ).resolves.toMatchObject({ filename: "big.pdf" });
      expect(warn).toHaveBeenCalledOnce();
      expect(warn.mock.calls[0][0]).toMatchObject({
        bytes: 16,
        filePath: expect.stringMatching(/qpdf-.*input\.pdf$/),
      });
      // it went to the caller's logger, not the process one
      expect(processWarn).not.toHaveBeenCalled();
    } finally {
      processWarn.mockRestore();
    }
  });

  it("falls back to the process logger for the timeout warn when no request logger is given", async () => {
    const inputPath = join(scratchDir, "big-but-healthy-2.pdf");
    writeFileSync(inputPath, "%PDF-path-backed");
    qpdf.requiresPassword.mockResolvedValueOnce(false);
    qpdf.check.mockRejectedValueOnce(new QpdfTimeoutError("qpdf timed out after 30s"));
    // mockImplementation keeps the call from building the real transport
    const processWarn = vi.spyOn(logger, "warn").mockImplementation(() => {});

    try {
      await expect(
        validatePdfPath(inputPath, { rejectPasswordProtected: true }),
      ).resolves.toBeUndefined();
      expect(processWarn).toHaveBeenCalledOnce();
      expect(processWarn.mock.calls[0][1]).toBe(
        "document-input: qpdf structural check timed out, skipping it",
      );
    } finally {
      processWarn.mockRestore();
    }
  });

  it("still enforces the page cap when the structural check timed out", async () => {
    const inputPath = join(scratchDir, "big-and-long.pdf");
    writeFileSync(inputPath, "%PDF-path-backed");
    qpdf.requiresPassword.mockResolvedValueOnce(false);
    qpdf.check.mockRejectedValueOnce(new QpdfTimeoutError("qpdf timed out after 30s"));
    qpdf.pageCount.mockResolvedValueOnce(11);
    const log = { warn: vi.fn() };
    const originalMaxPages = env.MAX_PDF_PAGES;
    env.MAX_PDF_PAGES = 10;

    try {
      await expect(
        validatePdfPath(inputPath, { rejectPasswordProtected: true, log }),
      ).rejects.toThrow(/11 pages.*maximum of 10/i);
      expect(log.warn).toHaveBeenCalledOnce();
    } finally {
      env.MAX_PDF_PAGES = originalMaxPages;
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

  it("reports a non-timeout qpdfPageCount failure as a 400 Damaged PDF (#2920)", async () => {
    const inputPath = join(scratchDir, "damaged-page-count.pdf");
    writeFileSync(inputPath, "%PDF-path-backed");
    qpdf.requiresPassword.mockResolvedValueOnce(false);
    qpdf.check.mockRejectedValueOnce(new QpdfTimeoutError("qpdf timed out after 30s"));
    qpdf.pageCount.mockRejectedValueOnce(
      new Error("qpdf exited 2: unable to find trailer dictionary"),
    );
    const log = { warn: vi.fn() };
    const originalMaxPages = env.MAX_PDF_PAGES;
    env.MAX_PDF_PAGES = 10;

    try {
      await expect(
        validatePdfPath(inputPath, { rejectPasswordProtected: true, log }),
      ).rejects.toMatchObject({
        name: "InputValidationError",
        statusCode: 400,
        message: expect.stringMatching(
          /Damaged PDF: qpdf exited 2: unable to find trailer dictionary/i,
        ),
      });

      qpdf.requiresPassword.mockResolvedValueOnce(false);
      qpdf.check.mockRejectedValueOnce(new QpdfTimeoutError("qpdf timed out after 30s"));
      qpdf.pageCount.mockRejectedValueOnce("non-error rejection");
      await expect(
        validatePdfPath(inputPath, { rejectPasswordProtected: true, log }),
      ).rejects.toMatchObject({
        name: "InputValidationError",
        statusCode: 400,
        message: "Damaged PDF: structural check failed",
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

  it("reports a non-zero qpdf crash from the password probe as a damaged PDF (#1331)", async () => {
    const inputPath = join(scratchDir, "crashes-requires-password.pdf");
    writeFileSync(inputPath, "%PDF-path-backed");
    qpdf.requiresPassword.mockRejectedValueOnce(
      new Error("qpdf exited 1: internal error reconstructing xref"),
    );

    await expect(
      validatePdfPath(inputPath, { rejectPasswordProtected: true }),
    ).rejects.toMatchObject({
      name: "InputValidationError",
      statusCode: 400,
      message: expect.stringMatching(
        /Damaged PDF: qpdf exited 1: internal error reconstructing xref/i,
      ),
    });
    expect(qpdf.check).not.toHaveBeenCalled();
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

  it("forwards AbortSignal to all three qpdf probes when provided (#3561)", async () => {
    const inputPath = join(scratchDir, "signal-forwarded.pdf");
    writeFileSync(inputPath, "%PDF-path-backed");
    const controller = new AbortController();
    qpdf.requiresPassword.mockResolvedValueOnce(false);
    qpdf.check.mockResolvedValueOnce(undefined);
    qpdf.pageCount.mockResolvedValueOnce(3);
    const originalMaxPages = env.MAX_PDF_PAGES;
    env.MAX_PDF_PAGES = 10;

    try {
      await expect(
        validatePdfPath(inputPath, {
          rejectPasswordProtected: true,
          signal: controller.signal,
        }),
      ).resolves.toBeUndefined();
    } finally {
      env.MAX_PDF_PAGES = originalMaxPages;
    }

    expect(qpdf.requiresPassword).toHaveBeenCalledWith(inputPath, {
      signal: controller.signal,
    });
    expect(qpdf.check).toHaveBeenCalledWith(inputPath, {
      signal: controller.signal,
    });
    expect(qpdf.pageCount).toHaveBeenCalledWith(inputPath, {
      signal: controller.signal,
    });
  });

  it("rethrows abort errors instead of wrapping them as Damaged PDF when qpdf probes are canceled mid-flight (#3561)", async () => {
    const inputPath = join(scratchDir, "canceled-mid-probe.pdf");
    writeFileSync(inputPath, "%PDF-path-backed");
    const originalMaxPages = env.MAX_PDF_PAGES;
    env.MAX_PDF_PAGES = 10;

    try {
      // 1. Aborted during qpdfRequiresPassword
      const pwController = new AbortController();
      const pwReason = new DOMException("Client disconnected", "AbortError");
      qpdf.requiresPassword.mockImplementationOnce(
        async (_path: string, opts?: { signal?: AbortSignal }) => {
          expect(opts?.signal).toBe(pwController.signal);
          pwController.abort(pwReason);
          throw new Error("Canceled");
        },
      );
      await expect(
        validatePdfPath(inputPath, {
          rejectPasswordProtected: true,
          signal: pwController.signal,
        }),
      ).rejects.toBe(pwReason);
      expect(qpdf.check).not.toHaveBeenCalled();

      // 2. Aborted during qpdfCheck
      const checkController = new AbortController();
      const checkReason = new DOMException("Job canceled", "AbortError");
      qpdf.requiresPassword.mockResolvedValueOnce(false);
      qpdf.check.mockImplementationOnce(async (_path: string, opts?: { signal?: AbortSignal }) => {
        expect(opts?.signal).toBe(checkController.signal);
        checkController.abort(checkReason);
        throw new Error("Canceled");
      });
      await expect(
        validatePdfPath(inputPath, {
          rejectPasswordProtected: true,
          signal: checkController.signal,
        }),
      ).rejects.toBe(checkReason);
      expect(qpdf.pageCount).not.toHaveBeenCalled();

      // 3. Aborted during qpdfPageCount
      const pageController = new AbortController();
      const pageReason = new DOMException("Timeout expired", "AbortError");
      qpdf.requiresPassword.mockResolvedValueOnce(false);
      qpdf.check.mockResolvedValueOnce(undefined);
      qpdf.pageCount.mockImplementationOnce(
        async (_path: string, opts?: { signal?: AbortSignal }) => {
          expect(opts?.signal).toBe(pageController.signal);
          pageController.abort(pageReason);
          throw new Error("Canceled");
        },
      );
      await expect(
        validatePdfPath(inputPath, {
          rejectPasswordProtected: true,
          signal: pageController.signal,
        }),
      ).rejects.toBe(pageReason);

      // 4. Direct AbortError / Canceled error from probe even without signal.aborted
      for (const abortErr of [
        Object.assign(new Error("The operation was aborted"), { name: "AbortError" }),
        new Error("Canceled"),
      ]) {
        qpdf.requiresPassword.mockRejectedValueOnce(abortErr);
        await expect(validatePdfPath(inputPath, { rejectPasswordProtected: true })).rejects.toBe(
          abortErr,
        );

        qpdf.requiresPassword.mockResolvedValueOnce(false);
        qpdf.check.mockRejectedValueOnce(abortErr);
        await expect(validatePdfPath(inputPath, { rejectPasswordProtected: true })).rejects.toBe(
          abortErr,
        );

        qpdf.requiresPassword.mockResolvedValueOnce(false);
        qpdf.check.mockResolvedValueOnce(undefined);
        qpdf.pageCount.mockRejectedValueOnce(abortErr);
        await expect(validatePdfPath(inputPath, { rejectPasswordProtected: true })).rejects.toBe(
          abortErr,
        );
      }

      // 5. Aborted signal takes precedence over QpdfTimeoutError and ENOMEM spawn failures
      vi.clearAllMocks();
      const raceController = new AbortController();
      const raceReason = new DOMException("Client disconnected during race", "AbortError");
      const warn = vi.fn();
      qpdf.requiresPassword.mockResolvedValueOnce(false);
      qpdf.check.mockImplementationOnce(async () => {
        raceController.abort(raceReason);
        throw new QpdfTimeoutError("qpdf timed out after 30s");
      });
      await expect(
        validatePdfPath(inputPath, {
          rejectPasswordProtected: true,
          signal: raceController.signal,
          log: { warn },
        }),
      ).rejects.toBe(raceReason);
      expect(warn).not.toHaveBeenCalled();
      expect(qpdf.pageCount).not.toHaveBeenCalled();

      vi.clearAllMocks();
      const sigkillController = new AbortController();
      const sigkillReason = new DOMException("Canceled before SIGKILL close", "AbortError");
      qpdf.requiresPassword.mockImplementationOnce(async () => {
        sigkillController.abort(sigkillReason);
        throw Object.assign(new Error("spawn /usr/bin/qpdf ENOMEM"), {
          code: "ENOMEM",
          syscall: "spawn",
          signal: "SIGKILL",
        });
      });
      await expect(
        validatePdfPath(inputPath, {
          rejectPasswordProtected: true,
          signal: sigkillController.signal,
        }),
      ).rejects.toBe(sigkillReason);
      expect(qpdf.check).not.toHaveBeenCalled();
    } finally {
      env.MAX_PDF_PAGES = originalMaxPages;
    }
  });

  it("forwards signal from DocumentInputHandler.prepare and cleans up scratch dir on abort (#3561)", async () => {
    const controller = new AbortController();
    const abortReason = new DOMException("Upload canceled", "AbortError");
    qpdf.requiresPassword.mockImplementationOnce(
      async (_path: string, opts?: { signal?: AbortSignal }) => {
        expect(opts?.signal).toBe(controller.signal);
        controller.abort(abortReason);
        throw new Error("Canceled");
      },
    );

    await expect(
      new DocumentInputHandler().prepare(Buffer.from("%PDF-path-backed"), "scan.pdf", {
        scratchDir,
        rejectPasswordProtected: true,
        signal: controller.signal,
      }),
    ).rejects.toBe(abortReason);
    expect(qpdf.check).not.toHaveBeenCalled();
    expect(readdirSync(scratchDir)).toEqual([]);
  });

  it("rejects immediately without creating a scratch file when signal is already aborted on strict PDFs (#3574)", async () => {
    const controller = new AbortController();
    const abortReason = new DOMException("Pre-aborted strict PDF", "AbortError");
    controller.abort(abortReason);

    await expect(
      new DocumentInputHandler().prepare(Buffer.from("%PDF-path-backed"), "scan.pdf", {
        scratchDir,
        rejectPasswordProtected: true,
        signal: controller.signal,
      }),
    ).rejects.toBe(abortReason);
    expect(fsPromisesSpy.mkdir).not.toHaveBeenCalled();
    expect(fsPromisesSpy.writeFile).not.toHaveBeenCalled();
    expect(qpdf.requiresPassword).not.toHaveBeenCalled();
    expect(qpdf.check).not.toHaveBeenCalled();
    expect(readdirSync(scratchDir)).toEqual([]);
  });

  it("passes signal to writeFile and cleans up scratch dir if writeFile aborts (#3574)", async () => {
    const controller = new AbortController();
    const input = Buffer.from("%PDF-path-backed");
    qpdf.requiresPassword.mockResolvedValueOnce(false);
    qpdf.check.mockResolvedValueOnce(undefined);

    await expect(
      new DocumentInputHandler().prepare(input, "scan.pdf", {
        scratchDir,
        rejectPasswordProtected: true,
        signal: controller.signal,
      }),
    ).resolves.toEqual({ buffer: input, filename: "scan.pdf" });
    expect(fsPromisesSpy.writeFile).toHaveBeenCalledWith(
      expect.stringMatching(/input\.pdf$/),
      input,
      {
        signal: controller.signal,
      },
    );

    // Simulate abort mid-writeFile via real node:fs/promises writeFile
    vi.clearAllMocks();
    const actualFs = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    const writeController = new AbortController();
    const writeAbortReason = new DOMException("Aborted during scratch write", "AbortError");
    fsPromisesSpy.writeFile.mockImplementationOnce(
      async (...args: Parameters<typeof actualFs.writeFile>) => {
        const options = args[2] as { signal?: AbortSignal } | undefined;
        expect(options?.signal).toBe(writeController.signal);
        writeController.abort(writeAbortReason);
        return actualFs.writeFile(...args);
      },
    );

    await expect(
      new DocumentInputHandler().prepare(input, "scan.pdf", {
        scratchDir,
        rejectPasswordProtected: true,
        signal: writeController.signal,
      }),
    ).rejects.toBe(writeAbortReason);
    expect(qpdf.requiresPassword).not.toHaveBeenCalled();
    expect(readdirSync(scratchDir)).toEqual([]);
  });

  it("rejects when signal is already aborted on lenient PDFs, unavailable qpdf, Office/EPUB, and passthrough files (#3574)", async () => {
    const handler = new DocumentInputHandler();

    // 1. Lenient PDF
    const lenientController = new AbortController();
    const lenientReason = new DOMException("Pre-aborted lenient PDF", "AbortError");
    lenientController.abort(lenientReason);
    await expect(
      handler.prepare(Buffer.from("%PDF-1.4 broken"), "broken.pdf", {
        scratchDir,
        lenient: true,
        signal: lenientController.signal,
      }),
    ).rejects.toBe(lenientReason);

    // 2. PDF when qpdf is unavailable
    qpdf.available.mockReturnValue(false);
    try {
      const noQpdfController = new AbortController();
      const noQpdfReason = new DOMException("Pre-aborted without qpdf", "AbortError");
      noQpdfController.abort(noQpdfReason);
      await expect(
        handler.prepare(Buffer.from("%PDF-1.4 valid"), "doc.pdf", {
          scratchDir,
          signal: noQpdfController.signal,
        }),
      ).rejects.toBe(noQpdfReason);
    } finally {
      qpdf.available.mockReturnValue(true);
    }

    // 3. Office/EPUB container
    const officeController = new AbortController();
    const officeReason = new DOMException("Pre-aborted docx", "AbortError");
    officeController.abort(officeReason);
    await expect(
      handler.prepare(Buffer.from("PK\x03\x04office"), "report.docx", {
        scratchDir,
        signal: officeController.signal,
      }),
    ).rejects.toBe(officeReason);

    // 4. Passthrough file (e.g. CSV)
    const passthroughController = new AbortController();
    const passthroughReason = new DOMException("Pre-aborted csv", "AbortError");
    passthroughController.abort(passthroughReason);
    await expect(
      handler.prepare(Buffer.from("a,b\n1,2\n"), "table.csv", {
        scratchDir,
        signal: passthroughController.signal,
      }),
    ).rejects.toBe(passthroughReason);

    expect(qpdf.requiresPassword).not.toHaveBeenCalled();
    expect(readdirSync(scratchDir)).toEqual([]);
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

  const expectEngineUnavailable = async (promise: Promise<unknown>, expectedCause?: unknown) => {
    const err = await promise.catch((e: unknown) => e);
    expect(err).toMatchObject({
      name: "InputValidationError",
      statusCode: 503,
      code: "ENGINE_UNAVAILABLE",
      ...(expectedCause !== undefined ? { cause: expectedCause } : {}),
    });
    expect((err as Error).message).toMatch(/qpdf/);
    expect((err as { details?: string }).details).toMatch(/QPDF_PATH/);
  };

  it.each(["ENOENT", "EACCES", "ENOEXEC", "ENOMEM"])(
    "reports a qpdf that cannot be started (%s) from the password probe as an unavailable engine",
    async (code) => {
      const inputPath = join(scratchDir, "fine.pdf");
      writeFileSync(inputPath, "%PDF-path-backed");
      const cause = spawnFailure(code);
      qpdf.requiresPassword.mockRejectedValueOnce(cause);

      await expectEngineUnavailable(
        validatePdfPath(inputPath, { rejectPasswordProtected: true }),
        cause,
      );
      expect(qpdf.check).not.toHaveBeenCalled();
    },
  );

  it.each(["ENOENT", "EACCES", "ENOEXEC", "ENOMEM"])(
    "does not blame the file when the structural check cannot start qpdf (%s)",
    async (code) => {
      const inputPath = join(scratchDir, "fine.pdf");
      writeFileSync(inputPath, "%PDF-path-backed");
      const cause = spawnFailure(code);
      qpdf.requiresPassword.mockResolvedValueOnce(false);
      qpdf.check.mockRejectedValueOnce(cause);

      await expectEngineUnavailable(
        validatePdfPath(inputPath, { rejectPasswordProtected: true }),
        cause,
      );
      expect(qpdf.pageCount).not.toHaveBeenCalled();
    },
  );

  it.each(["ENOENT", "EACCES", "ENOEXEC", "ENOMEM"])(
    "reports the page-count probe the same way (%s)",
    async (code) => {
      const inputPath = join(scratchDir, "fine.pdf");
      writeFileSync(inputPath, "%PDF-path-backed");
      const cause = spawnFailure(code);
      qpdf.requiresPassword.mockResolvedValueOnce(false);
      qpdf.check.mockResolvedValueOnce(undefined);
      qpdf.pageCount.mockRejectedValueOnce(cause);
      const original = env.MAX_PDF_PAGES;
      env.MAX_PDF_PAGES = 5;
      try {
        await expectEngineUnavailable(
          validatePdfPath(inputPath, { rejectPasswordProtected: true }),
          cause,
        );
      } finally {
        env.MAX_PDF_PAGES = original;
      }
    },
  );
});
